
CREATE TABLE public.lesser_runes (
  key TEXT PRIMARY KEY,
  latin_name TEXT NOT NULL,
  english_meaning TEXT NOT NULL,
  glyph TEXT NOT NULL DEFAULT '✶',
  description TEXT NOT NULL DEFAULT '',
  effect JSONB NOT NULL DEFAULT '{}',
  template JSONB NOT NULL DEFAULT '[]',
  difficulty INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lesser_runes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lesser runes readable" ON public.lesser_runes
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.player_lesser_runes (
  user_id UUID NOT NULL,
  rune_key TEXT NOT NULL REFERENCES public.lesser_runes(key) ON DELETE CASCADE,
  best_score NUMERIC NOT NULL DEFAULT 0,
  cast_count INTEGER NOT NULL DEFAULT 0,
  backfire_count INTEGER NOT NULL DEFAULT 0,
  first_cast_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rune_key)
);
ALTER TABLE public.player_lesser_runes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mastery readable" ON public.player_lesser_runes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.lesser_runes (key, latin_name, english_meaning, glyph, description, effect, template, difficulty) VALUES
('ignis','Ignis','Fire','🔥','A jagged flame-tongue. Sears flesh and lights tinder.',
 '{"type":"damage","element":"fire","power":3}'::jsonb,
 '[[0.5,1.0],[0.45,0.85],[0.55,0.7],[0.42,0.55],[0.58,0.4],[0.45,0.25],[0.55,0.1],[0.5,0.0]]'::jsonb, 1),
('aqua','Aqua','Water','💧','A flowing sigil that calls forth water — quenches thirst, douses small fires.',
 '{"type":"utility","element":"water","power":1}'::jsonb,
 '[[0.0,0.5],[0.15,0.35],[0.3,0.5],[0.45,0.65],[0.6,0.5],[0.75,0.35],[0.9,0.5],[1.0,0.55]]'::jsonb, 1),
('lux','Lux','Light','☀','A small captive sun. Banishes darkness for a span.',
 '{"type":"utility","subtype":"light","power":2}'::jsonb,
 '[[0.5,0.5],[0.6,0.45],[0.65,0.55],[0.55,0.65],[0.4,0.6],[0.35,0.45],[0.45,0.3],[0.65,0.3],[0.75,0.5],[0.7,0.7],[0.45,0.78],[0.25,0.65],[0.2,0.4],[0.35,0.2],[0.6,0.15]]'::jsonb, 2),
('vis','Vis','Force','⚡','A sharp stroke of unseen force. Pushes, breaks, knocks.',
 '{"type":"damage","element":"force","power":2}'::jsonb,
 '[[0.3,0.0],[0.5,0.3],[0.4,0.45],[0.6,0.55],[0.45,0.7],[0.65,1.0]]'::jsonb, 1),
('sana','Sana','Heal','✚','A gentle binding glyph that knits small wounds.',
 '{"type":"heal","power":3}'::jsonb,
 '[[0.5,0.0],[0.5,0.4],[0.0,0.4],[0.0,0.6],[0.5,0.6],[0.5,1.0],[0.5,0.6],[1.0,0.6],[1.0,0.4],[0.5,0.4]]'::jsonb, 2),
('tego','Tego','Ward','🛡','A shield-shape that turns one blow.',
 '{"type":"ward","power":2}'::jsonb,
 '[[0.0,0.0],[1.0,0.0],[1.0,0.5],[0.5,1.0],[0.0,0.5],[0.0,0.0]]'::jsonb, 1),
('aperio','Aperio','Open','🗝','Coaxes simple latches and stuck doors.',
 '{"type":"utility","subtype":"open","power":1}'::jsonb,
 '[[0.5,0.2],[0.65,0.3],[0.65,0.45],[0.5,0.55],[0.35,0.45],[0.35,0.3],[0.5,0.2],[0.5,0.55],[0.5,1.0]]'::jsonb, 2),
('tempus','Tempus','Time','⧖','A thin slowing glyph. Steals a heartbeat from a foe.',
 '{"type":"debuff","subtype":"slow","power":1}'::jsonb,
 '[[0.0,0.0],[1.0,0.0],[0.0,1.0],[1.0,1.0],[0.0,0.0]]'::jsonb, 3),
('umbra','Umbra','Shadow','☾','A forbidden crescent. Hides — but stains the soul.',
 '{"type":"utility","subtype":"stealth","power":2,"corruption":1}'::jsonb,
 '[[0.6,0.0],[0.35,0.1],[0.2,0.3],[0.15,0.5],[0.2,0.7],[0.35,0.9],[0.6,1.0],[0.45,0.85],[0.4,0.65],[0.4,0.35],[0.45,0.15],[0.6,0.0]]'::jsonb, 3),
('vox','Vox','Voice','📣','A V-glyph that carries a word to a known ear, near or far.',
 '{"type":"utility","subtype":"message","power":1}'::jsonb,
 '[[0.0,0.0],[0.25,0.5],[0.5,1.0],[0.75,0.5],[1.0,0.0]]'::jsonb, 1);
