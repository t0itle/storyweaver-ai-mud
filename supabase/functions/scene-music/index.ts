// Generate or fetch cached background music for a scene (kind + time bucket).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPTS: Record<string, string> = {
  "city|deepnight": "Soft ambient nocturne, distant bells, hushed strings, dark fantasy city at deep night, looping, no drums",
  "city|dawn": "Hopeful low strings and quiet harp, fantasy city waking at dawn, ambient, looping",
  "city|morning": "Warm medieval-fantasy market ambience, lute and recorder, gentle and lively, looping",
  "city|midday": "Bustling fantasy city ambient pad with light percussion, looping",
  "city|dusk": "Wistful evening strings and pipe, lantern-lit fantasy streets, looping",
  "city|night": "Mysterious low pad, distant choir, fantasy city after dark, looping, no drums",
  "road|deepnight": "Cold lonely wind, sparse harp notes, dark fantasy road at deepest night, looping, no drums",
  "road|dawn": "Pale strings and birdcalls, hopeful traveling theme, dawn road, looping",
  "road|morning": "Light traveling melody, tin flute and gentle drum, fantasy open road, looping",
  "road|midday": "Steady warm orchestral travel theme, fantasy countryside, looping",
  "road|dusk": "Lonely fiddle and low strings, dusk on a fantasy road, looping",
  "road|night": "Low droning pad, owl calls, tense fantasy road at night, looping, no drums",
  "wilds|deepnight": "Dark eerie forest ambience, distant wolves, dissonant strings, looping",
  "wilds|dawn": "Misty wilderness with soft horn and bird calls, ambient, looping",
  "wilds|morning": "Bright woodland flute melody, fantasy adventure, looping",
  "wilds|midday": "Sun-dappled forest pad with light percussion, fantasy, looping",
  "wilds|dusk": "Hushed wilderness strings, fantasy twilight, looping",
  "wilds|night": "Tense low woodwinds, nocturnal forest, looping, no drums",
  "desert|deepnight": "Cold desert wind, distant bone chimes, sparse drone, dark fantasy, looping",
  "desert|dawn": "Sun rising over endless dunes, ney flute and ambient pad, looping",
  "desert|morning": "Warm desert exploration theme, frame drum and oud, looping",
  "desert|midday": "Heat shimmer drone, sparse percussion, oppressive desert, looping",
  "desert|dusk": "Mournful desert melody, oud and strings, sunset over dunes, looping",
  "desert|night": "Low desert drone with distant howls, dark fantasy, looping",
  "cave|any": "Dripping water, low cavern drone, distant rumbles, dark fantasy underground, looping, no drums",
  "ruin|any": "Haunting choir pad and broken bells, ancient fantasy ruins, looping",
  "crypt|any": "Whispering choir, deep organ drone, fantasy crypt, ominous, looping",
  "lair|any": "Throbbing low brass and growls, monstrous fantasy lair, looping",
  "shore|any": "Waves and distant gulls with soft strings, fantasy coast, looping",
  "dock|any": "Creaking ropes, water lapping, light accordion, fantasy harbor, looping",
  "bridge|any": "Wind across stone, lonely cello, fantasy mountain bridge, looping",
  "hollow|any": "Subterranean drone, distant chanting, fantasy hollow, looping",
  "grove|any": "Sacred grove with soft choir and harp, mystical fantasy, looping",
  "default|any": "Ambient dark fantasy pad, soft and looping, no drums",
};

function pickPrompt(kind: string, bucket: string): { key: string; prompt: string } {
  const exact = `${kind}|${bucket}`;
  if (PROMPTS[exact]) return { key: exact, prompt: PROMPTS[exact] };
  const any = `${kind}|any`;
  if (PROMPTS[any]) return { key: any, prompt: PROMPTS[any] };
  return { key: `default|any`, prompt: PROMPTS["default|any"] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { kind, bucket } = await req.json();
    if (typeof kind !== "string" || typeof bucket !== "string") {
      return new Response(JSON.stringify({ error: "kind and bucket required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { key, prompt } = pickPrompt(kind, bucket);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cached } = await supabase
      .from("scene_music")
      .select("audio_base64")
      .eq("scene_key", key)
      .maybeSingle();

    if (cached?.audio_base64) {
      return new Response(JSON.stringify({ scene_key: key, audioContent: cached.audio_base64, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, music_length_ms: 30000 }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ error: `ElevenLabs music failed [${resp.status}]: ${txt}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const buf = await resp.arrayBuffer();
    const b64 = base64Encode(new Uint8Array(buf));

    await supabase.from("scene_music").upsert({ scene_key: key, audio_base64: b64, prompt });

    return new Response(JSON.stringify({ scene_key: key, audioContent: b64, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
