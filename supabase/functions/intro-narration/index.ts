// Generates (and caches) per-verse mystical narration for the intro.
// Returns an array of { at, url } that the client plays in sync with the text.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Brian — deep, resonant. Low stability for breath/expression.
const VOICE_ID = "nPczCjzI2devNBz1zQrb";
const MODEL_ID = "eleven_multilingual_v2";
const VERSION = "v1";

// Must match Intro.tsx
const VERSES: { at: number; text: string }[] = [
  { at: 600,   text: "A world is waiting for you." },
  { at: 4200,  text: "It does not know your name. Only that you are coming." },
  { at: 8400,  text: "In the beginning, there was nothing." },
  { at: 11800, text: "Then the Light came." },
  { at: 15000, text: "The Speaker opened its mouth, and the seven Aethers were spoken." },
  { at: 19200, text: "For every light, a Shadow waits." },
  { at: 22800, text: "A single pool still blooms in the desert." },
  { at: 26600, text: "It is asking who you mean to be." },
];

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

async function synth(text: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.55,
          use_speaker_boost: true,
          speed: 0.85,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`tts ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function ensureVerseUrl(idx: number, text: string): Promise<string> {
  const path = `intro/${VERSION}/verse-${idx}.mp3`;
  const { data: pub } = supa.storage.from("room-audio").getPublicUrl(path);
  // HEAD check
  try {
    const head = await fetch(pub.publicUrl, { method: "HEAD" });
    if (head.ok) return pub.publicUrl;
  } catch { /* fall through */ }
  const bytes = await synth(text);
  const { error } = await supa.storage.from("room-audio").upload(path, bytes, {
    contentType: "audio/mpeg", upsert: true,
  });
  if (error) throw error;
  return pub.publicUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const verses = await Promise.all(
      VERSES.map(async (v, i) => ({ at: v.at, url: await ensureVerseUrl(i, v.text) }))
    );
    return new Response(JSON.stringify({ ok: true, verses }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
