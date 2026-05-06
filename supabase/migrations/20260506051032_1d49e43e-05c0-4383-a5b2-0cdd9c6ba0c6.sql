
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS requires_faction text,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

INSERT INTO public.rooms (slug, name, label, description, ambience, exits, kind, requires_faction, hidden)
VALUES
  ('black-choir',
   'The Black Choir',
   'Enclave',
   'A drowned chapel beneath a dune that should not be here. Twelve mouth-less effigies stand in a ring around a basin of dry ash. The walls remember a song no one ever wrote. To find this place at all you must already be unmade.',
   'a hum below hearing — the Speaker''s absence shaped into something almost like music',
   '{"out":"bone-dunes"}'::jsonb,
   'enclave', 'chaos', true),
  ('unspoken-hollow',
   'The Unspoken Hollow',
   'Enclave',
   'A breach in the wilderness floor where the world thins. Chaos-marked travelers gather here in twos and threes, their faces hidden, trading the names of wardens. The air refuses to carry sound more than a few feet — every conversation is a small private island.',
   'silence with edges',
   '{"out":"deep-wilds"}'::jsonb,
   'enclave', 'chaos', true)
ON CONFLICT (slug) DO UPDATE SET
  requires_faction = EXCLUDED.requires_faction,
  hidden = EXCLUDED.hidden,
  description = EXCLUDED.description,
  exits = EXCLUDED.exits;
