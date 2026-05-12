// Music system: list / buy_song / buy_instrument / learn_scroll / perform / set_voice.
// Caches generated audio on the songs row + in the public 'music' bucket.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function generateSongAudio(prompt: string, durationSeconds: number): Promise<Uint8Array> {
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");
  const dur = Math.max(10, Math.min(60, Math.round(durationSeconds)));
  const res = await fetch("https://api.elevenlabs.io/v1/music", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: dur * 1000 }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ElevenLabs music ${res.status}: ${t.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

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
    const action: string = body.action ?? "list";

    const { data: profile } = await admin.from("profiles")
      .select("id, username, gold, current_room, voice, merit").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);

    // --- set_voice ---------------------------------------------------------
    if (action === "set_voice") {
      const v = String(body.voice ?? "").toLowerCase();
      if (v !== "male" && v !== "female") return json({ error: "voice must be male or female" }, 400);
      await admin.from("profiles").update({ voice: v }).eq("id", user.id);
      return json({ ok: true, voice: v });
    }

    // --- list --------------------------------------------------------------
    if (action === "list") {
      const bardId: string | null = body.bard_id ?? null;
      const { data: ownedRows } = await admin.from("player_songs").select("song_key, learned_at").eq("user_id", user.id);
      const ownedKeys = new Set((ownedRows ?? []).map(r => r.song_key));
      const { data: songs } = await admin.from("songs").select("*").order("rarity").order("title");
      const { data: instItems } = await admin.from("items").select("key,name").in("key", ["lute","fiddle","hand-drum","reed-flute","small-harp"]);
      const { data: ownedInstruments } = await admin.from("player_items").select("item_key").eq("user_id", user.id).in("item_key", ["lute","fiddle","hand-drum","reed-flute","small-harp"]);
      const ownedInstKeys = new Set((ownedInstruments ?? []).map(r => r.item_key));
      const { data: scrolls } = await admin.from("player_items").select("id, item_key").eq("user_id", user.id).like("item_key", "scroll-%");

      let bard: any = null;
      let bardWaresSongs: any[] = [];
      let bardWaresInstruments: any[] = [];
      if (bardId) {
        const { data: gm } = await admin.from("npcs").select("id,name,title,room,is_bard").eq("id", bardId).maybeSingle();
        if (gm?.is_bard) {
          bard = gm;
          bardWaresSongs = (songs ?? []).filter(s => s.vendor_price != null && !ownedKeys.has(s.key))
            .map(s => ({ key: s.key, title: s.title, vocal_part: s.vocal_part, instrument_key: s.instrument_key, rarity: s.rarity, price: s.vendor_price }));
          bardWaresInstruments = (instItems ?? []).map((i: any) => ({
            key: i.key, name: i.name,
            price: { lute: 60, fiddle: 50, "hand-drum": 30, "reed-flute": 25, "small-harp": 90 }[i.key] ?? 50,
            owned: ownedInstKeys.has(i.key),
          }));
        }
      }

      const repertoire = (songs ?? [])
        .filter(s => ownedKeys.has(s.key))
        .map(s => ({
          key: s.key, title: s.title, description: s.description,
          vocal_part: s.vocal_part, instrument_key: s.instrument_key, rarity: s.rarity,
          duration_seconds: s.duration_seconds,
          can_perform: !s.instrument_key || ownedInstKeys.has(s.instrument_key),
          missing_instrument: s.instrument_key && !ownedInstKeys.has(s.instrument_key) ? s.instrument_key : null,
          audio_url: s.audio_url,
        }));

      return json({
        ok: true,
        gold: profile.gold ?? 0,
        voice: profile.voice ?? "female",
        repertoire,
        scrolls: scrolls ?? [],
        owned_instruments: Array.from(ownedInstKeys),
        bard, bard_wares_songs: bardWaresSongs, bard_wares_instruments: bardWaresInstruments,
      });
    }

    // --- buy_song ----------------------------------------------------------
    if (action === "buy_song") {
      const songKey: string = String(body.song_key ?? "");
      const { data: song } = await admin.from("songs").select("key, title, vendor_price").eq("key", songKey).maybeSingle();
      if (!song || song.vendor_price == null) return json({ error: "not for sale" }, 400);
      const { data: existing } = await admin.from("player_songs").select("song_key").eq("user_id", user.id).eq("song_key", songKey).maybeSingle();
      if (existing) return json({ error: "you already know that song" }, 400);
      const gold = profile.gold ?? 0;
      if (gold < song.vendor_price) return json({ error: "not enough coin" }, 400);
      await admin.from("profiles").update({ gold: gold - song.vendor_price }).eq("id", user.id);
      await admin.from("player_songs").insert({ user_id: user.id, song_key: songKey, source: "vendor" });
      return json({ ok: true, learned: song.title, paid: song.vendor_price });
    }

    // --- buy_instrument ----------------------------------------------------
    if (action === "buy_instrument") {
      const itemKey: string = String(body.item_key ?? "");
      const prices: Record<string, number> = { lute: 60, fiddle: 50, "hand-drum": 30, "reed-flute": 25, "small-harp": 90 };
      if (!(itemKey in prices)) return json({ error: "no such instrument" }, 400);
      const price = prices[itemKey];
      const gold = profile.gold ?? 0;
      if (gold < price) return json({ error: "not enough coin" }, 400);
      await admin.from("profiles").update({ gold: gold - price }).eq("id", user.id);
      await admin.from("player_items").insert({ user_id: user.id, item_key: itemKey, quantity: 1 });
      return json({ ok: true, paid: price });
    }

    // --- learn_scroll ------------------------------------------------------
    if (action === "learn_scroll") {
      const playerItemId: string = String(body.player_item_id ?? "");
      const { data: pi } = await admin.from("player_items").select("id, item_key, quantity").eq("id", playerItemId).eq("user_id", user.id).maybeSingle();
      if (!pi) return json({ error: "no such scroll" }, 400);
      const { data: song } = await admin.from("songs").select("key, title").eq("scroll_item_key", pi.item_key).maybeSingle();
      if (!song) return json({ error: "this scroll teaches no song you can read" }, 400);
      const { data: known } = await admin.from("player_songs").select("song_key").eq("user_id", user.id).eq("song_key", song.key).maybeSingle();
      if (known) return json({ error: "you already know that song" }, 400);
      await admin.from("player_songs").insert({ user_id: user.id, song_key: song.key, source: "scroll" });
      // consume one scroll
      if ((pi.quantity ?? 1) > 1) {
        await admin.from("player_items").update({ quantity: pi.quantity - 1 }).eq("id", pi.id);
      } else {
        await admin.from("player_items").delete().eq("id", pi.id);
      }
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: "—", kind: "system",
        content: `${profile.username} unrolls a song-scroll and reads it through. They will not forget **${song.title}**.`,
      });
      return json({ ok: true, learned: song.title });
    }

    // --- perform -----------------------------------------------------------
    if (action === "perform") {
      const songKey: string = String(body.song_key ?? "");
      const { data: known } = await admin.from("player_songs").select("song_key").eq("user_id", user.id).eq("song_key", songKey).maybeSingle();
      if (!known) return json({ error: "you do not know that song" }, 400);
      const { data: song } = await admin.from("songs").select("*").eq("key", songKey).maybeSingle();
      if (!song) return json({ error: "no such song" }, 400);

      // Instrument check
      if (song.instrument_key) {
        const { data: inst } = await admin.from("player_items").select("id").eq("user_id", user.id).eq("item_key", song.instrument_key).maybeSingle();
        if (!inst) return json({ error: `you need a ${song.instrument_key.replace("-", " ")} to play this` }, 400);
      }

      // Get or generate audio
      let audioUrl: string | null = song.audio_url;
      if (!audioUrl) {
        try {
          // Make the prompt voice-aware using the player's voice IF the song has a vocal part
          let prompt = song.music_prompt;
          if (song.vocal_part === "male" || song.vocal_part === "female") {
            // already in prompt
          }
          const bytes = await generateSongAudio(prompt, song.duration_seconds);
          const path = `${song.key}.mp3`;
          const up = await admin.storage.from("music").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
          if (up.error) throw up.error;
          const { data: pub } = admin.storage.from("music").getPublicUrl(path);
          audioUrl = pub.publicUrl;
          await admin.from("songs").update({ audio_url: audioUrl }).eq("key", song.key);
        } catch (e) {
          console.error("music gen failed", e);
          return json({ error: "the song would not come — the air refused it (try again in a moment)" }, 502);
        }
      }

      // Rewards: gold tip from listeners (NPCs in room scaled by count), amity boost to one random NPC, merit
      const { data: roomNpcs } = await admin.from("npcs").select("id, name").eq("room", profile.current_room).is("dead_until", null);
      const listenerCount = roomNpcs?.length ?? 0;
      const tip = (song.base_tip ?? 5) + listenerCount * 2 + Math.floor(Math.random() * 4);
      const gold = (profile.gold ?? 0) + tip;
      const merit = (profile.merit ?? 0) + (song.merit_gain ?? 0);
      await admin.from("profiles").update({ gold, merit }).eq("id", user.id);

      // Amity bump on a random listener
      let amityNpcName: string | null = null;
      if (roomNpcs && roomNpcs.length > 0) {
        const npc = roomNpcs[Math.floor(Math.random() * roomNpcs.length)];
        amityNpcName = npc.name;
        const { data: cur } = await admin.from("npc_amity").select("score").eq("user_id", user.id).eq("npc_id", npc.id).maybeSingle();
        const newScore = Math.min(100, (cur?.score ?? 0) + (song.amity_gain ?? 1));
        if (cur) {
          await admin.from("npc_amity").update({ score: newScore, updated_at: new Date().toISOString() })
            .eq("user_id", user.id).eq("npc_id", npc.id);
        } else {
          await admin.from("npc_amity").insert({ user_id: user.id, npc_id: npc.id, score: newScore });
        }
      }

      // Broadcast performance message with audio
      const voiceLine = song.vocal_part === "instrumental"
        ? "plays"
        : (profile.voice === "male" ? "sings, baritone-low" : "sings, clear-voiced");
      const tail = amityNpcName
        ? `When the last note dies, ${amityNpcName} drops ${tip}g into the cup at their feet.`
        : `When the last note dies, no one is here to listen — but they leave ${tip}g richer for the playing anyway.`;
      await admin.from("messages").insert({
        room: profile.current_room, user_id: null, author_name: "—", kind: "performance",
        content: `${profile.username} ${voiceLine} **${song.title}**.\n\n[[audio:${audioUrl}]]\n\n${tail}`,
      });

      return json({ ok: true, audio_url: audioUrl, tip, merit_gain: song.merit_gain ?? 0, listener: amityNpcName });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
