// Walk the 7-step Chaos chain — only available to players who declared Non Serviam.
// Actions: list | advance
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface ChaosStep {
  index: number;
  title: string;
  objective: string;
  flavor: string;
  reward_gold: number;
  reward_xp: number;
  reward_merit: number;
}

const STEPS: ChaosStep[] = [
  { index: 1, title: "Burn the Veil",        objective: "Strike down at least 3 of the Veiled (any Speaker-cultist).", flavor: "Their hands hide their mouths. Free them.", reward_gold: 25, reward_xp: 60, reward_merit: 10 },
  { index: 2, title: "Whispers in the Tomb", objective: "Descend to **tomb-heart** beneath the desert.",                flavor: "The dead remember more than the Aethers do.", reward_gold: 20, reward_xp: 80, reward_merit: 10 },
  { index: 3, title: "Crack a Warden",       objective: "Strike down at least 1 Aether warden since your vow.",        flavor: "They will name you a curse — wear it.",        reward_gold: 50, reward_xp: 100, reward_merit: 15 },
  { index: 4, title: "Spread the Pressure",  objective: "Kill folk under three different town flags since your vow.",  flavor: "Pressure is the only word the Aethers fear.",   reward_gold: 60, reward_xp: 120, reward_merit: 20 },
  { index: 5, title: "Shadow's Pact",        objective: "Return to **tomb-heart** and accept the pact.",                flavor: "The unspoken takes a mouthful of you in payment.", reward_gold: 0,  reward_xp: 150, reward_merit: 25 },
  { index: 6, title: "Topple a Pillar",      objective: "Kill 6 wardens of a single chosen Aether.",                    flavor: "Twelve hands hold each throne. Break half.",    reward_gold: 100, reward_xp: 200, reward_merit: 30 },
  { index: 7, title: "Crown of Refusal",     objective: "Return to **gates-approach** and broadcast your name.",        flavor: "Non Serviam is no longer a cry — it is a country.", reward_gold: 200, reward_xp: 300, reward_merit: 50 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = (body?.action ?? "list") as "list" | "advance";
    const targetAether = body?.target_aether_key as string | undefined;

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);
    if (profile.faction !== "chaos")
      return json({ error: "You have not yet refused the Aethers." }, 400);

    // Ensure progress row.
    let { data: path } = await admin.from("chaos_path").select("*").eq("user_id", user.id).maybeSingle();
    if (!path) {
      const ins = await admin.from("chaos_path").insert({ user_id: user.id, step: 0, status: "active" }).select("*").maybeSingle();
      path = ins.data;
    }

    const currentIdx = Math.min(path!.step + 1, STEPS.length);
    const step = STEPS.find((s) => s.index === currentIdx)!;

    if (action === "list") {
      return json({
        path,
        steps: STEPS,
        current_step: path!.status === "complete" ? null : currentIdx,
        current: path!.status === "complete" ? null : step,
        canAdvance: path!.status === "active" ? await checkChaosStep(admin, user.id, profile, path!, step) : false,
      });
    }

    if (path!.status !== "active") return json({ error: "Your refusal is already crowned." }, 400);

    if (action === "advance") {
      // Step 6 requires picking an aether the first time.
      if (step.index === 6 && !path!.target_aether_key) {
        if (!targetAether) return json({ error: "Choose an Aether to topple (pass target_aether_key)." }, 400);
        await admin.from("chaos_path").update({ target_aether_key: targetAether }).eq("user_id", user.id);
        path!.target_aether_key = targetAether;
      }

      const ok = await checkChaosStep(admin, user.id, profile, path!, step);
      if (!ok) return json({ error: `Not yet: ${step.objective}` }, 400);

      const isFinal = step.index >= STEPS.length;
      await admin.from("chaos_path").update({
        step: step.index,
        status: isFinal ? "complete" : "active",
        completed_at: isFinal ? new Date().toISOString() : null,
        last_advanced_at: new Date().toISOString(),
      }).eq("user_id", user.id);

      // Step 5: shadow's pact — cost a mouthful of you.
      const updates: Record<string, unknown> = {
        gold: (profile.gold ?? 0) + step.reward_gold,
        xp: (profile.xp ?? 0) + step.reward_xp,
        merit: (profile.merit ?? 0) + step.reward_merit,
      };
      if (step.index === 5) updates.corruption = Math.min(100, (profile.corruption ?? 0) + 10);
      await admin.from("profiles").update(updates).eq("id", user.id);

      await admin.from("world_events").insert({
        kind: isFinal ? "chaos_complete" : "chaos_step",
        actor_id: user.id, actor_name: profile.username,
        room: profile.current_room,
        target_kind: "chaos", target_name: `step-${step.index}`,
        details: { step: step.index, title: step.title, flavor: step.flavor },
      });

      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: "—", kind: "system",
        content: isFinal
          ? `**${profile.username}** lifts their head at the gates and the seven flags above them shudder. The Crown of Refusal is set. The world will not be the same.`
          : `**${profile.username}** advances the chain of Refusal — *${step.title}*. Somewhere, an Aether feels the tug.`,
      });

      return json({ ok: true, completed_step: step.index, isFinal });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

