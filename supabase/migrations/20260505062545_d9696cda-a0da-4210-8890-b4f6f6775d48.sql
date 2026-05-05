
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  current_room TEXT NOT NULL DEFAULT 'emberhold-square',
  hp INT NOT NULL DEFAULT 20,
  max_hp INT NOT NULL DEFAULT 20,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  gold INT NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Rooms
CREATE TABLE public.rooms (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  ambience TEXT,
  exits JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms readable" ON public.rooms FOR SELECT TO authenticated USING (true);

-- NPCs
CREATE TABLE public.npcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room TEXT NOT NULL REFERENCES public.rooms(slug) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  persona TEXT NOT NULL,
  greeting TEXT
);
ALTER TABLE public.npcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npcs readable" ON public.npcs FOR SELECT TO authenticated USING (true);

-- Messages (chat / actions / narration)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  npc_id UUID REFERENCES public.npcs(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'say', -- say, emote, whisper, narration, system, npc
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_room_created_idx ON public.messages(room, created_at DESC);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages readable" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "users post own messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  -- ensure unique
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '-' || substr(NEW.id::text, 1, 4);
  END IF;
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, uname);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed world
INSERT INTO public.rooms (slug, name, description, ambience, exits) VALUES
('emberhold-square','Ember-Hold Square','You stand on cracked flagstones in the heart of Ember-Hold, a frontier village hewn from the bones of a dead volcano. A bronze brazier burns at the center, its flame the color of bruised wine. Banners stitched with a sundered crown hang limp in the still air.','The brazier hisses. Somewhere a child laughs, then is shushed.','{"north":"crooked-tankard","east":"market-row","south":"south-gate","west":"chapel-of-ash"}'),
('crooked-tankard','The Crooked Tankard','Low beams blackened by centuries of smoke press down on you. Tallow candles gutter on iron-banded tables. The air is thick with spilled mead, wet wool, and the iron scent of a fight not yet finished.',NULL,'{"south":"emberhold-square","up":"tankard-loft"}'),
('tankard-loft','The Tankard Loft','A narrow loft of straw mattresses. A shuttered window looks out over Ember-Hold''s rooftops, where ravens circle a tower that should not be there.',NULL,'{"down":"crooked-tankard"}'),
('market-row','Market Row','Stalls of patched canvas line a narrow lane. Onions, river fish, and stranger things — beetle-glass charms, jars of singing dust — are hawked in three competing dialects.',NULL,'{"west":"emberhold-square"}'),
('chapel-of-ash','Chapel of Ash','The chapel''s roof has fallen in. Snow-pale ash drifts across the broken altar, though no fire has burned here in a hundred years. Something has been writing in the ash with a finger.',NULL,'{"east":"emberhold-square"}'),
('south-gate','The South Gate','A timber gate stands half-open onto the Ash Road, which winds south into the Whispering Wastes. A weathered notice board is nailed to the gatepost.',NULL,'{"north":"emberhold-square","south":"ash-road"}'),
('ash-road','The Ash Road','The road is a pale scar across grey heath. Wind moves the ash like slow water. Far to the south, a black tower leans against the horizon — closer, surely, than it was yesterday.',NULL,'{"north":"south-gate"}');

INSERT INTO public.npcs (room, name, title, persona, greeting) VALUES
('crooked-tankard','Maeve','the Tankard-keeper','A weather-beaten woman in her fifties, missing two fingers on her left hand. She pours drinks with the calm of someone who has seen worse than you. She knows every rumor in Ember-Hold and tells exactly as much as serves her. Speaks in short, dry sentences. Calls strangers "pilgrim".','Maeve looks you up and down, then slides a chipped tankard across the bar. "Pilgrim. You drinking, or just bleeding on my floor?"'),
('chapel-of-ash','Brother Vale','the Last Acolyte','A gaunt young man in robes the color of old bone. He kneels in the ash, tracing symbols he does not seem to be choosing. Speaks as if listening to someone behind you. Believes the tower in the south is a wound, not a building.','Brother Vale does not look up. "Don''t step on the writing. It''s almost a sentence."'),
('market-row','Old Pell','the Charm-seller','A wiry man with a grin too wide for his face. His stall sells beetle-glass charms that hum faintly when a lie is spoken nearby. Haggles theatrically. Knows more than he sells.','"Ah! A face I haven''t cheated yet. Step closer, friend, step closer."'),
('south-gate','Captain Ros','the Gate-warden','A tired soldier in mismatched armor, leaning on a halberd. She has orders to keep people in more than out. Speaks plainly, respects courage, distrusts cleverness.','Captain Ros squints at you. "Going south? Then you''re either brave, paid, or stupid. Which is it?"');
