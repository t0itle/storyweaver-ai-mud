ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_encounter_at timestamptz,
  ADD COLUMN IF NOT EXISTS escortee_npc_id uuid,
  ADD COLUMN IF NOT EXISTS escortee_destination text,
  ADD COLUMN IF NOT EXISTS escortee_destination_name text;

ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS escort_npc_id uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_escortee ON public.profiles(escortee_npc_id) WHERE escortee_npc_id IS NOT NULL;