-- Lazareth (Memory) rules the Mirrorlands; Nyxara (Silence) rules Silent Horizon.
-- Reverses supabase/migrations/20260526044930, which swapped their well rooms. well_room drives
-- respawn, combat rescue, the post-oath destination, the Mirror greeting and vow-chain step 2.
UPDATE public.aethers SET well_room = 'mirrorlands-court' WHERE key = 'lazareth';
UPDATE public.aethers SET well_room = 'silent-horizon'    WHERE key = 'nyxara';

-- Keep each god's "Mirror of <name>" guide in that god's well room (mirror-greet / align-aether
-- look the guide up by home_room = well_room and title).
UPDATE public.npcs n SET home_room = a.well_room, room = a.well_room
FROM public.aethers a
WHERE a.key IN ('lazareth', 'nyxara')
  AND n.title ILIKE '%Mirror of ' || split_part(a.name, ',', 1) || '%'
  AND n.home_room IS DISTINCT FROM a.well_room;
