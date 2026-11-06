// Room memory and cadence: what a room currently "is" and what happens next while a player is in it.
// Pure, dependency-free TypeScript shared by room-pulse, npc-respond and tests (src/test/roomScene.test.ts).
//
// House rule (README §4): code decides WHETHER something happens and WHO does it; the AI only writes
// the words. A room's lasting state is a short list of facts that expire, so a room changes over time
// instead of being stuck in its fixed description.

export interface SceneFact {
  text: string;
  by: string | null;   // NPC name, or null for the room itself
  at: string;          // ISO time the fact was recorded
  until: string;       // ISO time it stops being true
}

/** A room keeps at most this many live facts; the oldest fall away first. */
export const MAX_FACTS = 6;
/** How long a fact stays true unless something replaces it. */
export const FACT_TTL_HOURS = 3;
/** Longest fact or NPC action line kept, in characters. */
export const MAX_LINE = 180;

/** Facts still true at `now`. */
export function liveFacts(facts: SceneFact[] | null | undefined, now: Date): SceneFact[] {
  const t = now.toISOString();
  return (facts ?? []).filter((f) => f && typeof f.text === "string" && f.until > t);
}

/** Add a fact: drop expired ones and an identical earlier one, keep the newest MAX_FACTS. */
export function addFact(facts: SceneFact[] | null | undefined, text: string, by: string | null, now: Date,
  ttlHours = FACT_TTL_HOURS): SceneFact[] {
  const clean = cleanLine(text);
  const live = liveFacts(facts, now);
  if (!clean) return live;
  const fact: SceneFact = {
    text: clean, by, at: now.toISOString(),
    until: new Date(now.getTime() + ttlHours * 3_600_000).toISOString(),
  };
  const kept = live.filter((f) => f.text.toLowerCase() !== clean.toLowerCase());
  return [...kept, fact].slice(-MAX_FACTS);
}

