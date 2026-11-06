// Moving escrowed quest gold back to whoever funded it (an NPC's purse or a player's gold).
// Rules (how much, when) are pure in questRules.ts; this file only does the writes. Each refund
// first claims the escrow with a conditional update, so two calls can never refund twice.
import { refundAfterPayout } from "./questRules.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Add gold to an NPC's purse or a player's gold. */
export async function creditFunder(admin: Db, npcId: string | null, userId: string | null, amount: number) {
  if (amount <= 0) return;
  if (npcId) {
    const { data } = await admin.from("npcs").select("purse_gold").eq("id", npcId).maybeSingle();
    if (data) await admin.from("npcs").update({ purse_gold: (data.purse_gold ?? 0) + amount }).eq("id", npcId);
  } else if (userId) {
    const { data } = await admin.from("profiles").select("gold").eq("id", userId).maybeSingle();
    if (data) await admin.from("profiles").update({ gold: (data.gold ?? 0) + amount }).eq("id", userId);
  }
}

/**
 * Settle a quest's escrow: `paid` gold went to the player, the rest goes back to the funder.
 * Call with paid = 0 when a quest is declined, abandoned or failed. Returns the gold refunded.
 */
export async function settleQuestEscrow(admin: Db, questId: string, paid = 0): Promise<number> {
  const { data: q } = await admin.from("quests")
    .select("escrow_gold, escrow_npc_id, escrow_user_id").eq("id", questId).maybeSingle();
  if (!q || !(q.escrow_gold > 0)) return 0;
  const { data: claimed } = await admin.from("quests").update({ escrow_gold: 0 })
    .eq("id", questId).eq("escrow_gold", q.escrow_gold).select("id");
  if (!claimed?.length) return 0;   // someone else settled it first
  const refund = refundAfterPayout(q.escrow_gold, paid);
  await creditFunder(admin, q.escrow_npc_id, q.escrow_user_id, refund);
  return refund;
}

/**
 * Take an open board post down (expired, or withdrawn by its author) and refund its escrow.
 * Returns the gold refunded, or null if the post was no longer open.
 */
export async function closePostedQuest(admin: Db, postedId: string): Promise<number | null> {
  const { data: claimed } = await admin.from("posted_quests").update({ status: "expired" })
    .eq("id", postedId).eq("status", "open").select("escrow_gold, author_npc_id, author_user_id");
  const p = claimed?.[0];
  if (!p) return null;
  await creditFunder(admin, p.author_npc_id, p.author_npc_id ? null : p.author_user_id, p.escrow_gold ?? 0);
  return p.escrow_gold ?? 0;
}
