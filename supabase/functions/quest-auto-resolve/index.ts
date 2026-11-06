// Auto-resolve active room quests when the player arrives somewhere. Called by GameClient after a move.
// The room is read from the player's profile on the server; anything the client sends is ignored.
// (Slay quests are completed by combat-action when the kill happens.) Delegates rewards to quest-award.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { arrivalCompletes } from "../_shared/questRules.ts";

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles").select("current_room").eq("id", user.id).maybeSingle();
    const room = String(profile?.current_room ?? "");
    if (!room) return json({ ok: true, completed: [] });

    const { data: active } = await admin.from("quests")
      .select("id, kind, target_kind, target_ref").eq("user_id", user.id).eq("status", "active");

    const completed: any[] = [];
    for (const q of active ?? []) {
      if (!arrivalCompletes(q, room)) continue;
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/quest-award`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ quest_id: q.id, user_id: user.id, note: "auto:visit" }),
      });
      const result = await r.json().catch(() => ({ ok: false }));
      if (result.ok) completed.push({ ...result, quest_id: q.id });
    }
    return json({ ok: true, completed });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
