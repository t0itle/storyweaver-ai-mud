
-- 1. Aethers catalog
CREATE TABLE IF NOT EXISTS public.aethers (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  gift TEXT NOT NULL,
  vow TEXT NOT NULL,
  glyph TEXT NOT NULL DEFAULT '✦',
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.aethers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aethers readable" ON public.aethers FOR SELECT TO authenticated USING (true);

INSERT INTO public.aethers (key, name, domain, gift, vow, glyph, sort_order) VALUES
  ('pyrrhus',  'Pyrrhus the Ember',     'flame, courage, ruin',     '+2 max HP, your weapon strikes burn',          'never refuse a challenge given in good faith',   '☄', 1),
  ('thalassa', 'Thalassa the Tidemother','water, mercy, memory',     'restore 1 HP at the start of every turn',      'never let a stranger thirst in your presence',   '≈', 2),
  ('orogen',   'Orogen the Stoneward',  'stone, oath, endurance',   '+1 armor, advantage when defending',           'keep every oath you swear, however small',       '◆', 3),
  ('zephyra',  'Zephyra the Breath',    'wind, travel, news',       'flee always succeeds; learn from every road',  'carry truthful word from the dying to the living','~', 4),
  ('verdigris','Verdigris the Root',    'green things, growth, healing','heal +2 with potions and ritual',          'plant something living wherever you sleep',      '✿', 5),
  ('hush',     'Hush the Stilltongue',  'silence, secrets, the unspoken','first attack each combat is a critical', 'speak no boast; let no boast about you stand',   '·', 6)
ON CONFLICT (key) DO NOTHING;

-- 2. Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aether TEXT REFERENCES public.aethers(key),
  ADD COLUMN IF NOT EXISTS aether_chosen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corruption INT NOT NULL DEFAULT 0;

-- 3. Hall of Choice room + city link
INSERT INTO public.rooms (slug, name, description, exits, ambience) VALUES
  ('hall-of-choice', 'The Hall of Choice',
   'Six alcoves ring a sunken floor of pale stone, one for each Aether of the Speaker. The air smells of wax and old water. At the center, a shallow basin waits — empty, expectant. Words are carved at the basin''s lip: ALIGN, AND BE NAMED. To return, walk south.',
   '{"south":"emberhold-square"}'::jsonb,
   'Wax-light. Six glyphs flicker against the walls in turn, as if something walked unseen between them.')
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, exits = EXCLUDED.exits, ambience = EXCLUDED.ambience;

UPDATE public.rooms
SET exits = exits || '{"up":"hall-of-choice"}'::jsonb
WHERE slug = 'emberhold-square'
  AND NOT (exits ? 'up');

-- 4. Reset all players to the dunes for the new opening
UPDATE public.profiles
SET current_room = 'dunes-edge',
    in_combat_id = NULL;
