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
