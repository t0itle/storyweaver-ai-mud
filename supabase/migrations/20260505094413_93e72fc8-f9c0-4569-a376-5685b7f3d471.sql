
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'room',
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT 'Room';

ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS home_room text,
  ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_activity text,
  ADD COLUMN IF NOT EXISTS last_tick_at timestamptz;

-- Backfill: classify the hand-built rooms
UPDATE public.rooms SET kind='shore',     label='Shore'    WHERE slug='crescent-shore';
UPDATE public.rooms SET kind='hollow',    label='Hollow'   WHERE slug='sand-bloom-hollow';
UPDATE public.rooms SET kind='road',      label='Road'     WHERE slug IN ('red-haze-road','old-flag-road');
UPDATE public.rooms SET kind='gate',      label='Gate'     WHERE slug='first-city-gate';
UPDATE public.rooms SET kind='square',    label='Square'   WHERE slug='sevenfold-square';
UPDATE public.rooms SET kind='hall',      label='Hall'     WHERE slug IN ('hall-of-the-seven','archive-of-aethers');
UPDATE public.rooms SET kind='market',    label='Market'   WHERE slug='market-row';
UPDATE public.rooms SET kind='tavern',    label='Tavern'   WHERE slug='crooked-tankard';
UPDATE public.rooms SET kind='room',      label='Loft'     WHERE slug='tankard-loft';

-- Backfill: each existing NPC lives where they currently are, with a simple all-day schedule.
UPDATE public.npcs SET home_room = room WHERE home_room IS NULL;
UPDATE public.npcs SET schedule = jsonb_build_object(
  'dawn',    jsonb_build_object('room', room, 'activity', 'waking, beginning the day'),
  'morning', jsonb_build_object('room', room, 'activity', 'tending to their work'),
  'midday',  jsonb_build_object('room', room, 'activity', 'busy at their craft'),
  'dusk',    jsonb_build_object('room', room, 'activity', 'winding down as the light fades'),
  'night',   jsonb_build_object('room', room, 'activity', 'resting, half-listening to the dark')
) WHERE schedule = '{}'::jsonb OR schedule IS NULL;
