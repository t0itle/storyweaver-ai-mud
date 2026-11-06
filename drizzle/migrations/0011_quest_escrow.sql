-- Quest gold is real money (quest phase 2; rules in supabase/functions/_shared/questRules.ts).
-- Whoever funds a quest has the gold set aside when it is offered or posted. It is paid to the
-- player on completion, or returned to the funder when the quest is declined, abandoned, failed,
-- expired or taken down. Before this, NPC refunds were never made and player board rewards were
-- never taken from the poster, so completing them created gold.
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS escrow_gold    integer NOT NULL DEFAULT 0 CHECK (escrow_gold >= 0),
  ADD COLUMN IF NOT EXISTS escrow_npc_id  uuid REFERENCES public.npcs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escrow_user_id uuid;

ALTER TABLE public.posted_quests
  ADD COLUMN IF NOT EXISTS escrow_gold integer NOT NULL DEFAULT 0 CHECK (escrow_gold >= 0);

-- Open NPC board posts already took their reward from the NPC's purse (npc-agent-tick/wants.ts),
-- so record it as escrow and it can be refunded when the post expires. Player posts made before
-- this migration took only the fee; they keep escrow 0 and pay out as before.
UPDATE public.posted_quests SET escrow_gold = reward_gold
  WHERE author_npc_id IS NOT NULL AND status = 'open' AND escrow_gold = 0;
