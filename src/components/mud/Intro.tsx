import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import introVideo from "@/assets/intro-creation.mp4.asset.json";
import panel1 from "@/assets/intro/panel-1-spark.png";
import panel2 from "@/assets/intro/panel-2-speaker.png";
import panel3 from "@/assets/intro/panel-3-aethers.png";
import panel4 from "@/assets/intro/panel-4-descent.png";
import panel5 from "@/assets/intro/panel-5-wardens.png";
import panel6 from "@/assets/intro/panel-6-firstcity.png";
import panel7 from "@/assets/intro/panel-7-shadow.png";
import panel8 from "@/assets/intro/panel-8-chaos.png";
import panel9 from "@/assets/intro/panel-9-relics.png";

// Kingdom-Hearts-style intimate lead-in, then the creation myth, then the question.
// Each verse fades in over a comic panel while an epic choir score swells underneath.
const VERSES: { text: string; at: number; hold: number; panel: string }[] = [
  { text: "A world is waiting for you.",                                                    at: 600,   hold: 3200, panel: panel6 },
  { text: "It does not know your name —\nonly that you are coming.",                        at: 4200,  hold: 3800, panel: panel6 },
  { text: "In the beginning, there was nothing.",                                           at: 8400,  hold: 3200, panel: panel1 },
  { text: "Then the Light came.",                                                            at: 11800, hold: 3000, panel: panel2 },
  { text: "The Speaker opened its mouth,\nand the seven Aethers were spoken.",              at: 15000, hold: 4000, panel: panel3 },
  { text: "Where they walked,\ntwelve wardens woke to keep their light.",                   at: 19200, hold: 4000, panel: panel5 },
  { text: "And then — from beyond —\nsomething unspoken stirred.",                          at: 23400, hold: 3800, panel: panel7 },
  { text: "Chaos gave them gifts. Each rewrote\ntheir own fate by will alone.",             at: 27400, hold: 4000, panel: panel8 },
  { text: "Scattered in ruin, the Speaker's relics still hum.\nThose who find them hear the voice again.", at: 31600, hold: 4400, panel: panel9 },
  { text: "A single pool still blooms in the desert.",                                       at: 36200, hold: 3600, panel: panel4 },
  { text: "It is asking who you mean to be.",                                                at: 40000, hold: 4200, panel: panel6 },
];

const TOTAL = 44600;

export default function Intro({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [started, setStarted] = useState(false);
  const startRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);

  // Preload the music URL ASAP (cached after first generation)
  useEffect(() => {
    let cancel = false;
    supabase.functions.invoke("intro-music").then(({ data }) => {
      if (cancel) return;
      if (data?.url) setMusicUrl(data.url as string);
    }).catch(() => {});
    return () => { cancel = true; };
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

  useEffect(() => {
    if (skipped) return;
    if (t >= TOTAL) onDone();
  }, [t, skipped, onDone]);

  const stopMusic = () => {
    const a = audioRef.current;
    if (!a) return;
    // gentle fade out
    const start = a.volume;
    const t0 = performance.now();
    const fade = () => {
      const k = Math.min(1, (performance.now() - t0) / 800);
      a.volume = start * (1 - k);
      if (k < 1) requestAnimationFrame(fade);
      else { a.pause(); }
    };
    fade();
  };

  const skip = () => {
    if (!started || skipped) return;
    setSkipped(true);
    stopMusic();
    onDone();
  };

  const begin = () => {
    if (started) return;
    startRef.current = performance.now();
    setStarted(true);
    // Try to play the music; ignore failures (autoplay policy will accept after user gesture).
    const a = audioRef.current;
    if (a) {
      a.volume = 0;
      a.play().catch(() => {});
      // fade in over 2.5s
      const t0 = performance.now();
      const fadeIn = () => {
        const k = Math.min(1, (performance.now() - t0) / 2500);
        a.volume = 0.7 * k;
        if (k < 1) requestAnimationFrame(fadeIn);
      };
      fadeIn();
    }
  };

  // Verse opacity: 800ms fade in, hold, 800ms fade out.
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

  // Find the active verse for the panel display (so panels crossfade with the words).
  const activeVerse = (() => {
    for (let i = VERSES.length - 1; i >= 0; i--) {
      if (t >= VERSES[i].at) return VERSES[i];
    }
    return null;
  })();

  return (
    <main
      className={`fixed inset-0 bg-black overflow-hidden ${started ? "cursor-pointer" : ""}`}
      onClick={started ? skip : undefined}
    >
      {/* Hidden audio element — src set once we have the URL */}
      {musicUrl && (
        <audio ref={audioRef} src={musicUrl} loop preload="auto" />
      )}

      {/* Background: looping starfield-ish video */}
      <video
        ref={videoRef}
        src={introVideo.url}
        autoPlay
        muted
        playsInline
        loop
        onLoadedMetadata={(e) => { (e.currentTarget as HTMLVideoElement).playbackRate = 0.5; }}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: started ? 0.35 : 0.25, transition: "opacity 600ms ease-out" }}
      />

      {/* Comic panel crossfade */}
      {started && VERSES.map((v, i) => {
        const o = verseOpacity(v.at, v.hold);
        if (o <= 0) return null;
        // Only render the panel that matches the active verse to avoid stacking unrelated images
        if (activeVerse?.panel !== v.panel) return null;
        return (
          <img
            key={`panel-${i}`}
            src={v.panel}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              opacity: o * 0.85,
              transform: `scale(${1.02 + (1 - o) * 0.02})`,
              transition: "transform 600ms ease-out",
              filter: "drop-shadow(0 0 60px rgba(0,0,0,0.9))",
            }}
          />
        );
      })}

      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/85 pointer-events-none" />

      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-8 px-6 text-center animate-fade-in">
          <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-ash/70">— EverBloom —</p>
          <h1 className="font-display text-3xl md:text-5xl text-parchment leading-tight max-w-2xl drop-shadow-[0_2px_30px_rgba(0,0,0,0.9)]">
            A world is waiting for you.
          </h1>
          <button
            onClick={begin}
            className="font-mono text-xs uppercase tracking-[0.5em] text-parchment border border-parchment/60 hover:border-parchment hover:bg-parchment/10 px-6 py-3 transition-colors"
          >
            begin ›
          </button>
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-ash/50">
            tap to begin · sound on recommended
          </p>
        </div>
      )}

      <div className="relative h-full w-full flex items-end md:items-center justify-center px-6 pb-24 md:pb-0">
        {started && VERSES.map((v, i) => {
          const o = verseOpacity(v.at, v.hold);
          if (o <= 0) return null;
          return (
            <p
              key={i}
              className="absolute max-w-xl text-center font-display text-lg md:text-2xl lg:text-3xl text-parchment leading-relaxed tracking-wide whitespace-pre-line drop-shadow-[0_2px_30px_rgba(0,0,0,0.95)]"
              style={{ opacity: o, transform: `translateY(${(1 - o) * 6}px)`, transition: "transform 240ms ease-out" }}
            >
              {v.text}
            </p>
          );
        })}
      </div>

      {started && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); skip(); }}
            className="absolute bottom-6 right-6 font-mono text-[10px] uppercase tracking-[0.4em] text-ash/60 hover:text-parchment border border-ash/30 hover:border-parchment px-3 py-1.5 transition-colors z-20"
          >
            skip ›
          </button>
          <p className="absolute bottom-6 left-6 font-mono text-[10px] uppercase tracking-[0.4em] text-ash/40">
            click anywhere to skip
          </p>
        </>
      )}
    </main>
  );
}
