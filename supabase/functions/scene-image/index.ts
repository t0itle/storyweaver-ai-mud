// Generates (or returns cached) scene art for a room.
// Cache key = sha256(room + presence-NPCs + recent player count). Same key reuses image.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

    const { room: roomSlug, context_extra } = await req.json();
    const { data: room } = await admin.from("rooms").select("*").eq("slug", roomSlug).maybeSingle();
    if (!room) return json({ error: "room not found" }, 404);
    const { data: npcs } = await admin.from("npcs").select("name,title").eq("room", roomSlug);

    const npcKey = (npcs ?? []).map((n: any) => n.name).sort().join(",");
    const cacheKey = await sha256(`${roomSlug}|${npcKey}|${context_extra ?? ""}`);

    // Check cache
    const { data: cached } = await admin.from("room_scenes")
      .select("image_url").eq("room", roomSlug).eq("context_hash", cacheKey).maybeSingle();
    if (cached) return json({ image_url: cached.image_url, cached: true });

    const npcLine = (npcs ?? []).length
      ? `Visible figures: ${(npcs ?? []).map((n: any) => `${n.name}${n.title ? `, ${n.title}` : ""}`).join("; ")}.`
      : "";

    const prompt = `Painterly fantasy environment concept art, oil-painted, cinematic wide shot, parchment-and-ember palette (deep crimson, ash gray, candle gold, smoky black), atmospheric volumetric light, no text, no logos, no characters in the foreground.

Scene: ${room.name}.
${room.description}
${room.ambience ?? ""}
${npcLine}

Style: Frank Frazetta meets Greg Rutkowski, brooding fantasy, painterly brushwork, slight grain.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (aiRes.status === 429) return json({ error: "Too busy" }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
    if (!aiRes.ok) { console.error(await aiRes.text()); return json({ error: "scene gen failed" }, 500); }
    const aiData = await aiRes.json();
    const dataUrl: string | undefined = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image/")) return json({ error: "no image" }, 500);

    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(image\/[a-z]+)/)?.[1] ?? "image/png";
    const ext = mime.split("/")[1];
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${roomSlug}/${cacheKey.slice(0, 16)}.${ext}`;

    const up = await admin.storage.from("scenes").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw up.error;
    const { data: pub } = admin.storage.from("scenes").getPublicUrl(path);

    await admin.from("room_scenes").insert({
      room: roomSlug, context_hash: cacheKey, image_url: pub.publicUrl, prompt,
    });

    return json({ image_url: pub.publicUrl, cached: false });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
