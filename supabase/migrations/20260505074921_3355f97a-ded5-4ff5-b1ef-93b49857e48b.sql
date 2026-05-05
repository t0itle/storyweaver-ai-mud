
-- Reshape the opening: from dunes-edge the player chooses the city or the deeper desert.
-- Remove old snake/oasis fork trope per new lore (Speaker's silence, no guide).

-- New room: deeper desert, where the Shadow whispers loudest.
INSERT INTO public.rooms (slug, name, description, ambience, exits) VALUES
('deep-dunes', 'Deeper Into the Dunes',
'The road gives up. Sand swallows the cracked stones one by one until there is only the dunes themselves, rolling like a slow grey sea. The sun is too white. The wind has begun to say something just under hearing — your name, perhaps, or the shape of it. Footprints lead in: none lead out.',
'A whisper that is almost a word. Almost yours.',
'{"north": "dunes-edge"}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  ambience = EXCLUDED.ambience,
  exits = EXCLUDED.exits;

-- Rewrite dunes-edge as the true crossroads.
UPDATE public.rooms SET
  name = 'The Edge of the Dunes',
  description = 'You crest a dune and the world opens. To the north, far across the heat-shimmer, watch-fires burn on the high walls of a shining city — the last one, perhaps. To the south, the dunes roll on and on into a silence that has no edge. A single thread of cracked road runs north toward the gates. Nothing runs south. The choice is yours, and only yours.',
  ambience = 'Wind. The faint, far-off bell of a city you have not yet entered.',
  exits = '{"north": "speakers-gate", "south": "deep-dunes"}'::jsonb
WHERE slug = 'dunes-edge';

-- Anyone currently stranded in the deprecated fork/oasis: pull them back to the edge.
UPDATE public.profiles
SET current_room = 'dunes-edge'
WHERE current_room IN ('dunes-fork', 'the-oasis');
