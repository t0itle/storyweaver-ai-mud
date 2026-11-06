// Database side of NPC possessions: outfit an NPC once with its starting purse and kit, and move
// single items in and out of its pack. Rules (who gets what) are pure in npcKit.ts.
import { kitFor, kitRole, startingPurse, KIT_LIMITS, type CatalogItem } from "./npcKit.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const KIT_SLOTS = ["consumable", "misc", "main_hand", "body"];

/**
 * Give an NPC its starting purse and kit the first time it matters (owner's decision: on first
 * contact). Claimed with a conditional update, so it happens once even if two calls race.
 * An NPC that already carries items keeps them and gets no kit; one that already has gold keeps
 * its purse. Updates `npc.purse_gold` and `npc.outfitted_at` in place for the caller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureOutfitted(admin: Db, npc: any): Promise<void> {
  if (!npc?.id || npc.outfitted_at) return;
  const now = new Date().toISOString();
  const { data: claimed } = await admin.from("npcs").update({ outfitted_at: now })
    .eq("id", npc.id).is("outfitted_at", null).select("id, purse_gold");
  npc.outfitted_at = now;
  if (!claimed?.length) return;   // already outfitted by another call
  const role = kitRole(npc);
  if (role === "none") return;

  const { count } = await admin.from("npc_items").select("*", { count: "exact", head: true }).eq("npc_id", npc.id);
  if (!count) {
    const { data: catalog } = await admin.from("items")
      .select("key, slot, value, tier, base_damage, base_armor")
      .in("slot", KIT_SLOTS).lte("tier", KIT_LIMITS.maxTier).lte("value", KIT_LIMITS.armourValue).limit(500);
    const kit = kitFor(role, npc.id, (catalog ?? []) as CatalogItem[]);
    if (kit.length) await admin.from("npc_items").insert(kit.map((k) => ({ npc_id: npc.id, ...k })));
  }
  if ((claimed[0].purse_gold ?? 0) <= 0) {
    const purse = startingPurse(role, npc.id);
    await admin.from("npcs").update({ purse_gold: purse }).eq("id", npc.id).eq("purse_gold", claimed[0].purse_gold ?? 0);
    npc.purse_gold = purse;
  }
}

/** Remove one unworn `itemKey` from an NPC's pack. False if it has none to give. */
export async function takeFromNpc(admin: Db, npcId: string, itemKey: string): Promise<boolean> {
  const { data: row } = await admin.from("npc_items").select("id, quantity")
    .eq("npc_id", npcId).eq("item_key", itemKey).is("equipped_slot", null).limit(1).maybeSingle();
  if (!row) return false;
  const q = row.quantity ?? 1;
  const { data: done } = q > 1
    ? await admin.from("npc_items").update({ quantity: q - 1 }).eq("id", row.id).eq("quantity", q).select("id")
    : await admin.from("npc_items").delete().eq("id", row.id).select("id");
  return !!done?.length;
}

/** Put one `itemKey` back into an NPC's pack (unworn). */
export async function giveToNpc(admin: Db, npcId: string, itemKey: string): Promise<void> {
  const { data: row } = await admin.from("npc_items").select("id, quantity")
    .eq("npc_id", npcId).eq("item_key", itemKey).is("equipped_slot", null).limit(1).maybeSingle();
  if (row) await admin.from("npc_items").update({ quantity: (row.quantity ?? 1) + 1 }).eq("id", row.id);
  else await admin.from("npc_items").insert({ npc_id: npcId, item_key: itemKey, quantity: 1, equipped_slot: null });
}
