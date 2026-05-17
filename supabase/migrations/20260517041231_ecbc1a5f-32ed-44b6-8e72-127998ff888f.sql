-- 1) Unique-per-player flag for quest reward items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS unique_per_player boolean NOT NULL DEFAULT false;

-- 2) Lichen King quest chain progress (one row per player)
CREATE TABLE IF NOT EXISTS public.lichen_king_progress (
  user_id      uuid PRIMARY KEY,
  step         integer NOT NULL DEFAULT 0,
  status       text    NOT NULL DEFAULT 'active',  -- active | crowned
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lichen_king_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own lichen progress readable" ON public.lichen_king_progress;
CREATE POLICY "own lichen progress readable"
  ON public.lichen_king_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER lichen_king_progress_set_updated
  BEFORE UPDATE ON public.lichen_king_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();