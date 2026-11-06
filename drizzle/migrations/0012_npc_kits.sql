-- NPCs own real things (quest phase 3; rules in supabase/functions/_shared/npcKit.ts).
-- outfitted_at: set the first time an NPC is outfitted with its starting purse and kit
-- (_shared/npcOutfit.ts, on first contact: talk, fight or theft). Null = not yet outfitted.
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS outfitted_at timestamptz;

-- An item an NPC promised as a quest reward leaves its pack when the quest is offered. It goes to
-- the player on completion, or back to the NPC on decline, abandon or fail (_shared/questEscrow.ts).
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS escrow_item_key text;
