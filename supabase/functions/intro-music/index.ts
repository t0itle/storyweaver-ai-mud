// Generates (once) the epic intro music track via ElevenLabs Music and caches it
// in the public 'music' bucket. Returns { url }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const VERSION = "v1";
const PATH = `intro/epic-${VERSION}.mp3`;
const DURATION_MS = 60_000; // ~60s, will loop under the 30s reading

const PROMPT =
  "Epic cinematic creation-myth score. Towering orchestral choir in Latin-style vowels (no real words), " +
  "low brass swells, deep timpani heartbeats, ethereal soprano floating above. " +
  "Slow, sacred, awe-struck — like the birth of a world. Builds from a single shimmering bell into " +
  "thundering full choir + strings by the climax. Two Steps From Hell meets Hans Zimmer meets a cathedral mass. " +
  "No drums kit, no modern beat, no lyrics — only voices, strings, brass, choir, percussion of the gods.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pub } = admin.storage.from("music").getPublicUrl(PATH);
    // Cached?
    try {
      const head = await fetch(pub.publicUrl, { method: "HEAD" });
      if (head.ok) return json({ ok: true, url: pub.publicUrl, cached: true });
    } catch { /* generate */ }

    const key = Deno.env.get("ELEVENLABS_API_KEY");
    if (!key) return json({ error: "ELEVENLABS_API_KEY not configured" }, 500);

    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: PROMPT, music_length_ms: DURATION_MS }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json({ error: `music ${res.status}: ${t.slice(0, 200)}` }, 502);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const up = await admin.storage.from("music").upload(PATH, bytes, {
      contentType: "audio/mpeg", upsert: true,
    });
    if (up.error) return json({ error: up.error.message }, 500);

    return json({ ok: true, url: pub.publicUrl, cached: false });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
