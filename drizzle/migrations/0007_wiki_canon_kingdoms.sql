-- Make the game match the EverBloom wiki (everbloom-lore/) — the canon source of truth.
--   * Lazareth (Time & Knowledge) rules Silent Horizon; Nyxara (Ambition & Transformation) rules
--     the Mirrorlands. The game had the two gods swapped in their thrones, wells, wardens and
--     themes. The rooms themselves already fit the wiki (archives/glyphs in Silent Horizon,
--     mirrors/masks/veils in the Mirrorlands), so the wardens stay where they stand and change god.
--   * Each Aether's domain is its wiki Virtue/Sin and governance.
--   * Every town belongs to a kingdom (towns.aether_key); resident NPCs are aligned to its Aether.
--   * Wiki place names: the Hall of Seven Ways, the Gate of Form.
-- Supersedes the well-room part of 0003 (which assumed the opposite assignment).

-- ---------------------------------------------------------------- 1. the Seven, per the wiki
INSERT INTO public.aethers (key, name, domain, gift, vow, glyph, sort_order) VALUES
  ('khalvaris', 'Khalvaris, the Judge',     'Wrath / Patience — War and Law',                     'Patience in the line: you stand firmer while you hold your ground.', 'Wait for the right moment; never strike in mere vengeance.', '⚖', 1),
  ('solastin',  'Solastin, the Architect',  'Pride / Humility — Civilization and Leadership',     'Radiant command: allies who follow your lead stand firmer.',          'Build for the many; never believe only you can fix the world.', '☼', 2),
  ('nyxara',    'Nyxara, the Muse',         'Envy / Kindness — Ambition and Transformation',      'Shifting form: your disguises and illusions hold longer.',            'Help another grow; never covet what is theirs.',                 '◐', 3),
  ('velithria', 'Velithria, the Lover',     'Lust / Chastity — Passion and Discipline',           'Focused heart: your sworn bonds cannot be broken by charm.',          'Keep your intent pure and your loyalty whole.',                  '❦', 4),
  ('thalvora',  'Thalvora, the Merchant',   'Greed / Charity — Exchange and Value',               'Fair dealing: better rates in every honest trade.',                   'Keep wealth moving; never hoard what could sustain a life.',      '¤', 5),
  ('lazareth',  'Lazareth, the Archivist',  'Sloth / Diligence — Time and Knowledge',             'Long memory: you notice what others overlook.',                       'Record the truth, all of it; never bury what is inconvenient.',   '⧗', 6),
  ('morvayne',  'Morvayne, the Harvester',  'Gluttony / Temperance — Nature and Consumption',     'Hunter''s plenty: food and remedies serve you better.',              'Take only what you need.',                                        '❧', 7)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, domain = EXCLUDED.domain;

-- ---------------------------------------------------------------- 2. thrones and wells
UPDATE public.aethers SET well_room = 'silent-horizon',    throne_room = 'lazareth-throne' WHERE key = 'lazareth';
UPDATE public.aethers SET well_room = 'mirrorlands-court', throne_room = 'nyxara-throne'   WHERE key = 'nyxara';

UPDATE public.rooms SET town_key = 'silent-horizon',    exits = exits || '{"out":"silent-horizon"}'::jsonb    WHERE slug = 'lazareth-throne';
UPDATE public.rooms SET town_key = 'mirrorlands-court', exits = exits || '{"out":"mirrorlands-court"}'::jsonb WHERE slug = 'nyxara-throne';
UPDATE public.rooms SET exits = exits || '{"in":"lazareth-throne"}'::jsonb WHERE slug = 'silent-horizon';
UPDATE public.rooms SET exits = exits || '{"in":"nyxara-throne"}'::jsonb   WHERE slug = 'mirrorlands-court';

UPDATE public.rooms r SET name = v.name, description = v.description FROM (VALUES
  ('solastin-throne',  'The Beacon Throne',  'A vault of crystal spires and polished lenses that gather every ray of light into the dais. Here the Architect, Aether of Civilization and Leadership, measures what is built and who it serves.'),
  ('khalvaris-throne', 'The Verdict Throne', 'A black iron hall cut into the volcanic rock of the Bastion. Two great scales hang above a basalt seat from which the Judge, Aether of War and Law, weighs wrath against patience.'),
  ('lazareth-throne',  'The Archive Throne', 'A hall of shelves built from compressed starlight, where time seems to congeal. The Archivist, Aether of Time and Knowledge, sits among histories that never were and records all that is.'),
  ('nyxara-throne',    'The Mirror Throne',  'A clearing of slow mirrors in a mist-shrouded forest, where every reflection shows who you could become. The Muse, Aether of Ambition and Transformation, watches you choose.'),
  ('thalvora-throne',  'The Coin Throne',    'A gold-leafed counting hall where every whisper is a bargain. The Merchant, Aether of Exchange and Value, sits behind a single great ledger that tallies every desire.'),
  ('velithria-throne', 'The Vow Throne',     'A twilight garden of bioluminescent blossoms and perfumed air. The Lover, Aether of Passion and Discipline, sits on a bench of folded ribbons and asks what your heart is sworn to.'),
  ('morvayne-throne',  'The Harvest Throne', 'A long hall overgrown with fruiting vines, where the table never empties and something always hunts. The Harvester, Aether of Nature and Consumption, sits at its head.')
) AS v(slug, name, description) WHERE r.slug = v.slug;

