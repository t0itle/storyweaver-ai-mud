
ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS is_soul boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_rune_key text;

CREATE TABLE IF NOT EXISTS public.player_npc_discoveries (
  user_id uuid NOT NULL,
  npc_id uuid NOT NULL,
  discovered_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, npc_id)
);
ALTER TABLE public.player_npc_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own npc discoveries readable" ON public.player_npc_discoveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own npc discoveries insertable" ON public.player_npc_discoveries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

INSERT INTO public.lesser_runes (key, latin_name, english_meaning, glyph, description, difficulty, template, effect)
VALUES (
  'necros', 'Necros', 'Speech with the Dead', '💀',
  'A forbidden glyph traced on the tongue. While bound, the speaker may hear and answer the lingering souls of the buried — the dead who linger in tombs and crypts. Without it, only the cold of the place answers.',
  4,
  '[[0.5,1.0],[0.35,0.85],[0.5,0.7],[0.65,0.85],[0.5,1.0],[0.5,0.55],[0.3,0.4],[0.7,0.4],[0.5,0.55],[0.4,0.2],[0.6,0.2],[0.5,0.0]]'::jsonb,
  '{"kind":"speak_dead"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
