-- Permadeath system: downed → death save → permanent death → friend revive (zombified)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS downed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS downed_at timestamptz,
  ADD COLUMN IF NOT EXISTS downed_combat_id uuid,
  ADD COLUMN IF NOT EXISTS dead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dead_at timestamptz,
  ADD COLUMN IF NOT EXISTS death_room text,
  ADD COLUMN IF NOT EXISTS zombified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revived_by uuid,
  ADD COLUMN IF NOT EXISTS revived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_dead_room ON public.profiles(death_room) WHERE dead = true;
