// Revive a dead player in the same room. Costs 50g. Returns them as a zombie.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const REVIVE_COST = 50;
const NECROS_KEY = "necros";

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

    const { target_user_id } = await req.json();
    if (!target_user_id) return ok({ error: "target_user_id required" }, 400);

    const { data: me } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!me) return ok({ error: "Profile missing" }, 404);
    if (me.dead) return ok({ error: "The dead cannot raise the dead." }, 400);
    if ((me.gold ?? 0) < REVIVE_COST) return ok({ error: `Need ${REVIVE_COST} gold to bind a soul.` }, 400);

    // Reviver must know Necros
    const { data: kn } = await admin.from("player_lesser_rune_knowledge")
      .select("knows_word, knows_symbol").eq("user_id", user.id).eq("rune_key", NECROS_KEY).maybeSingle();
    if (!kn?.knows_word || !kn?.knows_symbol) {
      return ok({ error: "You must know the Blessing of 💀 Necros — both the word and the shape — to call them back." }, 400);
    }

    const { data: corpse } = await admin.from("profiles").select("*").eq("id", target_user_id).maybeSingle();
    if (!corpse) return ok({ error: "No such soul." }, 404);
    if (!corpse.dead) return ok({ error: `${corpse.username} still draws breath.` }, 400);
    if (corpse.current_room !== me.current_room) return ok({ error: "Their corpse is not here." }, 400);

    const reviveHp = Math.max(2, Math.floor((corpse.max_hp ?? 20) * 0.5));
    await admin.from("profiles").update({
      dead: false, dead_at: null, death_room: null,
      zombified: true, revived_by: user.id, revived_at: new Date().toISOString(),
      hp: reviveHp,
    }).eq("id", target_user_id);
    await admin.from("profiles").update({ gold: (me.gold ?? 0) - REVIVE_COST }).eq("id", user.id);

    await admin.from("messages").insert({
      room: me.current_room, user_id: null, author_name: "—", kind: "system",
      content: `💀 ${me.username} traces 💀 Necros over ${corpse.username}'s corpse. Bone re-knits. Eyes open the wrong way. ${corpse.username} rises — **zombified**.`,
    });
    await admin.from("world_events").insert({
      kind: "revived_zombie", actor_id: user.id, actor_name: me.username,
      target_kind: "player", target_id: target_user_id, target_name: corpse.username,
      room: me.current_room, details: { cost: REVIVE_COST },
    });

    return ok({ ok: true, revived: corpse.username, zombified: true });
  } catch (e) {
    return ok({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
