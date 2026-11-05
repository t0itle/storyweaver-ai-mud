// The Seven: one Aether wakes, reads a digest of its kingdom and issues decrees
// (docs/npc-agents.md §6.2). Called by world-tick with the service-role key.
// At most one god per 24h/7, so about seven large-model calls per day for the whole world.
// The model only chooses; _shared/decrees.ts validates and this function applies.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  extractJson, godDigestText, godSystemPrompt, pickGod, validateDecrees, type Decree, type KingdomDigest,
} from "../_shared/decrees.ts";
import { chat } from "../_shared/aiGateway.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const DAY = 86_400_000;
const MAX_SUMMONED = 10;   // sworn players written to per summons
const MAX_RUMORED = 8;     // subjects who hear a rumor directly

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json({ error: "forbidden" }, 403);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const now = new Date();
    const nowIso = now.toISOString();

    const { data: aethers } = await admin.from("aethers")
      .select("key, name, alive, well_room, throne_room, last_decree_at");
    const god = pickGod(aethers ?? [], now);
    if (!god) return json({ ok: true, skipped: "not yet" });
    const aether = (aethers ?? []).find((a: any) => a.key === god.key)!;

    // Claim the turn before calling the model, so a failing call can't be retried every hour.
    await admin.from("aethers").update({ last_decree_at: nowIso }).eq("key", aether.key);

    // ---- the kingdom ----
    const { data: capital } = await admin.from("rooms").select("slug, name, town_key").eq("slug", aether.well_room).maybeSingle();
    if (!capital?.town_key) return json({ ok: false, aether: aether.key, error: "no kingdom (well room has no town)" });
    const { data: kRooms } = await admin.from("rooms").select("slug").eq("town_key", capital.town_key);
    const roomSlugs = (kRooms ?? []).map((r: any) => r.slug);

    const [{ data: subjects }, { data: events }, { count: sworn }, { count: forsaken }, { data: ownLaws }, { data: rivals }] = await Promise.all([
      admin.from("npc_state").select("npc_id, mood, wants, goals, npcs!inner(id, name, title, room)")
        .in("npcs.room", roomSlugs).limit(25),
      admin.from("world_events").select("kind").in("room", roomSlugs).gte("created_at", new Date(now.getTime() - DAY).toISOString()).limit(500),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("aether", aether.key),
      admin.from("profiles").select("id", { count: "exact", head: true }).not("non_serviam_at", "is", null),
      admin.from("aether_decrees").select("payload").eq("aether_key", aether.key).eq("kind", "law").gt("expires_at", nowIso),
      admin.from("aether_decrees").select("aether_key, kind, payload, proclamation").neq("aether_key", aether.key)
        .order("created_at", { ascending: false }).limit(3),
    ]);
    const eventCounts: Record<string, number> = {};
    for (const e of events ?? []) eventCounts[e.kind] = (eventCounts[e.kind] ?? 0) + 1;

    const digest: KingdomDigest = {
      aetherKey: aether.key, aetherName: aether.name.split(",")[0], capitalName: capital.name,
      agents: (subjects ?? []).map((s: any) => ({
        id: s.npc_id, name: s.npcs.name, title: s.npcs.title, mood: s.mood,
        wants: (s.wants ?? []).map((w: any) => w.text), goals: (s.goals ?? []).map((g: any) => g.text),
      })),
      eventCounts, swornPlayers: sworn ?? 0, forsakenPlayers: forsaken ?? 0,
      activeLaws: (ownLaws ?? []).map((l: any) => l.payload?.text).filter(Boolean),
      rivalDecrees: (rivals ?? []).map((r: any) => `${r.aether_key} ${r.kind}${r.proclamation ? `: ${r.proclamation}` : ""}`),
    };

    // ---- the god speaks ----
    const reply = await chat(godSystemPrompt(digest), godDigestText(digest));
    const kingdomIds = new Set(digest.agents.map((a) => a.id));
    const { proclamation, decrees, rejected } = validateDecrees(extractJson(reply), kingdomIds);
    if (rejected.length) console.warn(`[seven-tick] ${aether.key} rejected:`, rejected);

    // ---- apply ----
    const source = `aether:${aether.key}`;
    const subjectIds = [...kingdomIds];
    const journal = (npcIds: string[], kind: string, summary: string, importance: number) =>
      npcIds.length ? admin.from("npc_journal").insert(npcIds.map((id) => ({
        npc_id: id, kind, subject_kind: "aether", subject_id: aether.key, summary, importance, disclosure: 0, source,
      }))) : Promise.resolve();

    for (const d of decrees as Decree[]) {
      let expires: string | null = null;
      if (d.type === "set_goal") {
        const { data: st } = await admin.from("npc_state").select("goals").eq("npc_id", d.npc_id).maybeSingle();
        const goals = [...(st?.goals ?? []), { text: d.goal, from: source, until: new Date(now.getTime() + 7 * DAY).toISOString() }].slice(-3);
        await admin.from("npc_state").update({ goals, updated_at: nowIso }).eq("npc_id", d.npc_id);
        await journal([d.npc_id], "decree", `${digest.aetherName} charged me: ${d.goal}`, 4);
      } else if (d.type === "rumor") {
        await journal(subjectIds.slice(0, MAX_RUMORED), "rumor", `Word going around: ${d.text}`, 2);
        await admin.from("messages").insert({ room: capital.slug, user_id: null, author_name: "—", kind: "ambient", content: `*Whispers pass through ${capital.name}: ${d.text}*` });
      } else if (d.type === "festival") {
        const { data: sts } = await admin.from("npc_state").select("npc_id, needs").in("npc_id", subjectIds);
        for (const st of sts ?? []) {
          const n = st.needs ?? {};
          await admin.from("npc_state").update({ needs: { ...n, belonging: 100, faith: Math.min(100, (n.faith ?? 70) + 20) } }).eq("npc_id", st.npc_id);
        }
        await journal(subjectIds, "decree", `${digest.aetherName} declared a festival.`, 2);
      } else if (d.type === "law") {
        expires = new Date(now.getTime() + d.days * DAY).toISOString();
        await journal(subjectIds, "decree", `New law from ${digest.aetherName} for ${d.days} days: ${d.text}`, 3);
      } else if (d.type === "summon_sworn") {
        const { data: faithful } = await admin.from("profiles").select("id").eq("aether", aether.key).limit(MAX_SUMMONED);
        if (faithful?.length) {
          await admin.from("player_letters").insert(faithful.map((p: any) => ({
            user_id: p.id, from_npc_id: null, from_name: digest.aetherName,
            subject: `A summons from ${digest.aetherName}`, body: d.task,
          })));
        }
      } else if (d.type === "bond") {
        await admin.from("npc_relations").upsert([
          { npc_id: d.npc_a, other_kind: "npc", other_id: d.npc_b, affinity: d.affinity, label: d.label, notes: `bound by ${digest.aetherName}`, updated_at: nowIso },
          { npc_id: d.npc_b, other_kind: "npc", other_id: d.npc_a, affinity: d.affinity, label: d.label, notes: `bound by ${digest.aetherName}`, updated_at: nowIso },
        ], { onConflict: "npc_id,other_kind,other_id" });
      }
      const { type, ...payload } = d;
      await admin.from("aether_decrees").insert({ aether_key: aether.key, kind: type, payload, proclamation, expires_at: expires });
    }

    if (proclamation) {
      const line = `✦ ${digest.aetherName} decrees: ${proclamation}`;
      const rooms = [...new Set([aether.throne_room, capital.slug].filter(Boolean))];
      await admin.from("messages").insert(rooms.map((room) => ({ room, user_id: null, author_name: "—", kind: "system", content: line })));
    }

    return json({ ok: true, aether: aether.key, decrees: decrees.length, rejected: rejected.length });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
