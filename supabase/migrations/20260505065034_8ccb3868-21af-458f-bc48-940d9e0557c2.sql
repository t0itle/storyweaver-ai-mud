
-- Races
CREATE TABLE public.races (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  flavor TEXT NOT NULL,
  gain TEXT NOT NULL,
  cost TEXT NOT NULL,
  hp_mod INT NOT NULL DEFAULT 0,
  visual_traits TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "races readable" ON public.races FOR SELECT TO authenticated USING (true);

INSERT INTO public.races (key, name, flavor, gain, cost, hp_mod, visual_traits, sort_order) VALUES
('human', 'Human', 'Adaptable wanderers from the old kingdoms. Unremarkable, and therefore everywhere.',
  'Balanced — gain extra starting gold and a second guess in any conversation.', 'No standout edge in body or sense.', 0,
  'human, varied skin tones, plain travel-worn leathers, no obvious non-human features', 1),
('elf', 'Elf', 'Slender folk of the long memory. They listen for things others cannot hear.',
  'Keen perception — see lore hints others miss; +1 to discovery checks.', 'Frail frame. -3 max HP.', -3,
  'elf, almond eyes, long pointed ears, fine angular features, silver or chestnut hair', 2),
('dwarf', 'Dwarf', 'Stone-shouldered hill folk who measure trust in decades.',
  'Hardy. +4 max HP and resistance to fear effects.', 'Slow — initiative penalty in combat. Distrustful of magic.', 4,
  'dwarf, stocky and broad, thick beard, calloused hands, heavy wool and iron-bound leather', 3),
('half-giant', 'Half-Giant', 'Children of the Whispering Wastes, where the old titans still sleep.',
  'Massive. +8 max HP; can shoulder doors and intimidate weaker foes.', 'Conspicuous — cannot enter low buildings; merchants charge double.', 8,
  'half-giant, towering, broad-shouldered, weathered skin, simple wraps and a stone-headed weapon, gentle eyes', 4),
('beastman', 'Beastman', 'Pact-born of the deep wilds — wolf, bear, falcon, or feline kin.',
  'Senses of the wild — track scents, hear whispers; +1 to all examine actions.', 'Distrusted in cities. Cultists may refuse you passage.', 0,
  'beastman, anthropomorphic, fur-covered, tapered ears or muzzle, animalistic eyes, hide and bone trinkets', 5),
('sandborn', 'Sandborn', 'Desert-blooded nomads who can hear the dunes turn over in their sleep.',
  'Heat immunity; double water reserves; the snake of the oasis remembers your face.', 'Cannot stand cold. -2 HP in any northern region.', 0,
  'sandborn, sun-darkened skin, light linen wraps, kohl-darkened eyes, bone jewelry, lithe', 6);

-- Profiles: add race, description, portrait, creation flag
ALTER TABLE public.profiles
  ADD COLUMN race TEXT REFERENCES public.races(key),
  ADD COLUMN char_description TEXT,
  ADD COLUMN portrait_url TEXT,
  ADD COLUMN created BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing players so they aren't kicked into char creation
UPDATE public.profiles SET race = 'human', created = true WHERE race IS NULL;

-- Scene image cache
CREATE TABLE public.room_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  image_url TEXT NOT NULL,
  prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room, context_hash)
);
ALTER TABLE public.room_scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenes readable" ON public.room_scenes FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_room_scenes_room ON public.room_scenes(room);

-- New rooms (prologue)
INSERT INTO public.rooms (slug, name, description, ambience, exits) VALUES
('dunes-edge', 'The Edge of the Dunes',
  E'Heat warps the horizon. Sand the color of old bone stretches behind you in an endless sea, and ahead the world finally relents — a thin road of cracked earth winds toward unseen places. You have been walking, perhaps, for a very long time. You do not yet remember your face.',
  'A wind that smells of salt and copper.',
  '{"east":"dunes-fork"}'::jsonb),
('dunes-fork', 'A Forked Path',
  E'The road splits at a lone, lightning-blackened tree. To the north, the road climbs toward the silhouette of high walls and watch-fires — a city, perhaps the last one. To the south, the dunes call again — and a fat black snake coils on a stone, watching you with patient gold eyes, as if it has been waiting.',
  'The snake does not blink.',
  '{"north":"speakers-gate","south":"the-oasis","west":"dunes-edge"}'::jsonb),
('the-oasis', 'The Oasis Where Names Are Found',
  E'The snake leads you between dunes you swear were not there a moment ago, and then suddenly water — impossibly, a still pool ringed with date palms and pale flowers that do not exist anywhere else in the world. The pool reflects you, but the reflection waits. It seems to be asking you who you intend to be.',
  'No insects. No birds. Only the soft lap of water on warm stone.',
  '{"north":"dunes-fork"}'::jsonb),
('speakers-gate', 'The Speakers'' Gate',
  E'The walls of Ember-Hold rise red and rough as a wound. At the gate, six figures wait in identical white robes, their mouths bound in strips of dyed linen, eyes lined with ash. They do not speak — they are forbidden — yet you feel each of them naming you, weighing you. Behind them, the city smolders with smoke and distant bells.',
  'Their breath fogs through the linen in slow, deliberate rhythm.',
  '{"south":"dunes-fork","north":"emberhold-square"}'::jsonb);

-- Make new players spawn in the dunes
ALTER TABLE public.profiles ALTER COLUMN current_room SET DEFAULT 'dunes-edge';

-- Update handle_new_user to spawn in dunes & mark uncreated
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '-' || substr(NEW.id::text, 1, 4);
  END IF;
  INSERT INTO public.profiles (id, username, current_room, created)
  VALUES (NEW.id, uname, 'dunes-edge', false);
  RETURN NEW;
END;
$function$;

-- Storage buckets for portraits & scenes
INSERT INTO storage.buckets (id, name, public) VALUES ('portraits', 'portraits', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('scenes', 'scenes', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "portraits public read" ON storage.objects FOR SELECT USING (bucket_id = 'portraits');
CREATE POLICY "scenes public read" ON storage.objects FOR SELECT USING (bucket_id = 'scenes');
CREATE POLICY "service inserts portraits" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'portraits' AND auth.uid()::text = (storage.foldername(name))[1]);
