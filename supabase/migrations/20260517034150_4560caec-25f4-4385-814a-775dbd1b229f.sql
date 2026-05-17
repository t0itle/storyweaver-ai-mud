ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS is_boss boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS combat_max_hp integer,
  ADD COLUMN IF NOT EXISTS combat_damage_min integer,
  ADD COLUMN IF NOT EXISTS combat_damage_max integer,
  ADD COLUMN IF NOT EXISTS boss_reward_gold integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boss_reward_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boss_reward_merit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boss_intro text;