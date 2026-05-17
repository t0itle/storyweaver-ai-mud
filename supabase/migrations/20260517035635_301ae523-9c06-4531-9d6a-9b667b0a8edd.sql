
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS solution text,
  ADD COLUMN IF NOT EXISTS solution_hint text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.puzzle_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'riddle',
  prompt text NOT NULL,
  answer text NOT NULL,
  hint text NOT NULL DEFAULT '',
  flavor text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'standard',
  reward_gold integer NOT NULL DEFAULT 40,
  reward_xp integer NOT NULL DEFAULT 80,
  reward_merit integer NOT NULL DEFAULT 4,
  reward_item_key text,
  reward_rune_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_puzzle_pool_npc ON public.puzzle_pool(npc_id);

ALTER TABLE public.puzzle_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "puzzles readable" ON public.puzzle_pool;
CREATE POLICY "puzzles readable" ON public.puzzle_pool FOR SELECT TO authenticated USING (true);
