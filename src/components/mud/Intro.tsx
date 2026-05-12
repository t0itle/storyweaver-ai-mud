import { useEffect, useRef, useState } from "react";
import introVideo from "@/assets/intro-creation.mp4.asset.json";
import { supabase } from "@/integrations/supabase/client";

// Kingdom-Hearts-style intimate lead-in, then the creation myth, then the question.
// Each line fades in, holds, fades out. Small form, one breath at a time.
const VERSES: { text: string; at: number; hold: number }[] = [
  // ── Lead-in ──
  { text: "A world is waiting for you.", at: 600, hold: 3200 },
  { text: "It does not know your name —\nonly that you are coming.", at: 4200, hold: 3800 },

  // ── Creation myth ──
  { text: "In the beginning, there was nothing.", at: 8400, hold: 3200 },
  { text: "Then the Light came.", at: 11800, hold: 3000 },
  { text: "The Speaker opened its mouth,\nand the seven Aethers were spoken.", at: 15000, hold: 4000 },
  { text: "For every light, a Shadow waits.", at: 19200, hold: 3400 },

  // ── The question ──
  { text: "A single pool still blooms in the desert.", at: 22800, hold: 3600 },
  { text: "It is asking who you mean to be.", at: 26600, hold: 3800 },
];

const TOTAL = 30800;

export default function Intro({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [started, setStarted] = useState(false);
  const startRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const playedRef = useRef<Set<number>>(new Set());
  const versesAudioRef = useRef<{ at: number; url: string }[]>([]);
  const [audioReady, setAudioReady] = useState(false);

  // Fetch (and cache) per-verse narration urls once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("intro-narration", { body: {} });
        if (cancelled) return;
        if (data?.verses?.length) {
          versesAudioRef.current = data.verses;
          data.verses.forEach((v: { at: number; url: string }) => {
            const a = new Audio(v.url);
            a.preload = "auto";
            a.volume = 0.95;
            audiosRef.current.push(a);
          });
          setAudioReady(true);
        }
      } catch { /* ignore — intro still plays silently */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const loop = (now: number) => {
      setT(now - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // Trigger each verse's audio at its `at` ms.
  useEffect(() => {
    const list = versesAudioRef.current;
    if (!list.length) return;
    list.forEach((v, i) => {
      if (!playedRef.current.has(i) && t >= v.at) {
        playedRef.current.add(i);
        const a = audiosRef.current[i];
        if (a) a.play().catch(() => { /* gesture needed */ });
      }
    });
  }, [t]);

  // Stop all audio on unmount/skip.
  useEffect(() => () => {
    audiosRef.current.forEach((a) => { try { a.pause(); a.src = ""; } catch {} });
    audiosRef.current = [];
  }, []);


  useEffect(() => {
    if (skipped) return;
    if (t >= TOTAL) onDone();
  }, [t, skipped, onDone]);

  const skip = () => {
    if (skipped) return;
    setSkipped(true);
    audiosRef.current.forEach((a) => { try { a.pause(); a.src = ""; } catch {} });
    onDone();
  };

  // Compute opacity for a verse: fade in over 800ms, hold, fade out over 800ms.
  const verseOpacity = (at: number, hold: number) => {
    const FADE = 800;
    const start = at;
    const end = at + hold;
    if (t < start) return 0;
    if (t < start + FADE) return (t - start) / FADE;
    if (t < end - FADE) return 1;
    if (t < end) return Math.max(0, (end - t) / FADE);
    return 0;
  };

  // Background video brightens slightly as the myth progresses.
  const videoOpacity = Math.min(1, Math.max(0.05, t / 2000));

  return (
    <main className="fixed inset-0 bg-black overflow-hidden cursor-pointer" onClick={skip}>
      <video
        ref={videoRef}
        src={introVideo.url}
        autoPlay
        muted
        playsInline
        loop
        onLoadedMetadata={(e) => { (e.currentTarget as HTMLVideoElement).playbackRate = 0.5; }}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: videoOpacity, transition: "opacity 600ms ease-out" }}
      />
      {/* darkening vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/80 pointer-events-none" />

      {/* verses */}
      <div className="relative h-full w-full flex items-center justify-center px-6">
        {VERSES.map((v, i) => {
          const o = verseOpacity(v.at, v.hold);
          if (o <= 0) return null;
          return (
            <p
              key={i}
              className="absolute max-w-xl text-center font-display text-lg md:text-2xl lg:text-3xl text-parchment leading-relaxed tracking-wide whitespace-pre-line drop-shadow-[0_2px_30px_rgba(0,0,0,0.9)]"
              style={{ opacity: o, transform: `translateY(${(1 - o) * 6}px)`, transition: "transform 240ms ease-out" }}
            >
              {v.text}
            </p>
          );
        })}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); skip(); }}
        className="absolute bottom-6 right-6 font-mono text-[10px] uppercase tracking-[0.4em] text-ash/60 hover:text-parchment border border-ash/30 hover:border-parchment px-3 py-1.5 transition-colors"
      >
        skip ›
      </button>
      <p className="absolute bottom-6 left-6 font-mono text-[10px] uppercase tracking-[0.4em] text-ash/40">
        click anywhere to skip
      </p>
    </main>
  );
}
