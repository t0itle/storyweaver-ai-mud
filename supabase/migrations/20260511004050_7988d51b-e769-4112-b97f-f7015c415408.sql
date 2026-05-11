
-- 1. Create the new Caravan Gate room on the north side of the First City
INSERT INTO public.rooms (slug, name, description, ambience, exits, kind, label, town_key)
VALUES (
  'caravan-gate',
  'The Caravan Gate',
  'The northern gate of the First City opens onto a broad caravan yard, ringed with hitching posts, water troughs, and the smell of dust and animal sweat. Painted wagons stand in their bays, each daubed with the sigil of one of the seven kingdoms. A weather-burned wagonmaster keeps the gate-book here. Beyond the arch, the seven kingdom-roads fan out across the plain.',
  'The creak of leather, the lowing of beasts, distant wagon-bells.',
  jsonb_build_object(
    'south',   'sevenfold-square',
    'mirror',  'mirror-pass',
    'throne',  'hearth-road',
    'bastion', 'ironroad',
    'horizon', 'star-stairs',
    'sanctum', 'pilgrim-causeway',
    'court',   'vow-walk-road',
    'bazaar',  'caravan-spur'
  ),
  'gate',
  'Caravan Gate',
  'first-city'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  ambience = EXCLUDED.ambience,
  exits = EXCLUDED.exits,
  kind = EXCLUDED.kind,
  label = EXCLUDED.label,
  town_key = EXCLUDED.town_key;

-- 2. Add a `caravan` exit from sevenfold-square -> caravan-gate
UPDATE public.rooms
   SET exits = exits || jsonb_build_object('caravan', 'caravan-gate')
 WHERE slug = 'sevenfold-square';

-- 3. Strip the kingdom-road exits and the wagon-hub directional exits from first-city-gate.
--    Keep `north` (sevenfold-square), `south` (gates-approach), the inner-city exits
--    (`in`, `gate`, `back`, `breadline`, `underbazaar`, etc.) and `kingdoms` for lore continuity.
UPDATE public.rooms
   SET exits = exits
       - 'mirror' - 'throne' - 'bastion' - 'horizon'
       - 'sanctum' - 'court' - 'bazaar' - 'caravan'
 WHERE slug = 'first-city-gate';

-- 4. Re-point the kingdom approach roads so their `north` exit leads to the new Caravan Gate
UPDATE public.rooms SET exits = exits || jsonb_build_object('north', 'caravan-gate')
 WHERE slug IN (
   'mirror-pass','hearth-road','ironroad','pilgrim-causeway',
   'vow-walk-road','star-stairs','caravan-spur'
 );

-- 5. Move the wagonmaster Old Borrik from the south gate to the new Caravan Gate
UPDATE public.npcs
   SET room = 'caravan-gate',
       home_room = 'caravan-gate'
 WHERE name = 'Old Borrik' AND room = 'first-city-gate';

-- 6. Move the wagon hub from first-city-gate to caravan-gate
UPDATE public.wagon_routes SET hub = 'caravan-gate'
 WHERE hub = 'first-city-gate';
UPDATE public.wagon_routes SET destination = 'caravan-gate'
 WHERE destination = 'first-city-gate';
