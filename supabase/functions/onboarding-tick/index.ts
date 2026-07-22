// First Walker onboarding — the shore guide's teach actions.
// Actions:
//   list         → { step, hint }
//   learn_word   → grants knows_word for 'sana', bumps step 1→2
//   learn_symbol → grants knows_symbol for 'sana', bumps step 2→3
// Kill (3→4) and reach First City gate (4→5) are handled by DB triggers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const HINTS: Record<number, string> = {
  1: "Speak with Mirren on the Crescent Shore. Ask her about Sana.",
  2: "Ask Mirren to show you the shape of the sigil.",
  3: "Draw blood from any beast to prove your hand. A weak one will do.",
  4: "Walk north. Follow the road until the Gate of Seven Sigils rises before you.",
  5: "The First Walk is behind you. The world is yours now.",
};

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
    const action = String(body.action ?? "list");

    const { data: row } = await admin.from("onboarding_progress")
      .select("step").eq("user_id", user.id).maybeSingle();
    let step = row?.step ?? 5;

    if (action === "list") {
      return json({ step, hint: HINTS[step] });
    }

    // Find the shore guide + current room for posting messages
    const { data: profile } = await admin.from("profiles")
      .select("username, current_room").eq("id", user.id).maybeSingle();
    const { data: guide } = await admin.from("npcs")
      .select("id, name").eq("home_room", "crescent-shore")
      .ilike("name", "Mirren%").maybeSingle();

    const postGuideSpeech = async (line: string) => {
      if (!guide || !profile) return;
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, npc_id: guide.id,
        author_name: guide.name, kind: "say", addressed_to: user.id,
        content: line,
      });
    };

    if (action === "learn_word") {
      if (step > 2) return json({ ok: true, step, skipped: "already_learned" });
      await admin.from("player_lesser_rune_knowledge").upsert({
        user_id: user.id, rune_key: "sana", knows_word: true,
        learned_word_at: new Date().toISOString(), word_source: "onboarding-mirror",
      }, { onConflict: "user_id,rune_key" });
      step = Math.max(step, 2);
      await admin.from("onboarding_progress").update({ step }).eq("user_id", user.id);
      await postGuideSpeech(
        `The word is **Sana**. It means *last breath* — the rune of life clinging to bone. Say it and your body remembers how to keep breathing. Now — the shape. Ask me to show you the sigil.`
      );
      return json({ ok: true, step, hint: HINTS[step] });
    }

    if (action === "learn_symbol") {
      if (step < 2) return json({ error: "Learn the word first." }, 400);
      if (step > 3) return json({ ok: true, step, skipped: "already_learned" });
      await admin.from("player_lesser_rune_knowledge").upsert({
        user_id: user.id, rune_key: "sana", knows_word: true, knows_symbol: true,
        learned_symbol_at: new Date().toISOString(), word_source: "onboarding-mirror",
      }, { onConflict: "user_id,rune_key" });
      step = Math.max(step, 3);
      await admin.from("onboarding_progress").update({ step }).eq("user_id", user.id);
      await postGuideSpeech(
        `*She draws in the wet sand: a single stroke rising, curling back on itself like a returning wave.* Trace that, mouth the word, and death will pause for you — once. Now go. Prove your hand on any beast that will bleed. Then walk north, toward the sigils.`
      );
      return json({ ok: true, step, hint: HINTS[step] });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
