CREATE TABLE IF NOT EXISTS public.room_scene (
  room text PRIMARY KEY REFERENCES public.rooms(slug) ON DELETE CASCADE,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_pulse_at timestamptz,
  last_npc_ai_at timestamptz,
  npc_spoke jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.room_scene TO service_role;
ALTER TABLE public.room_scene ENABLE ROW LEVEL SECURITY;