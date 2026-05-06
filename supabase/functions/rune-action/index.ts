import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Blessings are very hard to acquire — by rarity tier.
const COST_BY_RARITY: Record<string, { gold: number; merit: number }> = {
  common:    { gold: 200, merit: 5 },
  uncommon:  { gold: 600, merit: 15 },
  rare:      { gold: 1500, merit: 35 },
  legendary: { gold: 4000, merit: 80 },
};

type Body = {
  action: "learn" | "weave" | "unweave" | "recharge";
  rune_key?: string;
  npc_id?: string;
  player_item_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return ok({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ok({ error: "Unauthorized" }, 401);

    const body = await req.json() as Body;
    const { action } = body;

    if (action === "learn") {
      if (!body.rune_key) throw new Error("rune_key required");
      const raw = body.rune_key.toLowerCase().trim();
      const normalized = raw.replace(/\s+/g, "-");
      const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const target = slug(raw);
      // Try by exact key, normalized, name (case-insensitive), then loose slug match across all.
      let { data: rune } = await admin.from("runes").select("*").eq("key", normalized).maybeSingle();
      if (!rune) {
        const { data: byName } = await admin.from("runes").select("*").ilike("name", raw).maybeSingle();
        rune = byName ?? null;
      }
      if (!rune) {
        const { data: all } = await admin.from("runes").select("*");
        rune = (all ?? []).find(r => slug(r.key) === target || slug(r.name) === target) ?? null;
      }
      if (!rune) {
        const { data: all } = await admin.from("runes").select("key,name");
        const known = (all ?? []).map(r => r.name).join(", ");
        throw new Error(`No such rune. Known runes: ${known}.`);
      }

      const { data: profile } = await admin.from("profiles").select("current_room,gold,username").eq("id", user.id).maybeSingle();
      if (!profile) throw new Error("Profile missing");

      // Must be in same room as a teacher NPC for this rune
      if (!rune.teacher_npc) throw new Error(`The ${rune.name} rune is not taught by any living tongue.`);
      const { data: teacher } = await admin.from("npcs").select("*").eq("id", rune.teacher_npc).maybeSingle();
      if (!teacher) throw new Error("Teacher missing");
      if (teacher.room !== profile.current_room) throw new Error(`You must stand before ${teacher.name} to learn ${rune.name}.`);

      const cost = TEACH_COST[rune.key] ?? 50;
      if ((profile.gold ?? 0) < cost) throw new Error(`${teacher.name} demands ${cost} gold. You have ${profile.gold}.`);

      // Already learned?
      const { data: existing } = await admin.from("player_runes").select("id")
        .eq("user_id", user.id).eq("rune_key", rune.key).maybeSingle();
      if (existing) throw new Error(`You already know ${rune.name}.`);

      await admin.from("profiles").update({ gold: profile.gold - cost }).eq("id", user.id);
      await admin.from("player_runes").insert({ user_id: user.id, rune_key: rune.key, source: `npc:${teacher.name}` });
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: "—", kind: "system",
        content: `${teacher.name} traces the ${rune.glyph} ${rune.name} rune into ${profile.username}'s memory. (-${cost}g)`,
      });
      return ok({ ok: true, message: `You learn the ${rune.name} rune.` });
    }

    if (action === "weave") {
      if (!body.rune_key || !body.player_item_id) throw new Error("rune and item required");
      const { data: pi } = await admin.from("player_items").select("*, items(*)").eq("id", body.player_item_id).maybeSingle();
      if (!pi || pi.user_id !== user.id) throw new Error("Item not found");
      const slots = pi.items.rune_slots ?? 0;
      if (slots <= 0) throw new Error(`The ${pi.items.name} cannot bear runes.`);

      const { data: known } = await admin.from("player_runes").select("rune_key").eq("user_id", user.id).eq("rune_key", body.rune_key).maybeSingle();
      if (!known) throw new Error("You do not know that rune.");
      const { data: rune } = await admin.from("runes").select("*").eq("key", body.rune_key).maybeSingle();
      if (!rune) throw new Error("rune missing");

      const { data: woven } = await admin.from("item_runes").select("id").eq("player_item_id", pi.id);
      if ((woven?.length ?? 0) >= slots) throw new Error(`The ${pi.items.name} has no free rune slots.`);

      await admin.from("item_runes").insert({
        player_item_id: pi.id, rune_key: rune.key,
        charges: rune.kind === "active" ? rune.max_charges : 0,
        max_charges: rune.kind === "active" ? rune.max_charges : 0,
      });
      return ok({ ok: true, message: `You weave the ${rune.glyph} ${rune.name} into the ${pi.items.name}.` });
    }

    if (action === "unweave") {
      const { data: ir } = await admin.from("item_runes").select("*, player_items!inner(user_id, items(name))").eq("id", body.player_item_id!).maybeSingle();
      if (!ir || (ir as any).player_items.user_id !== user.id) throw new Error("Woven rune not found");
      await admin.from("item_runes").delete().eq("id", ir.id);
      return ok({ ok: true, message: `The rune unravels from the ${(ir as any).player_items.items.name}.` });
    }

    return ok({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return ok({ error: e instanceof Error ? e.message : "error" }, 400);
  }
});