async function checkChaosStep(
  admin: ReturnType<typeof createClient>,
  userId: string,
  profile: { current_room: string; non_serviam_at?: string | null },
  path: { target_aether_key?: string | null },
  step: ChaosStep,
): Promise<boolean> {
  const since = profile.non_serviam_at ?? new Date(0).toISOString();
  switch (step.index) {
    case 1: { // ≥3 Veiled kills since vow
      const { data: events } = await admin.from("world_events")
        .select("target_id")
        .eq("actor_id", userId).eq("kind", "npc_killed").gte("created_at", since)
        .limit(200);
      if (!events?.length) return false;
      const ids = events.map((e: { target_id: string | null }) => e.target_id).filter(Boolean);
      if (ids.length === 0) return false;
      const { count } = await admin.from("npcs")
        .select("id", { count: "exact", head: true })
        .in("id", ids).or("persona.ilike.%veiled%,name.ilike.%veiled%,title.ilike.%veiled%");
      return (count ?? 0) >= 3;
    }
    case 2: return profile.current_room === "tomb-heart";
    case 3: { // any warden kill since vow
      const { data: events } = await admin.from("world_events")
        .select("target_id").eq("actor_id", userId).eq("kind", "npc_killed").gte("created_at", since).limit(200);
      const ids = (events ?? []).map((e: { target_id: string | null }) => e.target_id).filter(Boolean);
      if (ids.length === 0) return false;
      const { count } = await admin.from("npcs")
        .select("id", { count: "exact", head: true }).in("id", ids).eq("is_warden", true);
      return (count ?? 0) >= 1;
    }
    case 4: { // ≥3 distinct town_keys with npc kills
      const { data: events } = await admin.from("world_events")
        .select("target_id").eq("actor_id", userId).eq("kind", "npc_killed").gte("created_at", since).limit(500);
      const ids = (events ?? []).map((e: { target_id: string | null }) => e.target_id).filter(Boolean);
      if (ids.length === 0) return false;
      const { data: npcs } = await admin.from("npcs").select("id, home_room").in("id", ids);
      const homes = (npcs ?? []).map((n: { home_room: string | null }) => n.home_room).filter(Boolean);
      if (homes.length === 0) return false;
      const { data: rooms } = await admin.from("rooms").select("slug, town_key").in("slug", homes);
      const towns = new Set((rooms ?? []).map((r: { town_key: string | null }) => r.town_key).filter(Boolean));
      return towns.size >= 3;
    }
    case 5: return profile.current_room === "tomb-heart";
    case 6: { // 6 wardens of chosen aether
      if (!path.target_aether_key) return false;
      const { data: events } = await admin.from("world_events")
        .select("target_id").eq("actor_id", userId).eq("kind", "npc_killed").gte("created_at", since).limit(500);
      const ids = (events ?? []).map((e: { target_id: string | null }) => e.target_id).filter(Boolean);
      if (ids.length === 0) return false;
      const { count } = await admin.from("npcs")
        .select("id", { count: "exact", head: true })
        .in("id", ids).eq("is_warden", true).eq("aether_key", path.target_aether_key);
      return (count ?? 0) >= 6;
    }
    case 7: return profile.current_room === "gates-approach";
    default: return false;
  }
}
