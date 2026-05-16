import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AudioRow = { slug: string; music_url: string | null; ambient_url: string | null; status: string };

const cache = new Map<string, AudioRow>();
const inFlight = new Set<string>();

async function getAudio(slug: string): Promise<AudioRow | null> {
  if (cache.has(slug)) return cache.get(slug)!;
  const { data } = await supabase
    .from("room_audio")
    .select("slug, music_url, ambient_url, status")
    .eq("slug", slug)
    .maybeSingle();
  if (data?.music_url || data?.ambient_url) {
    cache.set(slug, data as AudioRow);
    return data as AudioRow;
  }
  if (!inFlight.has(slug)) {
    inFlight.add(slug);
    supabase.functions
      .invoke("room-audio-generate", { body: { slug } })
      .then((res) => {
        const r = res.data as AudioRow | undefined;
        if (r?.music_url || r?.ambient_url) cache.set(slug, r);
      })
      .finally(() => inFlight.delete(slug));
  }
  return null;
}

function fade(audio: HTMLAudioElement, to: number, ms = 600) {
  const from = audio.volume;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
    else if (to === 0) audio.pause();
  };
  requestAnimationFrame(step);
}

export function useRoomAudio(roomSlug: string | null | undefined, mode: "room" | "combat" | "rest") {
  const musicEl = useRef<HTMLAudioElement | null>(null);
  const ambientEl = useRef<HTMLAudioElement | null>(null);
  const currentMusicSrc = useRef<string | null>(null);
  const currentAmbientSrc = useRef<string | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("everbloom_audio_muted") === "1";
  });
  const [musicVol, setMusicVol] = useState(0.28);
  const [ambientVol, setAmbientVol] = useState(0.45);

  useEffect(() => {
    try { localStorage.setItem("everbloom_audio_muted", muted ? "1" : "0"); } catch {}
    if (musicEl.current) musicEl.current.muted = muted;
    if (ambientEl.current) ambientEl.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!roomSlug) return;
    let cancelled = false;

    const targetSlug = mode === "combat" ? "__combat__" : mode === "rest" ? "__rest__" : roomSlug;

    (async () => {
      const row = await getAudio(targetSlug);
      if (cancelled || !row) return;

      // Music
      if (row.music_url && row.music_url !== currentMusicSrc.current) {
        if (musicEl.current) fade(musicEl.current, 0, 400);
        const a = new Audio(row.music_url);
        a.loop = true;
        a.volume = 0;
        a.muted = muted;
        a.crossOrigin = "anonymous";
        musicEl.current = a;
        currentMusicSrc.current = row.music_url;
        a.play().then(() => fade(a, musicVol, 800)).catch(() => {});
      }
      // Ambient — only for true room mode (combat/rest get only music swap, ambient continues)
      if (mode === "room" && row.ambient_url && row.ambient_url !== currentAmbientSrc.current) {
        if (ambientEl.current) fade(ambientEl.current, 0, 400);
        const b = new Audio(row.ambient_url);
        b.loop = true;
        b.volume = 0;
        b.muted = muted;
        b.crossOrigin = "anonymous";
        ambientEl.current = b;
        currentAmbientSrc.current = row.ambient_url;
        b.play().then(() => fade(b, ambientVol, 800)).catch(() => {});
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSlug, mode]);

  // Cleanup
  useEffect(() => () => {
    musicEl.current?.pause();
    ambientEl.current?.pause();
    musicEl.current = null;
    ambientEl.current = null;
  }, []);

  const tryResume = () => {
    musicEl.current?.play().catch(() => {});
    ambientEl.current?.play().catch(() => {});
  };

  return { muted, setMuted, tryResume, musicVol, setMusicVol, ambientVol, setAmbientVol };
}