/** Strip markup a model tends to add, collapse whitespace, clip. Empty string if nothing is left. */
export function cleanLine(text: unknown): string {
  return String(text ?? "")
    .replace(/[*_`"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "")
    .slice(0, MAX_LINE)
    .trim();
}

/**
 * An NPC's physical action as written by the model, made safe to post. It must be third person
 * and start with the NPC's name (or first name), and must not contain speech. Returns null when
 * it fails, so a bad action is dropped rather than shown.
 */
export function sanitizeAction(text: unknown, npcName: string): string | null {
  const raw = String(text ?? "");
  if (/["“”]/.test(raw)) return null;               // speech belongs in the reply, not the action
  const line = cleanLine(raw);
  if (line.length < 8) return null;
  const first = npcName.split(/\s+/)[0].toLowerCase();
  const lower = line.toLowerCase();
  if (!lower.startsWith(npcName.toLowerCase()) && !lower.startsWith(first)) return null;
  return line + ".";
}

/** The scene as a prompt block. Fact text came from a model, so it goes in as quoted data. */
export function sceneBlock(facts: SceneFact[], now: Date): string {
  const live = liveFacts(facts, now);
  if (!live.length) return "(nothing has changed here lately)";
  return live.map((f) => {
    const mins = Math.max(0, Math.round((now.getTime() - new Date(f.at).getTime()) / 60_000));
    return `- (${mins}m ago${f.by ? `, ${f.by}` : ""}) ${JSON.stringify(f.text)}`;
  }).join("\n");
}

// ---------- cadence ----------

/** Minimum gap between pulses in one room, whoever's client asks. Two players share one stream. */
export const PULSE_GAP_SEC = 40;
/** Minimum gap between AI-written NPC openers in one room (the "rare" path). */
export const NPC_AI_GAP_SEC = 5 * 60;
/** One NPC won't start a conversation (AI or template) more often than this, per room. */
export const NPC_INITIATIVE_COOLDOWN_SEC = 10 * 60;
/** Amity at which an NPC is willing to spend words on a player unprompted. Matches disclosure level 1. */
export const INITIATIVE_AMITY = 20;

/** Chances per pulse, checked in this order. */
export const CHANCE = {
  npcAi: 0.35,        // an eligible NPC (amity/want) speaks first with an AI line, if the AI gap allows
  npcTemplate: 0.15,  // any off-cooldown NPC acknowledges the player with a free template line
  npcBusiness: 0.4,   // a present NPC does a small piece of business fitting the room
} as const;

export interface PulseNpc {
  id: string;
  name: string;
  amity: number;       // toward the player whose client is pulsing
  want: string | null; // open want text, if the NPC has one
}

export interface PulseScene {
  last_pulse_at: string | null;
  last_npc_ai_at: string | null;
  npc_spoke: Record<string, string> | null; // npc id -> ISO time it last started a conversation here
}

export type PulseDecision =
  | { kind: "none" }
  | { kind: "ambient" }
  | { kind: "npc_business"; npc: PulseNpc }
  | { kind: "npc_greet"; npc: PulseNpc }
  | { kind: "npc_speak"; npc: PulseNpc };

const secsSince = (iso: string | null | undefined, now: Date) =>
  iso ? (now.getTime() - new Date(iso).getTime()) / 1000 : Infinity;

/** True when the room has had a pulse too recently (another player's client already did it). */
export function pulseTooSoon(scene: Pick<PulseScene, "last_pulse_at">, now: Date): boolean {
  return secsSince(scene.last_pulse_at, now) < PULSE_GAP_SEC;
}

/**
 * What happens in the room this pulse. `rng` returns [0,1); pass Math.random in production and a
 * fixed sequence in tests. The AI never makes this choice.
 */
export function decidePulse(scene: PulseScene, npcs: PulseNpc[], now: Date, rng: () => number): PulseDecision {
  if (pulseTooSoon(scene, now)) return { kind: "none" };
  const spoke = scene.npc_spoke ?? {};
  const fresh = npcs.filter((n) => secsSince(spoke[n.id], now) >= NPC_INITIATIVE_COOLDOWN_SEC);
  const pick = <T,>(xs: T[]) => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

  // Rare, paid: only NPCs with a reason (warm enough, or wanting something), and only every few minutes.
  const motivated = fresh.filter((n) => n.amity >= INITIATIVE_AMITY || n.want);
  if (motivated.length && secsSince(scene.last_npc_ai_at, now) >= NPC_AI_GAP_SEC && rng() < CHANCE.npcAi) {
    // Prefer the NPC with a want, then the warmest.
    const best = [...motivated].sort((a, b) => Number(!!b.want) - Number(!!a.want) || b.amity - a.amity)[0];
    return { kind: "npc_speak", npc: best };
  }
  if (fresh.length && rng() < CHANCE.npcTemplate) return { kind: "npc_greet", npc: pick(fresh) };
  if (npcs.length && rng() < CHANCE.npcBusiness) return { kind: "npc_business", npc: pick(npcs) };
  return { kind: "ambient" };
}

/** Record that an NPC started a conversation; forgets entries older than the cooldown. */
export function markSpoke(spoke: Record<string, string> | null | undefined, npcId: string, now: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, at] of Object.entries(spoke ?? {})) {
    if (secsSince(at, now) < NPC_INITIATIVE_COOLDOWN_SEC) out[id] = at;
  }
  out[npcId] = now.toISOString();
  return out;
}

// ---------- free opener lines (no AI) ----------

const GREET_WARM = [
  '{n} looks up and brightens. "{p}. Good to see you."',
  '{n} lifts a hand to you. "Back again, {p}?"',
  '{n} nods you over. "Come, sit a moment."',
];
const GREET_NEUTRAL = [
  "{n} glances your way, then back to what they were doing.",
  "{n} gives you a short, measuring look.",
  '{n} nods once. "Traveller."',
];
const GREET_COLD = [
  "{n} watches you without blinking.",
  "{n} turns a shoulder to you, pointedly.",
  '{n} mutters, "You again."',
];
const GREET_WANT = [
  "{n} catches your eye, as if weighing whether to ask you something.",
  "{n} opens their mouth to call to you, then hesitates.",
];

/** A free line for an NPC acknowledging the player. `seed` picks the variant deterministically. */
export function greetLine(npc: PulseNpc, playerName: string, seed: number): string {
  const pool = npc.want ? GREET_WANT
    : npc.amity >= INITIATIVE_AMITY ? GREET_WARM
    : npc.amity <= -INITIATIVE_AMITY ? GREET_COLD
    : GREET_NEUTRAL;
  const line = pool[Math.abs(Math.floor(seed)) % pool.length];
  return line.replace("{n}", npc.name).replace("{p}", playerName);
}

// ---------- parsing model output ----------

/**
 * Parse a model reply that should be JSON. Tolerates a ```json fence or prose around the object.
 * Returns null if there is no object.
 */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const m = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
