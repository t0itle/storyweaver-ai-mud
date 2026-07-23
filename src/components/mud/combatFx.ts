// Lightweight WebAudio-synth SFX for combat buttons. No assets, no network.
let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function envTone(opts: {
  freq: number; freqEnd?: number; type?: OscillatorType;
  dur: number; gain?: number; delay?: number;
}) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + opts.dur);
  }
  const peak = opts.gain ?? 0.25;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

function noiseBurst(dur: number, gain = 0.18, hp = 1200) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = hp;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(ac.destination);
  src.start(t0);
}

function vibrate(ms: number | number[]) {
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); } catch {}
}

export const combatFx = {
  attack() {
    // metal whoosh + clang
    noiseBurst(0.12, 0.22, 1800);
    envTone({ freq: 380, freqEnd: 90, type: "sawtooth", dur: 0.18, gain: 0.28 });
    envTone({ freq: 1600, freqEnd: 700, type: "square", dur: 0.10, gain: 0.10, delay: 0.04 });
    vibrate(28);
  },
  defend() {
    // wood/leather thud + low pulse
    envTone({ freq: 180, freqEnd: 120, type: "triangle", dur: 0.18, gain: 0.32 });
    noiseBurst(0.08, 0.10, 400);
    vibrate(18);
  },
  cast() {
    // sparkly upward sweep
    envTone({ freq: 420, freqEnd: 1400, type: "sine", dur: 0.22, gain: 0.18 });
    envTone({ freq: 700, freqEnd: 2100, type: "sine", dur: 0.22, gain: 0.12, delay: 0.04 });
    vibrate(22);
  },
  trace() {
    // chime tap
    envTone({ freq: 1320, freqEnd: 1320, type: "sine", dur: 0.25, gain: 0.18 });
    envTone({ freq: 1980, freqEnd: 1980, type: "sine", dur: 0.20, gain: 0.10, delay: 0.02 });
    vibrate(12);
  },
  flee() {
    // panicked descending whistle
    envTone({ freq: 900, freqEnd: 200, type: "sawtooth", dur: 0.28, gain: 0.18 });
    noiseBurst(0.18, 0.10, 900);
    vibrate([10, 30, 10]);
  },
  hover() {
    envTone({ freq: 1100, freqEnd: 1100, type: "sine", dur: 0.04, gain: 0.05 });
  },
  ambush() {
    // danger sting — low brass hit with a rattle of grit
    envTone({ freq: 110, freqEnd: 70, type: "sawtooth", dur: 0.4, gain: 0.3 });
    envTone({ freq: 220, freqEnd: 160, type: "square", dur: 0.25, gain: 0.12, delay: 0.03 });
    noiseBurst(0.22, 0.14, 700);
    vibrate([30, 40, 30]);
  },
  success() {
    // quest chime — rising fifth with a soft shimmer
    envTone({ freq: 660, freqEnd: 660, type: "sine", dur: 0.22, gain: 0.18 });
    envTone({ freq: 990, freqEnd: 990, type: "sine", dur: 0.34, gain: 0.16, delay: 0.1 });
    envTone({ freq: 1980, freqEnd: 1980, type: "sine", dur: 0.28, gain: 0.06, delay: 0.14 });
    vibrate(15);
  },
};

export type CombatFxKind = keyof typeof combatFx;
