// Generates (or returns cached) scene art for a room.
// Cache key = sha256(room + presence-NPCs + recent player count). Same key reuses image.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SCENE_PROMPT_VERSION = "2026-05-12-npc-actions-tod-v1";

type TimeBucket = "deepnight" | "dawn" | "morning" | "midday" | "dusk" | "night";
function getTimeBucket(d: Date = new Date()): TimeBucket {
  const h = d.getUTCHours();
  if (h < 5) return "deepnight";
  if (h < 8) return "dawn";
  if (h < 12) return "morning";
  if (h < 16) return "midday";
  if (h < 20) return "dusk";
  return "night";
}
const TOD_LIGHT: Record<TimeBucket, string> = {
  deepnight: "the small hours past midnight — deep indigo darkness, sparse cold moonlight, lanterns and candleflame as the only warmth, long inky shadows",
  dawn:      "first light of dawn — pale rose and apricot horizon, low soft sidelight, mist rising, dew-damp surfaces, long pale shadows",
  morning:   "clean morning light — fresh, clear, slightly cool sunlight at a low angle, crisp shadows, hopeful air",
  midday:    "high midday sun — bright, near-overhead light, short hard shadows, sun-bleached colour, heat shimmer where appropriate",
  dusk:      "golden-hour dusk — burnt-orange and magenta sky, long warm raking light, dust catching the last sun, deep cool shadows pooling",
  night:     "true night — black-blue sky, stars or overcast, lantern glow, hearths and braziers as the dominant warm light, everything else in cool shadow",
};

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
    const { data: npcs } = await admin.from("npcs")
      .select("name,title,current_activity,persona")
      .eq("room", roomSlug);
    const bucket = getTimeBucket();

    // Pick a palette/mood from the room itself rather than forcing ember on everything.
    function pickMood(r: any): { palette: string; mood: string } {
      const slug = String(r.slug ?? "").toLowerCase();
      const name = String(r.name ?? "").toLowerCase();
      const desc = String(r.description ?? "").toLowerCase();
      const kind = String(r.kind ?? "").toLowerCase();
      const blob = `${slug} ${name} ${desc} ${kind}`;

      // Aether capitals — each gets its own signature palette.
      if (/solastin|magma|forge|ember-hold|khalvaris|pyre/.test(blob))
        return { palette: "molten reds, ember orange, soot black, gold sparks", mood: "forge-lit, heat-shimmer, volcanic" };
      if (/tide|sea|shore|harbor|reef|coral|wave|abyss/.test(blob))
        return { palette: "deep teal, seafoam, pearl white, twilight blue", mood: "salt-air, luminous, oceanic calm" };
      if (/grove|forest|wood|leaf|root|bloom|verdant|moss/.test(blob))
        return { palette: "verdant greens, dappled gold, mossy umber, soft amber light", mood: "sun-dappled, alive, fragrant" };
      if (/sky|cloud|storm|wind|aerie|peak|mountain/.test(blob))
        return { palette: "cobalt skies, cloud-silver, rose-quartz dawn", mood: "vast, windswept, luminous" };
      if (/library|archive|scriptor|veil|cloister|chapel|first-city|bond/.test(blob))
        return { palette: "candlelit ivory, parchment cream, indigo shadow, brass", mood: "hushed, sacred, lantern-warm" };
      if (/market|bazaar|square|tavern|inn|hearth/.test(blob))
        return { palette: "warm lantern gold, terracotta, woven crimson, spice browns", mood: "bustling, lived-in, warmly lit" };
      if (/desert|dune|sand|sun|kiln|skeleton/.test(blob))
        return { palette: "bleached bone, ochre sand, burnt sienna, pale cobalt sky", mood: "sun-scoured, arid, vast" };
      if (/tomb|crypt|bone|grave|catacomb|below/.test(blob))
        return { palette: "cold stone grey, bone white, deep violet shadow, faint green witchlight", mood: "sepulchral, still, ancient" };
      if (/snow|ice|frost|glacier|north/.test(blob))
        return { palette: "glacier blue, snow white, pale lavender shadow", mood: "crisp, silent, crystalline" };
      if (/swamp|marsh|bog|fen/.test(blob))
        return { palette: "murky olive, peat brown, foxfire green, mist grey", mood: "humid, brooding, mist-veiled" };
      if (/ruin|broken|shattered|fallen/.test(blob))
        return { palette: "weathered stone, lichen green, dust gold, soft slate", mood: "melancholy, time-worn, quiet" };
      if (/road|causeway|path|wagon|bridge/.test(blob))
        return { palette: "open-sky blue, road dust, distant haze, late-afternoon gold", mood: "expansive, journeying, open air" };
      if (/wild|wilderness|hollow|clearing/.test(blob))
        return { palette: "earthy greens, bark browns, leaf-shadow, soft natural light", mood: "untamed, peaceful, breathing" };
      // Default: cinematic painterly fantasy without forced fire/ash.
      return { palette: "naturalistic painterly tones suited to the scene", mood: "cinematic, atmospheric, balanced light" };
    }
    const mood = pickMood(room);

    const npcKey = (npcs ?? []).map((n: any) => n.name).sort().join(",");
    const cacheKey = await sha256(`${SCENE_PROMPT_VERSION}|${roomSlug}|${npcKey}|${context_extra ?? ""}`);

    // Check cache
    const { data: cached } = await admin.from("room_scenes")
      .select("image_url").eq("room", roomSlug).eq("context_hash", cacheKey).maybeSingle();
    if (cached) return json({ image_url: cached.image_url, cached: true });

    const npcLine = (npcs ?? []).length
      ? `Visible figures: ${(npcs ?? []).map((n: any) => `${n.name}${n.title ? `, ${n.title}` : ""}`).join("; ")}.`
      : "";

    const eventsLine = (context_extra && String(context_extra).trim())
      ? `Recent events that have visibly altered this place: ${context_extra}. Show those scars on the world — burn marks, broken stone, fresh graves, ash in the air, signs of struggle — woven naturally into the scene.`
      : "";

    const textSafeLine = /underbazaar|market|bazaar|stall|shop/i.test(`${room.slug} ${room.name} ${room.description ?? ""}`)
      ? "This location must contain zero readable lettering. Every stall sign, hanging placard, label, poster, chalkboard, receipt, coin stamp, crate mark, and inscription must be omitted, turned away, cropped out, blurred into abstract paint, or replaced with blank shapes and pictograms only."
      : "This location must contain zero readable lettering or symbols that resemble an alphabet.";

    const prompt = `Painterly fantasy environment concept art, oil-painted, cinematic wide shot. Palette: ${mood.palette}. Mood: ${mood.mood}. Atmospheric volumetric light, no characters in the foreground. Do NOT default to fire, embers, ash, or grimdark unless the scene explicitly calls for it.

ABSOLUTELY NO TEXT of any kind in the image — no signs, no banners, no shop signage, no painted lettering on walls or stalls, no carved inscriptions, no scrolls with writing, no maps with labels, no runes meant to read as letters, no logos, no watermarks, no captions. If a sign would normally appear, render it as a blank wooden plank or a pictographic symbol only.
${textSafeLine}

Scene: ${room.name}.
${room.description}
${room.ambience ?? ""}
${npcLine}
${eventsLine}

Style: painterly brushwork in the spirit of Studio Ghibli backgrounds and Craig Mullins — naturalistic colour, believable light, slight grain. Match the palette and mood above; let the location's true character lead the image.`;

    async function callImageModel(p: string) {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: p }],
          modalities: ["image", "text"],
        }),
      });
    }
    let aiRes = await callImageModel(prompt);
    if (aiRes.status === 429) return json({ error: "Too busy", fallback: true }, 200);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted", fallback: true }, 200);
    if (!aiRes.ok) { console.error("scene-image AI", aiRes.status, await aiRes.text()); return json({ error: "scene gen failed", fallback: true }, 200); }
    let rawText = await aiRes.text();
    let aiData: any;
    try { aiData = JSON.parse(rawText); }
    catch { console.error("non-JSON AI body:", rawText.slice(0, 300)); return json({ error: "scene gen returned non-JSON", fallback: true }, 200); }
    let dataUrl: string | undefined = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image/")) {
      console.warn("scene-image: no image on first try, retrying once");
      aiRes = await callImageModel(prompt + "\n\nReturn the painted image only, no text.");
      if (aiRes.ok) {
        try {
          const rd = JSON.parse(await aiRes.text());
          dataUrl = rd.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        } catch { /* ignore */ }
      }
    }
    if (!dataUrl?.startsWith("data:image/")) {
      return json({ error: "no image", fallback: true }, 200);
    }

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
    console.error("scene-image fatal:", e);
    return json({ error: e instanceof Error ? e.message : "error", fallback: true }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
