
-- 1. CATALOG
CREATE TABLE public.speaker_artifacts (
  key text PRIMARY KEY,
  name text NOT NULL,
  blurb text NOT NULL DEFAULT '',
  lore text NOT NULL DEFAULT '',
  glyph text NOT NULL DEFAULT '☩',
  holder_kind text NOT NULL CHECK (holder_kind IN ('aether','veiled','wild')),
  holder_ref text,                -- aether key, npc id (uuid::text), or null for wild
  home_room text NOT NULL,        -- room where artifact can be engaged
  passive_blurb text NOT NULL DEFAULT '',
  active_name text NOT NULL DEFAULT 'Speak the Word',
  active_blurb text NOT NULL DEFAULT '',
  charges_max int NOT NULL DEFAULT 1,
  rep_penalty_steal int NOT NULL DEFAULT 25,
  merit_required_earn int NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.speaker_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artifacts readable" ON public.speaker_artifacts FOR SELECT TO authenticated USING (true);

-- 2. OWNERSHIP
CREATE TABLE public.player_speaker_artifacts (
  user_id uuid NOT NULL,
  artifact_key text NOT NULL REFERENCES public.speaker_artifacts(key) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'found' CHECK (source IN ('found','stolen','earned','gifted','looted')),
  charges_remaining int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, artifact_key)
);
ALTER TABLE public.player_speaker_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own artifacts readable" ON public.player_speaker_artifacts FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. NEW RUIN ROOMS (7) — each linked off an existing room
INSERT INTO public.rooms (slug, name, description, ambience, exits, kind, label) VALUES
('ruin-pale-spire',         'The Pale Spire',         'A finger of bone-white stone leans above the wolf-glade. The Speaker''s old sigil is half-eaten by lichen at its base.', 'Wind hums through hollow stone like a long, patient breath.', '{"north":"wolf-glade"}'::jsonb, 'ruin','Ruin'),
('ruin-tongue-bell',        'The Tongue-Bell',        'A black iron bell as tall as a man, its clapper carved from petrified tongue. It does not ring.', 'A low pressure on the ear, like the bell wants to be struck.', '{"south":"black-tarn"}'::jsonb, 'ruin','Ruin'),
('ruin-mute-arch',          'The Mute Arch',          'A shattered triumphal arch on the ash road. Every name once carved here has been chiseled out.', 'Ash drifts through the gap and refuses to settle.', '{"north":"ash-road"}'::jsonb, 'ruin','Ruin'),
('ruin-sun-orphanage',      'The Sun-Orphanage',      'A roofless dome where mouthless statues of children stand in a ring around a dry basin.', 'Distant laughter that belongs to no one.', '{"east":"sand-bloom-hollow"}'::jsonb, 'ruin','Ruin'),
('ruin-name-press',         'The Name-Press',         'A vine-choked scriptorium. Stone presses still hold the imprints of words no one will read again.', 'Pages whisper against pages somewhere inside the walls.', '{"south":"vine-garden"}'::jsonb, 'ruin','Ruin'),
('ruin-singing-stones',     'The Singing Stones',     'Seven standing stones in the deep desert, each carved with a closed mouth. They sing when the wind is right.', 'A choir of stone, almost a melody, almost a confession.', '{"east":"whisper-stones"}'::jsonb, 'ruin','Ruin'),
('ruin-tongueless-shrine',  'The Tongueless Shrine',  'A roadside shrine half-swallowed by dune. The Speaker''s effigy has had its lower face struck away.', 'Sand shifts as if an invisible figure had just turned its head.', '{"north":"mirage-wells"}'::jsonb, 'ruin','Ruin');

-- attach inbound exits from existing rooms (merge into existing exits jsonb)
UPDATE public.rooms SET exits = exits || '{"south":"ruin-pale-spire"}'::jsonb        WHERE slug = 'wolf-glade';
UPDATE public.rooms SET exits = exits || '{"north":"ruin-tongue-bell"}'::jsonb       WHERE slug = 'black-tarn';
UPDATE public.rooms SET exits = exits || '{"south":"ruin-mute-arch"}'::jsonb         WHERE slug = 'ash-road';
UPDATE public.rooms SET exits = exits || '{"west":"ruin-sun-orphanage"}'::jsonb      WHERE slug = 'sand-bloom-hollow';
UPDATE public.rooms SET exits = exits || '{"north":"ruin-name-press"}'::jsonb        WHERE slug = 'vine-garden';
UPDATE public.rooms SET exits = exits || '{"west":"ruin-singing-stones"}'::jsonb     WHERE slug = 'whisper-stones';
UPDATE public.rooms SET exits = exits || '{"south":"ruin-tongueless-shrine"}'::jsonb WHERE slug = 'mirage-wells';

