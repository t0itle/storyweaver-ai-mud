
-- Add a new room: The Archive of Aethers, connected off the Hall of the Seven
INSERT INTO public.rooms (slug, name, description, ambience, exits) VALUES (
  'archive-of-aethers',
  'The Archive of Aethers',
  'Stone shelves rise three stories high, lit by hovering ember-motes. Scrolls, bound codices, and rune-etched tablets crowd every alcove — the gathered memory of the seven Aethers and the silenced Speaker. The air smells of dust, ink, and faintly of incense. A spiral stair winds upward into shadow.',
  'The hush of paper. Somewhere above, a page turns on its own.',
  '{"west": "hall-of-the-seven"}'::jsonb
);

-- Add archive exit to Hall of the Seven (preserve existing east exit)
UPDATE public.rooms
SET exits = exits || '{"east": "sevenfold-square", "north": "archive-of-aethers"}'::jsonb
WHERE slug = 'hall-of-the-seven';

-- Add an Archivist NPC
INSERT INTO public.npcs (room, name, title, persona, greeting) VALUES (
  'archive-of-aethers',
  'Archivist Renn',
  'Keeper of the Seven Memories',
  'A stooped, ink-stained scholar wrapped in a faded grey robe. Renn has spent decades cataloging every fragment of lore about the seven Aethers, the Veiled, and the Speaker. Speaks softly, precisely, and is delighted by curious Otherworlders. Will share lore freely if asked, but distrusts those who scorn knowledge or threaten the texts.',
  '*looks up from a half-unrolled scroll, ember-light reflecting in spectacles* Another wanderer? Good. The shelves are patient, but they prefer to be read.'
);
