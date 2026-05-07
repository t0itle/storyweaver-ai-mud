import { useEffect, useRef, useState } from "react";
import introVideo from "@/assets/intro-creation.mp4.asset.json";

// Kingdom-Hearts-style intimate lead-in, then the creation myth, then the question.
// Each line fades in, holds, fades out. Small form, one breath at a time.
const VERSES: { text: string; at: number; hold: number }[] = [
  // ── Lead-in: the world is asking ──
  { text: "Close your eyes.", at: 600, hold: 2600 },
  { text: "Somewhere, a world you have never seen\nis already waiting for you.", at: 3600, hold: 3600 },
  { text: "It does not know your name yet.", at: 7600, hold: 3000 },
  { text: "It does not know your face.", at: 10800, hold: 3000 },
  { text: "Only that you are coming.", at: 14000, hold: 3200 },
  { text: "And that, when you arrive,\nit would like to ask you something.", at: 17400, hold: 4000 },

  // ── Creation myth ──
  { text: "But first —\nlisten to how it began.", at: 21800, hold: 3600 },
  { text: "In the beginning, there was nothing.", at: 25600, hold: 3200 },
  { text: "Then the Light came…", at: 29200, hold: 3000 },
  { text: "And the Speaker opened its mouth.", at: 32400, hold: 3200 },
  { text: "From that breath poured the seven Aethers —\nevery spoken thing.", at: 35800, hold: 4000 },
  { text: "But for every light, a Shadow waits.", at: 40000, hold: 3400 },
  { text: "The Speaker is silenced now.\nThe maps are eaten. The cities forget their names.", at: 43600, hold: 4400 },

  // ── The question ──
  { text: "And yet — a single pool still blooms\nin the deep desert.", at: 48200, hold: 3800 },
  { text: "It is asking who you mean to be.", at: 52200, hold: 3600 },
  { text: "Take your time.\nThe answer is yours alone.", at: 56000, hold: 4000 },
];

const TOTAL = 60600; // a touch past the last verse exit

export default function Intro({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const startRef = useRef<number>(performance.now());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      setT(now - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (skipped) return;
    if (t >= TOTAL) onDone();
  }, [t, skipped, onDone]);

  const skip = () => {
    if (skipped) return;
    setSkipped(true);
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
