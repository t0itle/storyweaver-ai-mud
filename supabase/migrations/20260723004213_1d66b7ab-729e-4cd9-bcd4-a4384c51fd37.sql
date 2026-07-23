
CREATE TABLE public.player_room_visits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_slug text NOT NULL,
  first_visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_slug)
);

GRANT SELECT, INSERT ON public.player_room_visits TO authenticated;
GRANT ALL ON public.player_room_visits TO service_role;

ALTER TABLE public.player_room_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players see their own visits"
  ON public.player_room_visits FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Players record their own visits"
  ON public.player_room_visits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX ON public.player_room_visits (user_id);

-- Auto-record visits whenever a player's current_room changes (covers walks,
-- wagons, respawns, teleports — every path that ends in an UPDATE on profiles).
CREATE OR REPLACE FUNCTION public.record_room_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_room IS NOT NULL
     AND NEW.current_room IS DISTINCT FROM OLD.current_room THEN
    INSERT INTO public.player_room_visits (user_id, room_slug)
    VALUES (NEW.id, NEW.current_room)
    ON CONFLICT (user_id, room_slug) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_record_room_visit
  AFTER UPDATE OF current_room ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.record_room_visit();

-- Backfill: every current room counts as already seen.
INSERT INTO public.player_room_visits (user_id, room_slug)
SELECT id, current_room FROM public.profiles WHERE current_room IS NOT NULL
ON CONFLICT DO NOTHING;
