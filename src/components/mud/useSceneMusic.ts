import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>(); // scene_key -> data URI

export function useSceneMusic(kind: string | null | undefined, bucket: string | null | undefined, enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentKeyRef = useRef<string | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("everbloom_music_muted") === "1";
  });

  // persist mute
  useEffect(() => {
    try { localStorage.setItem("everbloom_music_muted", muted ? "1" : "0"); } catch {}
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!enabled || !kind || !bucket) return;
    let cancelled = false;

    (async () => {
      const sceneHint = `${kind}|${bucket}`;
      // Avoid restarting if same scene (we'll check after fetch returns real key)
      try {
        let dataUri = cache.get(sceneHint);
        let realKey = sceneHint;
        if (!dataUri) {
          const { data, error } = await supabase.functions.invoke("scene-music", {
            body: { kind, bucket },
          });
          if (error || !data?.audioContent) return;
          realKey = data.scene_key ?? sceneHint;
          dataUri = `data:audio/mpeg;base64,${data.audioContent}`;
          cache.set(sceneHint, dataUri);
          cache.set(realKey, dataUri);
        }
        if (cancelled) return;
        if (currentKeyRef.current === realKey && audioRef.current && !audioRef.current.paused) return;

        // Stop existing
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        const a = new Audio(dataUri);
        a.loop = true;
        a.volume = 0.35;
        a.muted = muted;
        // Safety net: some browsers won't honor loop on data:audio/mpeg streams.
        a.addEventListener("ended", () => {
          try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* ignore */ }
        });
        audioRef.current = a;
        currentKeyRef.current = realKey;
        a.play().catch(() => { /* needs user gesture on first load */ });
      } catch {
        /* ignore */
      }
    })();

    return () => { cancelled = true; };
  }, [kind, bucket, enabled]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  const tryResume = () => {
    audioRef.current?.play().catch(() => {});
  };

  return { muted, setMuted, tryResume };
}
