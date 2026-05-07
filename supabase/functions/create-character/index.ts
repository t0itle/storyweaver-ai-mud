// Generates a portrait via Lovable AI (Nano Banana), uploads to storage,
// updates the player's profile with race/description/portrait/created=true.
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

    const { race_key, description, direction } = await req.json();
    if (!race_key || typeof description !== "string" || description.trim().length < 8) {
      return json({ error: "Provide race and a description (min 8 chars)" }, 400);
    }
    // North → caravan road to the First City. South → the Crescent Verge,
    // the threshold of the deep desert wander system.
    const startRoom = direction === "south" ? "desert-verge" : "crescent-shore";

    const { data: race } = await admin.from("races").select("*").eq("key", race_key).maybeSingle();
    if (!race) return json({ error: "Unknown race" }, 400);

    const prompt = `Painterly fantasy character portrait, oil-painted concept art, soft naturalistic lighting, centered bust composition on a soft neutral backdrop, no text, no logo. Use colour that fits the subject — do NOT default to fire, embers, ash, or grimdark crimson unless the description specifically calls for it.

Subject: a ${race.visual_traits}.
Player describes themselves as: ${description.trim()}

IMPORTANT: Do NOT add any weapons, swords, daggers, bows, staves, shields, or armor pieces unless the player's description explicitly mentions them. No props of any kind unless described. Plain travelling clothes by default.

Style: painterly brushwork in the spirit of Studio Ghibli character art and Craig Mullins — believable light, balanced colour, slight grain.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
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

    // Decode base64 → bytes
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(image\/[a-z]+)/)?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1];
    const path = `${user.id}/portrait-${Date.now()}.${ext}`;

    const up = await admin.storage.from("portraits").upload(path, bytes, {
      contentType: mime, upsert: true,
    });
    if (up.error) throw up.error;
    const { data: pub } = admin.storage.from("portraits").getPublicUrl(path);

    // Apply HP mod
    const baseMaxHp = 20;
    const newMax = Math.max(8, baseMaxHp + (race.hp_mod ?? 0));
    const username = String(user.user_metadata?.username ?? user.email?.split("@")[0] ?? "wanderer").trim().slice(0, 32) || "wanderer";

    const { error: updErr } = await admin.from("profiles").upsert({
      id: user.id,
      username,
      race: race.key,
      char_description: description.trim().slice(0, 600),
      portrait_url: pub.publicUrl,
      created: true,
      max_hp: newMax,
      hp: newMax,
      current_room: startRoom,
    }, {
      onConflict: "id",
    });
    if (updErr) throw updErr;

    // Grant the standard starter garment: a tattered, dust-covered cloak (equipped)
    const { data: existingCloak } = await admin.from("player_items")
      .select("id").eq("user_id", user.id).eq("item_key", "tattered-cloak").maybeSingle();
    if (!existingCloak) {
      await admin.from("player_items").insert({
        user_id: user.id, item_key: "tattered-cloak", quantity: 1, equipped_slot: "body",
      });
    }

    return json({ portrait_url: pub.publicUrl });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
