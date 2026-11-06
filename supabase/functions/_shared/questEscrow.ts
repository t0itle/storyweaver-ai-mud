// Moving escrowed quest gold (and an NPC's escrowed reward item) back to whoever funded it.
// Rules (how much, when) are pure in questRules.ts; this file only does the writes. Each refund
// first claims the escrow with a conditional update, so two calls can never refund twice.
import { refundAfterPayout } from "./questRules.ts";
import { giveToNpc } from "./npcOutfit.ts";

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
 * Settle a quest's escrow: `paid` gold went to the player, the rest goes back to the funder. An
 * escrowed reward item goes back to the NPC unless `itemGranted` (the player received it).
 * Call with paid = 0 when a quest is declined, abandoned or failed. Returns the gold refunded.
 */
export async function settleQuestEscrow(admin: Db, questId: string, paid = 0, itemGranted = false): Promise<number> {
  const { data: q } = await admin.from("quests")
    .select("escrow_gold, escrow_npc_id, escrow_user_id, escrow_item_key").eq("id", questId).maybeSingle();
  if (!q) return 0;
  // Item first: claim it so it can only be returned once.
  if (q.escrow_item_key) {
    const { data: took } = await admin.from("quests").update({ escrow_item_key: null })
      .eq("id", questId).eq("escrow_item_key", q.escrow_item_key).select("id");
    if (took?.length && !itemGranted && q.escrow_npc_id) await giveToNpc(admin, q.escrow_npc_id, q.escrow_item_key);
  }
  if (!(q.escrow_gold > 0)) return 0;
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
