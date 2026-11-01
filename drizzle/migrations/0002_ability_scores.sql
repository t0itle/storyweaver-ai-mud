-- Six ability scores on players, seeded from race + class modifiers.
-- Math (modifier, level bonus, checks) lives in supabase/functions/_shared/dice.ts.
ALTER TABLE public.races      ADD COLUMN IF NOT EXISTS ability_mods jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.class_defs ADD COLUMN IF NOT EXISTS ability_mods jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS str smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS dex smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS con smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "int" smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS wis smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS cha smallint NOT NULL DEFAULT 10;

-- Race mods: each race nets +2, matching its existing gain/cost flavour text.
UPDATE public.races SET ability_mods = v.m FROM (VALUES
  ('human',      '{"wis":1,"cha":1}'::jsonb),
  ('elf',        '{"dex":2,"wis":1,"con":-1}'::jsonb),
  ('dwarf',      '{"con":2,"str":1,"cha":-1}'::jsonb),
  ('half-giant', '{"str":3,"con":1,"dex":-1,"cha":-1}'::jsonb),
  ('beastman',   '{"wis":2,"dex":1,"cha":-1}'::jsonb),
  ('sandborn',   '{"con":1,"dex":1,"wis":1,"int":-1}'::jsonb)
) AS v(key, m) WHERE races.key = v.key;

-- Class mods: +2 primary, +1 secondary.
UPDATE public.class_defs SET ability_mods = v.m FROM (VALUES
  ('warrior',     '{"str":2,"con":1}'::jsonb),
  ('mage',        '{"int":2,"wis":1}'::jsonb),
  ('monk',        '{"dex":2,"wis":1}'::jsonb),
  ('paladin',     '{"str":2,"cha":1}'::jsonb),
  ('ranger',      '{"dex":2,"wis":1}'::jsonb),
  ('rogue',       '{"dex":2,"int":1}'::jsonb),
  ('summoner',    '{"cha":2,"int":1}'::jsonb),
  ('gambler',     '{"cha":2,"dex":1}'::jsonb),
  ('bard',        '{"cha":2,"dex":1}'::jsonb),
  ('alchemist',   '{"int":2,"con":1}'::jsonb),
  ('necromancer', '{"int":2,"wis":1}'::jsonb),
  ('runewright',  '{"int":2,"wis":1}'::jsonb)
) AS v(key, m) WHERE class_defs.key = v.key;

-- Backfill existing characters: 10 + race mod + class mod (same formula as dice.ts startingScores).
UPDATE public.profiles p SET
  str   = 10 + COALESCE((r.ability_mods->>'str')::int, 0) + COALESCE((c.ability_mods->>'str')::int, 0),
  dex   = 10 + COALESCE((r.ability_mods->>'dex')::int, 0) + COALESCE((c.ability_mods->>'dex')::int, 0),
  con   = 10 + COALESCE((r.ability_mods->>'con')::int, 0) + COALESCE((c.ability_mods->>'con')::int, 0),
  "int" = 10 + COALESCE((r.ability_mods->>'int')::int, 0) + COALESCE((c.ability_mods->>'int')::int, 0),
  wis   = 10 + COALESCE((r.ability_mods->>'wis')::int, 0) + COALESCE((c.ability_mods->>'wis')::int, 0),
  cha   = 10 + COALESCE((r.ability_mods->>'cha')::int, 0) + COALESCE((c.ability_mods->>'cha')::int, 0)
FROM public.profiles p2
LEFT JOIN public.races r ON r.key = p2.race
LEFT JOIN public.class_defs c ON c.key = p2.class_key
WHERE p.id = p2.id;