-- 4. SEED THE 33 ARTIFACTS
-- 7 Aether-held (in throne rooms)
INSERT INTO public.speaker_artifacts (key, name, blurb, lore, glyph, holder_kind, holder_ref, home_room, passive_blurb, active_name, active_blurb, charges_max, merit_required_earn) VALUES
('beacon-shard','The Beacon-Shard','A splinter of mirror-glass that hums in sunlight.','Solastin keeps it on a chain; she says it remembers the first dawn.','☀','aether','solastin','solastin-throne','While carried, search reveals one extra hint per ruin.','Daybreak Cry','Speak it once: every rune you cast in the next hour ignites brighter.',1,120),
('judges-tongue','The Judge''s Tongue','A bronze tongue cast from a mute prophet''s mouth.','Khalvaris weighs it on the scales beside every verdict.','⚖','aether','khalvaris','khalvaris-throne','Town tariffs bite half as hard while you carry it.','Sentence','Speak the Word: one named Aether warden falls asleep for a day.',1,120),
('muses-veil','The Muse''s Veil','A length of unspun song.','Nyxara wraps it around her hands when she begins to compose.','♪','aether','nyxara','nyxara-throne','NPC amity decays half as fast.','Aria of Refusal','Speak it: every NPC in your current room forgets their last grievance against you.',1,120),
('merchant-seal','The Merchant''s Seal','A weight of solid copper that always tips honest.','Thalvora set the first market price with this seal.','◈','aether','thalvora','thalvora-throne','Merchants offer one tier better price.','Tally Called Even','Speak it: zero out your debt of unrest in any one town.',1,120),
('archive-key','The Archive Key','A key carved from a sentence no one remembers.','Lazareth keeps it on a ring of forgotten doors.','🗝','aether','lazareth','lazareth-throne','You may read any closed lore entry once.','The Door That Was Spoken','Speak it: open one hidden room you have not yet found.',1,120),
('lovers-coin','The Lover''s Coin','A coin with two faces, both yours.','Velithria gives it to those who would rather lose than lie.','♡','aether','velithria','velithria-throne','A friend may revive you once without cost.','Two-Faced Vow','Speak it: tie a single NPC to you as ally for a day.',1,120),
('harvesters-sickle','The Harvester''s Sickle','A sickle whose blade is a row of teeth.','Morvayne cut the first grain and the first throat with it.','☾','aether','morvayne','morvayne-throne','Killing blows return a pinch of HP.','Last Reaping','Speak it: deal a killing blow at any range to one named foe.',1,120);

