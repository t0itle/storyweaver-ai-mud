-- First-steps onboarding chain, per-player room visits (map fog-of-war),
-- and a single-row world weather state driven by world-tick.

-- ── Player room visits ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_room_visits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room text NOT NULL REFERENCES public.rooms(slug) ON DELETE CASCADE,
  first_visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room)
);
GRANT SELECT, INSERT ON public.player_room_visits TO authenticated;
GRANT ALL ON public.player_room_visits TO service_role;
ALTER TABLE public.player_room_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own visits readable" ON public.player_room_visits;
CREATE POLICY "own visits readable" ON public.player_room_visits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own visits insertable" ON public.player_room_visits;
CREATE POLICY "own visits insertable" ON public.player_room_visits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_room_visits_user ON public.player_room_visits(user_id);

-- ── Onboarding progress ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',   -- active | complete | dismissed
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_progress TO authenticated;
GRANT ALL ON public.onboarding_progress TO service_role;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own onboarding readable" ON public.onboarding_progress;
CREATE POLICY "own onboarding readable" ON public.onboarding_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── World weather (single row, service-role writes) ─────────────────
CREATE TABLE IF NOT EXISTS public.world_weather (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  kind text NOT NULL DEFAULT 'clear',      -- clear | wind | overcast | rain | sandstorm | starfall
  note text NOT NULL DEFAULT 'The sky is clear and pitiless.',
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.world_weather TO authenticated;
GRANT ALL ON public.world_weather TO service_role;
ALTER TABLE public.world_weather ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "weather readable" ON public.world_weather;
CREATE POLICY "weather readable" ON public.world_weather
  FOR SELECT TO authenticated USING (true);
INSERT INTO public.world_weather (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER PUBLICATION supabase_realtime ADD TABLE public.world_weather;
