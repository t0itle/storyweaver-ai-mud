-- Room memory and cadence (docs/room-scene.md). Rules live in supabase/functions/_shared/roomScene.ts.
-- One row per room: short-lived facts about what has changed there, and the timestamps room-pulse
-- uses to keep one shared stream per room and to keep AI-written NPC openers rare.
CREATE TABLE IF NOT EXISTS public.room_scene (
  room           text PRIMARY KEY REFERENCES public.rooms(slug) ON DELETE CASCADE,
  facts          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{text, by, at, until}], at most 6 live
  last_pulse_at  timestamptz,                         -- claimed atomically by room-pulse
  last_npc_ai_at timestamptz,                         -- last AI-written NPC opener here
  npc_spoke      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {npc_id: iso} per-NPC opener cooldown
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Written only by edge functions with the service role; no player policies.
ALTER TABLE public.room_scene ENABLE ROW LEVEL SECURITY;
