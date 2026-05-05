-- World events log for adaptive storytelling
CREATE TABLE public.world_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room text NOT NULL,
  kind text NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL,
  target_kind text,
  target_id uuid,
  target_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decay_at timestamptz
);

CREATE INDEX idx_world_events_room_active ON public.world_events (room, created_at DESC);
CREATE INDEX idx_world_events_decay ON public.world_events (decay_at);

ALTER TABLE public.world_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world events readable"
  ON public.world_events FOR SELECT
  TO authenticated USING (true);

-- NPCs can die and respawn
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS dead_until timestamptz;