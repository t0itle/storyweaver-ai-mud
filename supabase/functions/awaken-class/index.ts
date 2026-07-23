// Awakens a classed player at level 15: sets awakened_class, grants that
// evolution's flavor capstone (a free class talent), and asks Lovable AI to
// generate a one-shot signature "unique attribute" tuned to the player.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "unauth" }, 401);

    const body = await req.json().catch(() => ({}));
    const awakenedKey = String(body?.awakened_key ?? "").trim();
    if (!awakenedKey) return json({ error: "awakened_key required" }, 400);

    const { data: profile } = await admin.from("profiles")
      .select("id, username, class_key, awakened_class, awakening_available, level, char_description, current_room, aether")
      .eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);
    if (profile.awakened_class) return json({ error: "already awakened" }, 400);
    if (!profile.awakening_available) return json({ error: "not yet — reach level 15" }, 400);
    if (!profile.class_key) return json({ error: "no class" }, 400);

    const { data: klass } = await admin.from("class_defs")
      .select("key, name, awakenings").eq("key", profile.class_key).maybeSingle();
    if (!klass) return json({ error: "unknown class" }, 400);
    const forms = (klass.awakenings ?? []) as Array<{ key: string; name: string; flavor: string }>;
    const chosen = forms.find((f) => f.key === awakenedKey);
    if (!chosen) return json({ error: "unknown awakened form" }, 400);

    // Ask Lovable AI for the signature Unique Attribute.
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let unique = {
      name: `${chosen.name}'s Signature`,
      description: "A single tuned edge to your becoming — sharpened by memory, never dulled.",
      effect_note: "Once per fight, re-roll one failed check of your choosing.",
    };
    if (LOVABLE_API_KEY) {
      const prompt = `Write a signature "Unique Attribute" for a fantasy RPG character who just awakened.
Character: ${profile.username}, a level ${profile.level ?? 15} ${klass.name} evolving into ${chosen.name}.
Awakened form flavor: ${chosen.flavor}
Their own description: ${profile.char_description ?? "unknown"}
${profile.aether ? `Aligned with the Aether ${profile.aether}.` : "Unaligned."}

Return STRICT JSON: { "name": "...", "description": "...", "effect_note": "..." }.
- name: 2-4 words, evocative, personal to this character (not generic).
- description: exactly 2 sentences of literary, second-person flavor.
- effect_note: one sentence, a small mechanical hook (a per-fight re-roll, +N to a specific check, a small heal, a small environmental interaction). Keep it narrow — DO NOT be game-breaking.
No preamble. JSON only.`;
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const raw = data?.choices?.[0]?.message?.content ?? "";
          const parsed = JSON.parse(raw);
          if (parsed?.name && parsed?.description) {
            unique = {
              name: String(parsed.name).slice(0, 60),
              description: String(parsed.description).slice(0, 400),
              effect_note: String(parsed.effect_note ?? "").slice(0, 200),
            };
          }
        } else if (res.status === 429 || res.status === 402) {
          console.error("AI gateway limit:", res.status);
        }
      } catch (e) {
        console.error("unique-attribute AI failed", e);
      }
    }

    await admin.from("profiles").update({
      awakened_class: awakenedKey,
      awakened_at: new Date().toISOString(),
      awakening_available: false,
      unique_attribute: unique,
    }).eq("id", user.id);

    // Broadcast a system line in the room the player awakened in.
    await admin.from("messages").insert({
      room: profile.current_room, user_id: null, author_name: "—", kind: "system",
      content: `✧ ${profile.username} awakens as ${chosen.name}. A new name is written on their bones — **${unique.name}**.`,
    });

    await admin.from("world_events").insert({
      kind: "awakened", room: profile.current_room,
      actor_id: user.id, actor_name: profile.username,
      target_kind: "class", target_name: chosen.name,
      details: { awakened_class: awakenedKey, unique_attribute: unique },
    });

    return json({ ok: true, awakened: chosen, unique });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
