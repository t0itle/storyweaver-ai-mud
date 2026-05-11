
UPDATE public.rooms
   SET kind = 'inn',
       town_key = COALESCE(town_key, 'first-city')
 WHERE slug = 'crooked-tankard';

WITH inns(hub, inn_slug, inn_name, inn_desc) AS (
  VALUES
    ('high-sanctum',      'sanctum-rest-house', 'The Almsgiver''s Rest',
      'A vaulted hostel for pilgrims, with rows of clean cots and a basin of warm water at every door. The Veiled keep the door open at all hours.'),
    ('iron-bastion',      'bastion-billet',     'The Soldier''s Billet',
      'A blunt, low-beamed hall full of bunks, hung with retired banners. The innkeep was a quartermaster once and runs the place like a barracks — but the beds are dry and the broth is hot.'),
    ('mirrorlands-court', 'mirror-rest-house',  'The Borrowed Bed',
      'Each cot has a small mirror at its head. Travellers leave the masks of their day at the door and sleep as someone else for a night.'),
    ('gilded-bazaar',     'bazaar-caravanserai','The Gilded Caravanserai',
      'A walled court of shaded sleeping galleries above the bazaar, built for caravan-folk. Every bed has a lockbox and the price is on a brass plate.'),
    ('silent-horizon',    'horizon-dormitory',  'The Quiet Dormitory',
      'Long, low beds beneath a painted ceiling of stars. Talking above a whisper here is fined.'),
    ('evershade-court',   'evershade-rest',     'The House of Singular Beds',
      'A hush of single rooms behind candle-lit doors. Each guest is given one taper to last the night.'),
    ('feastlands-keep',   'keep-bunkhouse',     'The Long-Tables Bunkhouse',
      'A loud, warm sleeping-hall above the kitchens. The smell of bread never leaves it.')
)
INSERT INTO public.rooms (slug, name, description, ambience, exits, kind, label, town_key)
SELECT inn_slug, inn_name, inn_desc,
       'Low voices, the creak of cots, the smell of clean water.',
       jsonb_build_object('out', hub),
       'inn', 'Inn', hub
  FROM inns
ON CONFLICT (slug) DO UPDATE SET
  kind = 'inn',
  label = 'Inn',
  town_key = EXCLUDED.town_key;

-- wire `inn` exit on each capital hub
UPDATE public.rooms r
   SET exits = r.exits || jsonb_build_object('inn', i.inn_slug)
  FROM (VALUES
    ('high-sanctum',      'sanctum-rest-house'),
    ('iron-bastion',      'bastion-billet'),
    ('mirrorlands-court', 'mirror-rest-house'),
    ('gilded-bazaar',     'bazaar-caravanserai'),
    ('silent-horizon',    'horizon-dormitory'),
    ('evershade-court',   'evershade-rest'),
    ('feastlands-keep',   'keep-bunkhouse')
  ) AS i(hub, inn_slug)
 WHERE r.slug = i.hub;

UPDATE public.rooms
   SET exits = exits || jsonb_build_object('inn', 'crooked-tankard')
 WHERE slug = 'sevenfold-square';
