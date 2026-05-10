ALTER TABLE public.room_caches
  ADD COLUMN IF NOT EXISTS find_dc smallint NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS revealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS revealed_by_name text;