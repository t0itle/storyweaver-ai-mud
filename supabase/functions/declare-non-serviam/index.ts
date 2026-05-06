// "Non Serviam." The player publicly forsakes the Aethers and binds themselves to Chaos.
// One-shot, irreversible. Triggers a rippling wave of world events and ambient messages.
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

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);
    if (profile.aether) return json({ error: "An oath to an Aether already binds your tongue. The words will not come." }, 400);
    if (profile.faction === "chaos") return json({ error: "You have already spoken those words once. They cannot be unsaid." }, 400);

    const room = profile.current_room;

    // Bind to Chaos. The declaration carries weight — corruption surges.
    await admin.from("profiles").update({
      faction: "chaos",
      aether: null,
      non_serviam_at: new Date().toISOString(),
      corruption: Math.min(100, (profile.corruption ?? 0) + 25),
      chaos_pressure: 0, // pressure released — the choice is made
    }).eq("id", user.id);

    // World event (kicks the journal trigger).
    await admin.from("world_events").insert({
      kind: "non_serviam_declared",
      actor_id: user.id,
      actor_name: profile.username,
      room,
      details: {},
    });

    // Local ripple — present in the room hear it shouted.
    await admin.from("messages").insert({
      room,
      user_id: null,
      author_name: "—",
      kind: "system",
      content: `**${profile.username}** throws back their head and cries — *"NON SERVIAM!"* The air buckles. Somewhere very far away, something old turns its head.`,
    });

    // Distant ripple — every Aether capital flickers.
    const capitals = ["hall-of-the-seven", "first-city-gate", "ash-road", "crescent-shore"];
    for (const r of capitals) {
      if (r === room) continue;
      await admin.from("messages").insert({
        room: r,
        user_id: null,
        author_name: "—",
        kind: "ambient",
        content: `*A shudder runs through the stones. Somewhere, a name has been struck from the seven's ledger.*`,
      });
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
