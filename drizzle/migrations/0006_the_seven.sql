-- The Seven: each Aether directs its kingdom with decrees (docs/npc-agents.md §6.2).
-- Rules live in supabase/functions/_shared/decrees.ts; seven-tick applies them.
ALTER TABLE public.aethers ADD COLUMN IF NOT EXISTS last_decree_at timestamptz;

CREATE TABLE IF NOT EXISTS public.aether_decrees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aether_key   text NOT NULL REFERENCES public.aethers(key) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  kind         text NOT NULL CHECK (kind IN ('set_goal','rumor','festival','law','summon_sworn','bond')),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  proclamation text,
  expires_at   timestamptz
);
CREATE INDEX IF NOT EXISTS aether_decrees_recent_idx ON public.aether_decrees (aether_key, created_at DESC);
ALTER TABLE public.aether_decrees ENABLE ROW LEVEL SECURITY;
-- Decrees are public proclamations: anyone signed in may read them.
DROP POLICY IF EXISTS "decrees readable" ON public.aether_decrees;
CREATE POLICY "decrees readable" ON public.aether_decrees FOR SELECT TO authenticated USING (true);
