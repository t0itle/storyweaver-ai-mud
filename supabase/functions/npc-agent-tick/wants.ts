// Turning an NPC's wants into help from players. Filled in by phase 3 (posted quests, letters).
import type { Want } from "../_shared/npcMind.ts";

export interface WantContext {
  npc: { id: string; name: string; room: string; home_room: string | null; purse_gold: number };
  wants: Want[];
  roomBySlug: Map<string, { slug: string; name: string; kind: string; town_key: string | null }>;
  now: Date;
}

// deno-lint-ignore no-explicit-any
export async function pursueWants(_admin: any, ctx: WantContext): Promise<Want[]> {
  return ctx.wants;
}
