// Generate per-room music + ambient with ElevenLabs, cache to storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

// special pseudo-rooms for combat / rest
const SPECIAL: Record<string, { music: string; ambient: string; name: string }> = {
  __combat__: {
    name: "Combat",
    music:
      "Tense, driving orchestral combat loop. Low brass, urgent strings, taiko-style percussion. Dark fantasy, no melody hooks, cinematic, seamless 30-second loop.",
    ambient: "Distant clashing of blades, ragged breathing, leather creaking, no music.",
  },
  __rest__: {
    name: "Rest",
    music:
      "Soft warm acoustic lute and low strings. Calming hearthside fantasy lullaby, gentle, hopeful, seamless 30-second loop.",
    ambient: "Crackling fire, distant wind through wooden walls, occasional creak of timber.",
  },
};

function pickPrompts(slug: string, kind: string, name: string, description: string) {
  const desc = (description || "").slice(0, 280);
  const music = `Atmospheric fantasy soundtrack for the location "${name}" (kind: ${kind}). ${desc} Instrumental, ambient, cinematic, seamless 30-second loop, low-volume background score, no vocals.`;
  const ambient = `Background ambient soundscape for "${name}" — ${kind}. ${desc} Continuous environmental sounds only (wind, water, creatures, crowd, fire, stone, etc). No music, no melody, seamless loop, ~22 seconds.`;
  return { music, ambient };
}

async function generateMusic(prompt: string): Promise<Uint8Array> {
  const res = await fetch("https://api.elevenlabs.io/v1/music", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: 30000 }),
  });
  if (!res.ok) throw new Error(`music ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function generateSfx(prompt: string): Promise<Uint8Array> {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text: prompt, duration_seconds: 22, prompt_influence: 0.4, loop: true }),
  });
  if (!res.ok) throw new Error(`sfx ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function uploadMp3(path: string, bytes: Uint8Array): Promise<string> {
  const { error } = await supa.storage.from("room-audio").upload(path, bytes, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supa.storage.from("room-audio").getPublicUrl(path);
  return data.publicUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { slug } = await req.json();
    if (!slug || typeof slug !== "string") {
      return new Response(JSON.stringify({ error: "slug required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supa
      .from("room_audio")
      .select("slug, music_url, ambient_url, status, updated_at")
      .eq("slug", slug)
      .maybeSingle();
    if (existing?.music_url && existing?.ambient_url) {
      return new Response(JSON.stringify({ ok: true, cached: true, ...existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // throttle: if pending and started within last 5 min, return as-is
    if (
      existing?.status === "generating" &&
      Date.now() - new Date(existing.updated_at).getTime() < 5 * 60_000
    ) {
      return new Response(JSON.stringify({ ok: true, in_progress: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supa.from("room_audio").upsert({ slug, status: "generating", updated_at: new Date().toISOString() });

    let prompts: { music: string; ambient: string };
    if (SPECIAL[slug]) {
      prompts = SPECIAL[slug];
    } else {
      const { data: room, error } = await supa
        .from("rooms")
        .select("slug, name, description, kind")
        .eq("slug", slug)
        .single();
      if (error || !room) throw new Error(`room ${slug} not found`);
      prompts = pickPrompts(room.slug, room.kind, room.name, room.description);
    }

    // Run in parallel; if one fails we still try the other
    const [musicRes, sfxRes] = await Promise.allSettled([
      generateMusic(prompts.music),
      generateSfx(prompts.ambient),
    ]);

    let music_url: string | null = null;
    let ambient_url: string | null = null;
    if (musicRes.status === "fulfilled") {
      music_url = await uploadMp3(`music/${slug}.mp3`, musicRes.value);
    } else {
      console.error("music failed", musicRes.reason);
    }
    if (sfxRes.status === "fulfilled") {
      ambient_url = await uploadMp3(`ambient/${slug}.mp3`, sfxRes.value);
    } else {
      console.error("sfx failed", sfxRes.reason);
    }

    const status = music_url && ambient_url ? "ready" : music_url || ambient_url ? "partial" : "failed";

    await supa.from("room_audio").upsert({
      slug,
      music_url,
      ambient_url,
      status,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: true, slug, music_url, ambient_url, status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 200, // soft fail so client falls back gracefully
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
