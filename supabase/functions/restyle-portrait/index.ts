// Re-renders the player's portrait so it reflects currently equipped gear.
// Uses the existing portrait as a base reference (image edit) so the face
// and likeness stay consistent across changes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles")
      .select("race, char_description, portrait_url").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "No character" }, 400);
    if (!profile.portrait_url) return json({ error: "No base portrait yet" }, 400);

    const { data: race } = await admin.from("races").select("visual_traits").eq("key", profile.race).maybeSingle();

    const { data: equipped } = await admin.from("player_items")
      .select("equipped_slot, items(name, description, slot)")
      .eq("user_id", user.id).not("equipped_slot", "is", null);

    const gearLines = (equipped ?? []).map((e: any) =>
      `- ${e.equipped_slot}: ${e.items.name} — ${e.items.description}`,
    ).join("\n");

    // Slim the description so we don't blow the context.
    const desc = (profile.char_description ?? "").trim().slice(0, 400);

    const prompt = `Repaint this exact character portrait so it accurately reflects their CURRENT clothing, armor, and equipment. Keep the same face, race, hair, skin tone, body shape, age, expression, lighting, framing, and painterly oil-painted style — only change the clothing and visible gear to match the inventory below.

Subject: ${race?.visual_traits ?? "a wanderer"}.
Self-description: ${desc}

Currently worn & wielded:
${gearLines || "- nothing equipped (only bare cloth or skin)"}

Render visible armor pieces, weapons in hand, cloaks, helms etc. exactly as listed. If a slot is empty, do not invent gear for it. Painterly fantasy concept art, parchment-and-ember palette, dramatic warm rim light, dark backdrop, no text, no logo. Frank Frazetta meets Greg Rutkowski.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: profile.portrait_url } },
          ],
        }],
        modalities: ["image", "text"],
      }),
    });
    if (aiRes.status === 429) return json({ error: "Too busy. Try again in a moment." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted." }, 402);
    if (!aiRes.ok) {
      console.error("AI error", aiRes.status, await aiRes.text());
      return json({ error: "Image generation failed" }, 500);
    }
    const aiData = await aiRes.json();
    const dataUrl: string | undefined = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image/")) return json({ error: "No image returned" }, 500);

    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(image\/[a-z]+)/)?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1];
    const path = `${user.id}/portrait-${Date.now()}.${ext}`;

    const up = await admin.storage.from("portraits").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw up.error;
    const { data: pub } = admin.storage.from("portraits").getPublicUrl(path);

    // Reset wound-state variant cache — they were derived from the old portrait
    const { error: updErr } = await admin.from("profiles")
      .update({ portrait_url: pub.publicUrl, portrait_variants: {} }).eq("id", user.id);
    if (updErr) throw updErr;

    return json({ portrait_url: pub.publicUrl });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
