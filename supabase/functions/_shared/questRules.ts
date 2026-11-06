// Who decides that a quest is done. Pure, dependency-free; used by npc-respond and quest-auto-resolve,
// tested in src/test/questRules.test.ts.
//
// House rule (README §4): code decides outcomes. A quest whose target is a real thing in the world is
// checked by code: a real item must be in the player's pack (and is handed over), a real room
// completes on arrival, a real NPC on a kill recorded by combat-action. Only quests with no real
// target (talk/favor quests, or targets the AI made up) are left to the NPC's judgment. Phase 2 of
// the quest fixes stops the AI from offering made-up targets.

export type CompletionMode = "item" | "room" | "kill" | "judgment" | "riddle";

export interface QuestLite {
  kind: string;
  target_kind: string | null;
  target_ref: string | null;
}

/** Which of the quest's possible targets exist in the world (looked up by the caller). */
export interface TargetExists {
  item: boolean;
  room: boolean;
  npc: boolean;
}

/** Guild templates default to 'visit'; every other source uses 'room'. Both name a room slug. */
export const ROOM_TARGET_KINDS = new Set(["room", "visit"]);

export function completionMode(q: QuestLite, exists: TargetExists): CompletionMode {
  if (q.kind === "riddle") return "riddle";           // riddle-solve checks the answer itself
  const tk = q.target_kind ?? "";
  if (!q.target_ref) return "judgment";
  if (tk === "item" && exists.item) return "item";
  if (ROOM_TARGET_KINDS.has(tk) && exists.room) return "room";
  if (q.kind === "slay" && tk === "npc" && exists.npc) return "kill";
  return "judgment";
}

/**
 * Whether an NPC's <<QUEST_RESOLVE>> "complete" may start completion. For item quests it only
 * starts the check: code then requires the item in the pack. Room and kill quests complete only
 * from the world (arrival, combat), never from what the player says.
 */
export function aiMayTriggerCompletion(mode: CompletionMode): boolean {
  return mode === "item" || mode === "judgment";
}

/** True when arriving in `room` completes the quest. `room` comes from the server, never the client. */
export function arrivalCompletes(q: QuestLite, room: string): boolean {
  if (q.kind === "riddle" || !q.target_ref || !room) return false;
  return ROOM_TARGET_KINDS.has(q.target_kind ?? "") && q.target_ref.toLowerCase() === room.toLowerCase();
}

/** One line for the NPC's prompt so its words match what the world will accept. */
export function completionHint(mode: CompletionMode, targetRef: string | null): string {
  switch (mode) {
    case "item": return `The world checks this one: it is done only when they actually hand you the item (${targetRef}). If they say they have it, emit QUEST_RESOLVE complete and the world will check their pack; do not congratulate them before it is confirmed.`;
    case "room": return `This completes on its own when they reach the place (${targetRef}). Never emit QUEST_RESOLVE complete for it.`;
    case "kill": return `This completes on its own when they slay the target. Never emit QUEST_RESOLVE complete for it.`;
    case "riddle": return `This is a riddle; it is settled by their answer, not by you. Never emit QUEST_RESOLVE for it.`;
    default: return `You judge whether they have fulfilled it.`;
  }
}

// ---------- what an NPC may offer (phase 2) ----------

export const SEVERITIES = ["trivial", "minor", "standard", "major", "legendary"] as const;
export type Severity = typeof SEVERITIES[number];

/** Reward ceilings per severity, as returned by the SQL function quest_reward_caps (the source of truth). */
export interface RewardCaps { gold_max: number; xp_max: number; amity_max: number }

export interface NpcRoles {
  is_aether?: boolean | null; is_warden?: boolean | null; is_boss?: boolean | null;
  is_merchant?: boolean | null; is_guard?: boolean | null; is_bard?: boolean | null;
  is_fence?: boolean | null; is_guildmaster?: boolean | null;
}

/**
 * The biggest quest an NPC may offer, by who it is (owner's decision, phase 2). Ordinary residents
 * can only ask small favours; gods can set legendary tasks. The AI's chosen severity is clamped to this.
 */
export function severityCeiling(n: NpcRoles): Severity {
  if (n.is_aether) return "legendary";
  if (n.is_warden || n.is_boss) return "major";
  if (n.is_merchant || n.is_guard || n.is_bard || n.is_fence || n.is_guildmaster) return "standard";
  return "minor";
}

/** The AI's severity, lowered to the ceiling. Anything unrecognised counts as minor. */
export function clampSeverity(asked: unknown, ceiling: Severity): Severity {
  const a = SEVERITIES.includes(asked as Severity) ? (asked as Severity) : "minor";
  return SEVERITIES.indexOf(a) <= SEVERITIES.indexOf(ceiling) ? a : ceiling;
}

/** Gold an NPC sets aside for a quest: what it promised, within the severity cap and its own purse. */
export function escrowFor(askedGold: unknown, capGold: number, purse: number): number {
  const asked = Math.floor(Number(askedGold) || 0);
  return Math.max(0, Math.min(asked, capGold, Math.max(0, Math.floor(purse))));
}

/** Gold that goes back to whoever funded a quest: the escrow minus what the player was paid. */
export function refundAfterPayout(escrow: number, paid: number): number {
  return Math.max(0, (escrow ?? 0) - Math.max(0, paid ?? 0));
}

/**
 * The smallest severity whose gold cap covers a board reward, so a player's posted reward is paid in
 * full (it used to be clamped to the minor cap and the rest vanished). Null if no severity covers it.
 */
export function severityForGold(gold: number, caps: Record<Severity, RewardCaps>): Severity | null {
  return SEVERITIES.find((s) => caps[s] && caps[s].gold_max >= gold) ?? null;
}

/** Which targets each AI quest kind may point at, and whether it must have one. */
export const TARGET_POLICY: Record<string, { required: boolean; kinds: string[] }> = {
  fetch:   { required: true,  kinds: ["item"] },
  deliver: { required: true,  kinds: ["item", "npc", "room"] },
  visit:   { required: true,  kinds: ["room"] },
  slay:    { required: true,  kinds: ["npc"] },
  talk:    { required: false, kinds: ["npc", "room", "item"] },
  favor:   { required: false, kinds: ["npc", "room", "item"] },
};

export type TargetCheck =
  | { ok: true; target_kind: string | null; target_ref: string | null }
  | { ok: false; reason: string };

/**
 * Decide an AI quest offer's target once the caller has tried to match it to something real
 * (`resolved` is the real key/slug/id, or null). Owner's decision: fetch, deliver, visit and slay
 * quests without a real target are dropped; talk and favour quests just lose the fake target.
 */
export function checkOfferTarget(kind: string, targetKind: string | null, resolved: string | null): TargetCheck {
  const policy = TARGET_POLICY[kind];
  if (!policy) return { ok: false, reason: `unknown quest kind ${kind}` };
  const allowed = !!targetKind && policy.kinds.includes(targetKind);
  if (allowed && resolved) return { ok: true, target_kind: targetKind, target_ref: resolved };
  if (policy.required) return { ok: false, reason: `${kind} quest needs a real ${policy.kinds.join("/")} target` };
  return { ok: true, target_kind: null, target_ref: null };
}

/** Board postings say 'visit' for a room; quests say 'room'. Other target kinds carry over unchanged. */
export function questTargetKindFromBoard(postedKind: string | null): string {
  return !postedKind || postedKind === "visit" ? "room" : postedKind;
}
