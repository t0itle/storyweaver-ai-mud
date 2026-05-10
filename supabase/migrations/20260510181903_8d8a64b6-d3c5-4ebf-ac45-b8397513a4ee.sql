ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portrait_variants jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_damage_kind text;