-- The Aethers themselves (their NPC figures), per the wiki.
UPDATE public.npcs n SET title = v.title, persona = v.persona FROM (VALUES
  ('solastin',  'the Architect', 'The Aether of Civilization and Leadership: Humility is service to the many; Pride is believing only you can fix the world. A figure of pure golden light. Slow, certain, builds rather than commands.'),
  ('khalvaris', 'the Judge',     'The Aether of War and Law: Patience is the discipline to wait; Wrath is unchecked vengeance. Cold, exact, never raises their voice.'),
  ('nyxara',    'the Muse',      'The Aether of Ambition and Transformation: Kindness is helping others grow; Envy is coveting what is theirs. Speaks in questions about who you might become.'),
  ('thalvora',  'the Merchant',  'The Aether of Exchange and Value: Charity is wealth kept moving; Greed is wealth hoarded. Draped in coin-spun silk, eyes like emeralds that tally every desire.'),
  ('lazareth',  'the Archivist', 'The Aether of Time and Knowledge: Diligence is the relentless recording of all histories; Sloth is the apathy of knowing too much. Quiet, exact, slightly absent.'),
  ('velithria', 'the Lover',     'The Aether of Passion and Discipline: Chastity is purity of intent and loyalty; Lust is obsession and loss of control. Warm, attentive, terribly patient.'),
  ('morvayne',  'the Harvester', 'The Aether of Nature and Consumption: Temperance is taking only what you need; Gluttony is endless hunger. Broad-shouldered, generous of laugh, never quite full.')
) AS v(key, title, persona) WHERE n.is_aether AND n.aether_key = v.key;

-- ---------------------------------------------------------------- 3. wardens change god, not place
-- Wardens standing in Silent Horizon's lands now serve Lazareth; those in the Mirrorlands serve Nyxara.
-- Guarded so it only runs while the old (swapped) layout is present: re-running must not swap back.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.npcs
             WHERE is_warden AND aether_key = 'lazareth' AND room = 'mirrorlands-court') THEN
    UPDATE public.npcs SET aether_key = CASE aether_key WHEN 'lazareth' THEN 'nyxara' ELSE 'lazareth' END
    WHERE is_warden AND aether_key IN ('lazareth', 'nyxara');
    UPDATE public.npcs SET title = CASE title
        WHEN 'First Warden of Nyxara'   THEN 'First Warden of Lazareth'
        WHEN 'First Warden of Lazareth' THEN 'First Warden of Nyxara' END
    WHERE is_warden AND title IN ('First Warden of Nyxara', 'First Warden of Lazareth');
  END IF;
END $$;
UPDATE public.npcs SET greeting = 'Lower your voice. The Archivist is listening.'
WHERE is_warden AND greeting = 'Lower your voice. She is listening.';

-- Each god's "Mirror of <name>" guide lives in that god's well room.
UPDATE public.npcs n SET home_room = a.well_room, room = a.well_room
FROM public.aethers a
WHERE a.key IN ('lazareth', 'nyxara')
  AND n.title ILIKE '%Mirror of ' || split_part(a.name, ',', 1) || '%'
  AND n.home_room IS DISTINCT FROM a.well_room;

-- ---------------------------------------------------------------- 4. kingdoms
ALTER TABLE public.towns ADD COLUMN IF NOT EXISTS aether_key text;
UPDATE public.towns t SET aether_key = v.ak, blurb = v.blurb FROM (VALUES
  ('first-city',        NULL,        'The neutral convergence point, maintained (not ruled) by the Veiled. No Aether holds dominion here.'),
  ('high-sanctum',      'solastin',  'Solastin''s kingdom of crystalline spires and rivers of liquid light.'),
  ('iron-bastion',      'khalvaris', 'Khalvaris''s volcanic land of obsidian peaks, sulfur springs and clenched-fist fortresses.'),
  ('mirrorlands-court', 'nyxara',    'Nyxara''s shifting, mist-shrouded forest, where paths move and reflections deceive.'),
  ('gilded-bazaar',     'thalvora',  'Thalvora''s kaleidoscopic maze of markets, floating stalls and shimmering vaults.'),
  ('silent-horizon',    'lazareth',  'Lazareth''s vast crystalline desert where time congeals and libraries are built of starlight.'),
  ('evershade-court',   'velithria', 'Velithria''s twilight realm of perfumed breezes and bioluminescent gardens.'),
  ('feastlands-keep',   'morvayne',  'Morvayne''s overgrown, lush and predatory land of fruit and hunters.')
) AS v(key, ak, blurb) WHERE t.key = v.key;
-- Other towns join the kingdom whose wardens guard them.
UPDATE public.towns t SET aether_key = sub.ak
FROM (
  SELECT DISTINCT ON (r.town_key) r.town_key, n.aether_key AS ak
  FROM public.npcs n JOIN public.rooms r ON r.slug = n.room
  WHERE n.is_warden AND r.town_key IS NOT NULL
  GROUP BY r.town_key, n.aether_key
  ORDER BY r.town_key, count(*) DESC
) sub
WHERE t.key = sub.town_key AND t.aether_key IS NULL AND t.key <> 'first-city';

-- Residents are aligned to the Aether of the kingdom they live in.
UPDATE public.npcs n SET aether_key = t.aether_key
FROM public.rooms r JOIN public.towns t ON t.key = r.town_key
WHERE r.slug = COALESCE(n.home_room, n.room)
  AND NOT n.is_aether AND NOT n.is_warden
  AND n.aether_key IS DISTINCT FROM t.aether_key;

-- ---------------------------------------------------------------- 5. wiki place names
UPDATE public.rooms SET name = 'The Hall of Seven Ways' WHERE slug IN ('hall-of-the-seven', 'hall-of-choice');
UPDATE public.rooms SET name = 'The Gate of Form'       WHERE slug = 'first-city-gate';
