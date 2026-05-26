import { useEffect, useState } from "react";

// Minimal, short cold-open. Three lines, ~6s total, then we're in.
const LINES = [
  "A world is waiting.",
  "It does not know your name — only that you are coming.",
  "Who will you be?",
];

const LINE_MS = 2000;
const FADE_MS = 500;

export default function Intro({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (i >= LINES.length) {
      const t = setTimeout(onDone, FADE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setI((n) => n + 1), LINE_MS);
    return () => clearTimeout(t);
  }, [i, onDone]);

  return (
    <main
      onClick={onDone}
      className="fixed inset-0 bg-black flex items-center justify-center px-8 cursor-pointer"
    >
      <div className="relative h-24 w-full max-w-xl flex items-center justify-center">
        {LINES.map((line, idx) => (
          <p
            key={idx}
            className="absolute text-center font-display text-xl md:text-3xl text-parchment leading-relaxed tracking-wide transition-opacity duration-500"
            style={{ opacity: idx === i ? 1 : 0 }}
          >
            {line}
          </p>
        ))}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDone(); }}
        className="absolute bottom-6 right-6 font-mono text-[10px] uppercase tracking-[0.4em] text-ash/60 hover:text-parchment border border-ash/30 hover:border-parchment px-3 py-1.5 transition-colors"
      >
        skip ›
      </button>
    </main>
  );
}
