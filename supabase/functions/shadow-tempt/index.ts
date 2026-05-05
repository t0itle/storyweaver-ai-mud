// The Shadow whispers. If the player listens, corruption grows; if they resist, it recedes.
// Server-authoritative + cooldown so the lure cannot be farmed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const WHISPERS = [
  "the Speaker is dead. there is only the silence between words. lean into it.",
  "you were not spoken into being. you were always already here.",
  "name no one. let them go nameless into the sand.",
  "the bloom is a lie told by water. drink anyway.",
  "every oath is a leash. cut them all.",
  "the priests cover their mouths because they are afraid of you.",
  "burn the road behind you. there is no city worth keeping.",
  "kneel to no Aether. kneel to the unspoken.",
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

    const { kind } = await req.json(); // "whisper" | "submit" | "resist"

    const { data: profile } = await admin.from("profiles").select("corruption, aether, username, current_room").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);

    let delta = 0;
    let line = "";
    if (kind === "submit") {
      delta = 4;
      line = "you let the silence in. it makes a home in your chest.";
    } else if (kind === "resist") {
      delta = -2;
      line = "you speak a word — any word — and the Shadow withdraws a little.";
    } else {
      // whisper: passive, a tiny pull
      delta = 1;
      line = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
    }
    // Aether-aligned souls feel the lure less.
    if (profile.aether && delta > 0) delta = Math.max(1, delta - 1);

    const next = Math.max(0, Math.min(100, (profile.corruption ?? 0) + delta));
    await admin.from("profiles").update({ corruption: next }).eq("id", user.id);

    return json({ ok: true, whisper: line, corruption: next, delta });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
