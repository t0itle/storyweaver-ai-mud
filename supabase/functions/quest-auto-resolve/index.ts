// Auto-resolve active quests when world events happen (slay / visit).
// Called by GameClient on room arrival and after a kill. Delegates rewards to quest-award.
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

    const body = await req.json().catch(() => ({}));
    const ev = body.event ?? body;
    if (!ev?.kind) return json({ error: "event.kind required" }, 400);

    const { data: active } = await admin.from("quests")
      .select("*").eq("user_id", user.id).eq("status", "active");

    const completed: any[] = [];
    for (const q of active ?? []) {
      let match = false;
      if (ev.kind === "slay" && q.kind === "slay" && q.target_kind === "npc") {
        const ref = (q.target_ref ?? "").toLowerCase();
        const tid = String(ev.target_id ?? "").toLowerCase();
        const tname = String(ev.target_name ?? "").toLowerCase();
        if (ref && (ref === tid || (tname && (tname.includes(ref) || ref.includes(tname))))) match = true;
      } else if (ev.kind === "visit" && (q.kind === "visit" || q.kind === "escort") && q.target_kind === "room") {
        const ref = (q.target_ref ?? "").toLowerCase();
        const rm = String(ev.room ?? "").toLowerCase();
        if (ref && rm && ref === rm) match = true;
      }
      if (match) {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/quest-award`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: auth },
          body: JSON.stringify({ quest_id: q.id, note: `auto:${ev.kind}` }),
        });
        const result = await r.json().catch(() => ({ ok: false }));
        if (result.ok) completed.push({ ...result, quest_id: q.id });
      }
    }
    return json({ ok: true, completed });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