-- 7 Veiled-held (in their current rooms; Mute Kella holds two)
INSERT INTO public.speaker_artifacts (key, name, blurb, lore, glyph, holder_kind, holder_ref, home_room, passive_blurb, active_name, active_blurb, charges_max, merit_required_earn) VALUES
('lyra-mouthring',    'The Mouth-Ring of Elder Lyra',    'A silver ring shaped like a closed pair of lips.',  'Lyra wears it on her left thumb. She does not remove it to drink.', '◯','veiled','a8f07873-8bfe-40c8-a422-89f79cfff8a5','sevenfold-square','Lore-givers reveal one extra line per visit.','Sealed Sentence','Speak it: nothing you say in the next minute can be quoted against you.',1,80),
('kaelen-thread',     'The Acolyte''s Thread',           'A coil of black thread, longer than it should be.',  'Kaelen carries it sewn into the hem of his robe.',                  '〜','veiled','d719a3ae-0c0a-4a42-8669-1a125b888709','first-city-gate','You may slip past one ambush per day.','Stitched Mouth','Speak it: an enemy in this room cannot speak (no calls for help) for one fight.',1,80),
('krell-ash-bowl',    'The Ash-Bowl of Krell',           'A bowl of pale ash pressed into the shape of a face.','Krell scatters a pinch into every cup he hands a mourner.',         '◉','veiled','6169ff39-5a58-44e9-96ec-07c73250370d','hospice-of-the-mute','Healing items mend a little more.','Ash Upon the Tongue','Speak it: revive yourself once, anywhere, for free.',1,80),
('kella-first-veil',  'The First Veil',                  'The strip of cloth Mute Kella was given as a child.','It has never come off her face.',                                  '☩','veiled','cd090f6d-1c6d-4556-b950-f4b938fe0dac','first-city-gate','You enter and leave the First City unchallenged.','Word Behind the Veil','Speak it: every Veiled in the world will one day owe you a favor.',1,150),
('kella-quiet-coin',  'The Quiet Coin',                  'A coin with no face on either side.',                'Mute Kella tips it into the well of every city she enters.',       '◌','veiled','cd090f6d-1c6d-4556-b950-f4b938fe0dac','first-city-gate','One purchase per day costs nothing.','Coin Returned','Speak it: refund the gold of any one trade you ever made.',1,80),
('sorli-tongue-tale', 'The Tongue-Tale',                 'A scroll wound on a finger-bone spool.',             'Sorli unwinds a single line of it for travelers who deserve it.',   '✑','veiled','f282d3d5-5cd8-4fc7-afe4-9f093cf7262b','crescent-kingdoms','You can hear the next named foe approaching one room earlier.','Tale Made True','Speak it: one boast you make in chat becomes briefly true.',1,80),
('hannec-debt-stone', 'The Debt-Stone of Old Hannec',    'A flat river stone marked with seven small notches.','Old Hannec carries it tucked beside his ledger.',                   '◧','veiled','0dd2f2ee-f035-4c4a-967f-d3eb9b8d9941','grand-atrium-of-the-first-city','Town reputation losses are halved.','Notch Erased','Speak it: clear your standing with any one merchant guild.',1,80);

-- 7 Wild artifacts in the new ruin rooms
INSERT INTO public.speaker_artifacts (key, name, blurb, lore, glyph, holder_kind, holder_ref, home_room, passive_blurb, active_name, active_blurb, charges_max, merit_required_earn) VALUES
('pale-spires-eye','The Pale Spire''s Eye','A cabochon of moonstone set in spire-bone.','Found at the base of the Pale Spire, it watches without lid.','◉','wild',NULL,'ruin-pale-spire','You spot ambushes one room sooner.','Unblinking','Speak it: reveal every hidden NPC in your current room.',1,0),
('tongue-bells-clapper','The Tongue-Bell''s Clapper','The petrified tongue lifted from the silent bell.','Whoever carries it hears the bell ring inside their skull.','☱','wild',NULL,'ruin-tongue-bell','You may speak in any language.','One True Toll','Speak it: shake a single named foe so badly they flee.',1,0),
('mute-arch-keystone','The Mute Arch''s Keystone','A small wedge of arch-stone with a chiseled-out name.','It belongs in a doorway no one remembers building.','◇','wild',NULL,'ruin-mute-arch','One door per day opens for you that should not.','Name Returned','Speak it: temporarily restore a fallen NPC for one conversation.',1,0),
('sun-orphanage-token','The Sun-Orphanage Token','A clay token shaped like a child''s closed mouth.','Pulled from the dry basin in the Sun-Orphanage.','◐','wild',NULL,'ruin-sun-orphanage','Children and small NPCs always tell you the truth.','Promise Kept','Speak it: one NPC who died in your presence wakes once more.',1,0),
('name-press-block','The Name-Press Block','A small wooden block carved with a name still inside it.','From the press itself; the carved name burns the eye.','▣','wild',NULL,'ruin-name-press','You may rename yourself once without losing reputation.','Stamp the Page','Speak it: write yourself into one local rumor as a hero.',1,0),
('singing-stones-shard','The Singing Stones'' Shard','A sliver of singing stone, still humming.','Chipped from the seventh stone in the desert ring.','♬','wild',NULL,'ruin-singing-stones','Lesser runes you cast hum and grant +5%% accuracy.','Choir of One','Speak it: every player in the room hears a verse only you composed.',1,0),
('tongueless-effigy','The Tongueless Effigy','A small effigy of the Speaker, mouth chiseled away.','Found at the half-buried desert shrine.','☩','wild',NULL,'ruin-tongueless-shrine','Chaos pressure rises half as fast on you.','Silent Refusal','Speak it: zero out your chaos pressure in one stroke.',1,0);

