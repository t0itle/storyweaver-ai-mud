// Hire an NPC as companion. Server-side gold deduction and trust check.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

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

    const { npc_id } = await req.json();
    if (!npc_id) return json({ error: "npc_id required" }, 400);

    const { data: profile } = await admin.from("profiles")
      .select("id, username, gold, current_room").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 404);

    const { data: npc } = await admin.from("npcs")
      .select("id, name, hire_price_gold, hire_no_trust").eq("id", npc_id).maybeSingle();
    if (!npc) return json({ error: "no such npc" }, 404);

    const price = npc.hire_price_gold ?? 0;
    if (!npc.hire_no_trust) {
      const { data: amity } = await admin.from("npc_amity").select("score")
        .eq("user_id", user.id).eq("npc_id", npc.id).maybeSingle();
      if ((amity?.score ?? 0) < 20) {
        return json({ error: "trust_low", trust: amity?.score ?? 0, required: 20 }, 400);
      }
    }
    if (price > 0 && (profile.gold ?? 0) < price) {
      return json({ error: "insufficient_gold", have: profile.gold ?? 0, need: price }, 400);
    }

    const newGold = (profile.gold ?? 0) - (price > 0 ? price : 0);
    await admin.from("profiles").update({
      gold: newGold,
      companion_npc_id: npc.id,
      companion_mode: "follow",
    }).eq("id", user.id);

    return json({ ok: true, gold: newGold, price });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