-- 12 Wild artifacts buried in existing rooms (room_caches integration)
INSERT INTO public.speaker_artifacts (key, name, blurb, lore, glyph, holder_kind, holder_ref, home_room, passive_blurb, active_name, active_blurb, charges_max, merit_required_earn) VALUES
('bone-dune-reed','The Bone-Dune Reed','A reed flute of polished rib-bone.','Half-buried where two dunes meet.','♪','wild',NULL,'bone-dunes','You may rest one extra time per day in the wild.','Wind Through Bone','Speak it: every desert traveler you meet today will share food.',1,0),
('ember-coal','The Ember-Coal','A coal that has not gone out in centuries.','Plucked from the cold ash of the Ember Dunes.','◉','wild',NULL,'ember-dunes','Cold and night-chill do not slow you.','First Hearth','Speak it: light a hearth anywhere, drawing one ally to you.',1,0),
('glass-tear','The Glass-Tear','A teardrop of fused desert glass.','Lifted from the Glass Flats after a storm.','◇','wild',NULL,'glass-flats','You may carry one extra weight without strain.','Mirror in the Sand','Speak it: one foe in this room sees their own face and stops fighting.',1,0),
('salt-mirror-flake','The Salt-Mirror Flake','A scale of salt that reflects whoever held it last.','Pried from the Salt Mirror.','◧','wild',NULL,'salt-mirror','You see one extra detail in any portrait or scene.','Salt Witness','Speak it: name a thief in any town and they will be marked for a day.',1,0),
('vulture-feather','The Vulture-Feather','A pinion long enough to use as a quill.','Dropped from the spire of the same name.','✒','wild',NULL,'vulture-spire','You write journal entries with a small bonus to clarity.','Carrion Verdict','Speak it: post a free bounty on any named NPC who has wronged you.',1,0),
('windstone','The Wind-Carved Stone','A stone hollowed by centuries of wind into a whistle.','From beneath the Wind-Carved Arches.','♫','wild',NULL,'wind-carved-arches','You may always retreat one room in combat.','Wind Calls Wind','Speak it: a sandstorm covers your tracks for a day.',1,0),
('caravan-wheel-coin','The Caravan-Wheel Coin','A coin pressed flat by a caravan wheel.','Recovered from the Sun-Bleached Caravan.','◯','wild',NULL,'sun-bleached-caravan','You always catch the next wagon, even if you missed it.','Wheel Turns','Speak it: instantly travel to any town hub you have already visited.',1,0),
('oasis-glass','The Oasis Glass','A vial of water from a forgotten oasis that does not evaporate.','Gathered at the Forgotten Oasis.','◌','wild',NULL,'forgotten-oasis','Healing draughts work twice in the desert.','Drink in Memory','Speak it: fully heal yourself and one ally in your room.',1,0),
('echo-leaf','The Echo-Leaf','A page from the Archive that still recites itself.','Found loose in the Archive of Echoes.','✑','wild',NULL,'archive-of-echoes','You may recall one chat exchange from any past day.','Repeat the First Word','Speak it: re-cast the last lesser rune you wove for free.',1,0),
('locket-of-no-one','The Locket of No One','A locket containing a portrait that keeps fading.','Pulled from the Locket Vault.','♡','wild',NULL,'locket-vault','You may be invisible to one named foe per day.','Unmemoried','Speak it: erase yourself from one NPC''s memory entirely.',1,0),
('mask-of-quiet','The Mask of Quiet','A featureless half-mask of pale clay.','Lifted from the Mask Vault.','◎','wild',NULL,'mask-vault','Veiled and First City guards never challenge you.','Wear the Quiet','Speak it: walk through any single locked door once.',1,0),
('first-voice-shard','The First-Voice Shard','A shard of the original Speaker''s only recorded line.','From the Reliquary of the First Voice.','☩','wild',NULL,'reliquary-of-the-first-voice','You may add one line to any lore entry you have read.','The First Word, Spoken Again','Speak it: the next thing you say in chat will be heard by every player online.',1,0);
