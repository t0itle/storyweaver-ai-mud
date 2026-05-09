
-- ============================================================
-- 1) SCHEMA
-- ============================================================
ALTER TABLE public.aethers
  ADD COLUMN IF NOT EXISTS alive boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS throne_room text,
  ADD COLUMN IF NOT EXISTS well_room text,
  ADD COLUMN IF NOT EXISTS wardens_killed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fallen_at timestamptz;

ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS is_warden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_aether boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aether_key text,
  ADD COLUMN IF NOT EXISTS warden_index integer;

CREATE TABLE IF NOT EXISTS public.aether_loyalty (
  user_id uuid NOT NULL,
  aether_key text NOT NULL,
  step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'inactive',
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, aether_key)
);
ALTER TABLE public.aether_loyalty ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own loyalty readable" ON public.aether_loyalty;
CREATE POLICY "own loyalty readable" ON public.aether_loyalty FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 2) THRONE ROOMS
-- ============================================================
INSERT INTO public.rooms (slug, name, kind, label, town_key, description, ambience, exits, hidden) VALUES
('solastin-throne',  'The Beacon Throne',  'throne', 'Throne', 'high-sanctum',     'A high vault of white stone. A blade-shaped beacon burns above the dais where the Aether of the Sun is seated.', 'low roar of a perpetual flame',     '{"out":"high-sanctum"}'::jsonb, false),
('khalvaris-throne', 'The Verdict Throne', 'throne', 'Throne', 'iron-bastion',     'A black iron hall. Two great scales hang above a basalt seat from which the Aether of Judgement rules.',         'iron chains shifting under their own weight', '{"out":"iron-bastion"}'::jsonb, false),
('nyxara-throne',    'The Hush Throne',    'throne', 'Throne', 'silent-horizon',   'A vault open to a mirror-pool. The Aether of Silence sits where every word dies before it is heard.',           'a silence so complete it presses on the ears','{"out":"silent-horizon"}'::jsonb, false),
('thalvora-throne',  'The Coin Throne',    'throne', 'Throne', 'gilded-bazaar',    'A gold-leafed counting hall. The Aether of Trade sits behind a single great ledger.',                          'soft rustle of pages and the clink of coin', '{"out":"gilded-bazaar"}'::jsonb, false),
('lazareth-throne',  'The Mirror Throne',  'throne', 'Throne', 'mirrorlands-court','A vault of slow mirrors. The Aether of Memory sits surrounded by their own reflected histories.',              'glass humming under unseen pressure',         '{"out":"mirrorlands-court"}'::jsonb, false),
('velithria-throne', 'The Vow Throne',     'throne', 'Throne', 'evershade-court',  'A garden under candle-light. The Aether of Love sits on a bench of folded ribbons.',                          'soft singing from somewhere out of sight',   '{"out":"evershade-court"}'::jsonb, false),
('morvayne-throne',  'The Harvest Throne', 'throne', 'Throne', 'feastlands-keep',  'A long hall hung with sheaves. The Aether of Plenty sits at the head of an endless table.',                   'smell of new bread and warm cider',          '{"out":"feastlands-keep"}'::jsonb, false)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.rooms SET exits = exits || '{"in":"solastin-throne"}'::jsonb  WHERE slug = 'high-sanctum';
UPDATE public.rooms SET exits = exits || '{"in":"khalvaris-throne"}'::jsonb WHERE slug = 'iron-bastion';
UPDATE public.rooms SET exits = exits || '{"in":"nyxara-throne"}'::jsonb    WHERE slug = 'silent-horizon';
UPDATE public.rooms SET exits = exits || '{"in":"thalvora-throne"}'::jsonb  WHERE slug = 'gilded-bazaar';
UPDATE public.rooms SET exits = exits || '{"in":"lazareth-throne"}'::jsonb  WHERE slug = 'mirrorlands-court';
UPDATE public.rooms SET exits = exits || '{"in":"velithria-throne"}'::jsonb WHERE slug = 'evershade-court';
UPDATE public.rooms SET exits = exits || '{"in":"morvayne-throne"}'::jsonb  WHERE slug = 'feastlands-keep';

UPDATE public.aethers SET throne_room='solastin-throne',  well_room='high-sanctum'      WHERE key='solastin';
UPDATE public.aethers SET throne_room='khalvaris-throne', well_room='iron-bastion'      WHERE key='khalvaris';
UPDATE public.aethers SET throne_room='nyxara-throne',    well_room='silent-horizon'    WHERE key='nyxara';
UPDATE public.aethers SET throne_room='thalvora-throne',  well_room='gilded-bazaar'     WHERE key='thalvora';
UPDATE public.aethers SET throne_room='lazareth-throne',  well_room='mirrorlands-court' WHERE key='lazareth';
UPDATE public.aethers SET throne_room='velithria-throne', well_room='evershade-court'   WHERE key='velithria';
UPDATE public.aethers SET throne_room='morvayne-throne',  well_room='feastlands-keep'   WHERE key='morvayne';

-- ============================================================
-- 3) THE SEVEN AETHERS as NPCs
-- ============================================================
INSERT INTO public.npcs (name, title, room, persona, greeting, schedule, is_aether, aether_key) VALUES
('Solastin',  'the Beacon and the Blade', 'solastin-throne',  'The Aether of the sun. Speaks in slow, certain sentences. Burns those who lie in their presence.', 'Step into the light, traveler. Speak only what is true.', '{}'::jsonb, true, 'solastin'),
('Khalvaris', 'the Judge',                'khalvaris-throne', 'The Aether of judgement. Cold, exact, never raises their voice.',                                  'Stand and be measured.', '{}'::jsonb, true, 'khalvaris'),
('Nyxara',    'the Muse',                 'nyxara-throne',    'The Aether of silence and inspiration. Speaks only when necessary.',                              '...', '{}'::jsonb, true, 'nyxara'),
('Thalvora',  'the Merchant',             'thalvora-throne',  'The Aether of trade. Friendly, immaculate, always counting.',                                      'Welcome to my ledger.', '{}'::jsonb, true, 'thalvora'),
('Lazareth',  'the Archivist',            'lazareth-throne',  'The Aether of memory. Quiet, exact, slightly absent.',                                             'I remember you, even if you do not yet remember me.', '{}'::jsonb, true, 'lazareth'),
('Velithria', 'the Lover',                'velithria-throne', 'The Aether of love and binding promises. Warm, attentive, terribly patient.',                      'Sit beside me. Tell me whose name you carry.', '{}'::jsonb, true, 'velithria'),
('Morvayne',  'the Harvester',            'morvayne-throne',  'The Aether of plenty. Broad-shouldered, generous of laugh.',                                       'Eat first. We can talk afterward.', '{}'::jsonb, true, 'morvayne')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4) WARDENS (12 per Aether)
-- ============================================================
INSERT INTO public.npcs (name, title, room, persona, greeting, schedule, is_warden, aether_key, warden_index) VALUES
-- SOLASTIN
('Theron Sun-Marshal',    'First Warden of Solastin',  'high-sanctum',      'A grey-haired knight whose bare blade is said to keep the Beacon lit.', 'The light holds because we hold.', '{}'::jsonb, true, 'solastin', 1),
('Sister Halia',          'Warden of the Pyre',        'pyre-court',        'A pyre-keeper who tends the great fire night and day.',                'Mind the embers. They have names.', '{}'::jsonb, true, 'solastin', 2),
('Brother Cael',          'Warden of the Oratory',     'oratory-of-flame',  'A speaker whose throat carries the public prayers.',                   'Speak truly here, or do not speak.', '{}'::jsonb, true, 'solastin', 3),
('Penitent Vren',         'Warden of the Stair',       'penitents-stair',   'A barefoot penitent who climbs the stair each dawn.',                  'A step a day. The Beacon counts them.', '{}'::jsonb, true, 'solastin', 4),
('Ferdan Lance-Rider',    'Warden of the Causeway',    'pilgrim-causeway',  'A horse-warden who escorts pilgrims along the road.',                  'Keep close. The light thins past the next mile.', '{}'::jsonb, true, 'solastin', 5),
('Mira of the Sun-Mile',  'Warden of the Sun-Mile',    'sun-blanched-mile', 'A scout whose voice carries from horizon to horizon.',                 'Two riders, far west. I see them already.', '{}'::jsonb, true, 'solastin', 6),
('Ash Rider',             'Warden of the Pilgrim Rise','pilgrim-rise',      'A rider whose horse has worn three sets of shoes on this rise.',       'Up and over. The road forgets the slow.', '{}'::jsonb, true, 'solastin', 7),
('Kindler Ott',           'Warden of the Ember Mile',  'ember-mile',        'A taciturn kindler who lights the road-fires at dusk.',                'Don''t walk past my fires after dark.', '{}'::jsonb, true, 'solastin', 8),
('Sun-Squire Bel',        'Warden of the Foothills',   'solar-foothills',   'A young squire in dented gold plate.',                                 'I''ll be a knight by harvest. You watch.', '{}'::jsonb, true, 'solastin', 9),
('Smith Roen',            'Warden of the Solar Forge', 'solar-forge',       'A smith who forges only blades meant to catch the sun.',               'A blade is a question. A sharp one is a polite question.', '{}'::jsonb, true, 'solastin', 10),
('Magma-Keeper Dorn',     'Warden of the Magma Forge', 'the-magma-forge',   'A scarred old smith who tends the deeper forge.',                      'Stand back. Not for your sake — for hers.', '{}'::jsonb, true, 'solastin', 11),
('Lantern-Keeper Selene', 'Warden of the Sanctum Gate','sanctum-gate',      'A quiet woman who keeps the great lantern at the gate.',               'You are seen. That is what the light is for.', '{}'::jsonb, true, 'solastin', 12),
-- KHALVARIS
('Verdict Tarn',          'First Warden of Khalvaris', 'iron-bastion',      'A black-clad judge whose ruling has never been overturned.',           'Speak your charge. Or step aside.', '{}'::jsonb, true, 'khalvaris', 1),
('Bailiff Korr',          'Warden of the Bastion Gate','bastion-gate',      'A heavy-shouldered bailiff who searches every cart at the gate.',      'Open it. All of it.', '{}'::jsonb, true, 'khalvaris', 2),
('Forge-Magistrate Vey',  'Warden of the Foundry',     'foundry-stair',     'A magistrate who hears cases over the ring of hammers.',               'Speak loud. The hammers do not pause for testimony.', '{}'::jsonb, true, 'khalvaris', 3),
('Pit-Master Gren',       'Warden of the Dueling Pit', 'dueling-pit',       'A duel-marshal who has stood in the pit with everyone here at least once.', 'Bow first, bleed second.', '{}'::jsonb, true, 'khalvaris', 4),
('Helmsman Brod',         'Warden of Helm Walk',       'helm-walk',         'A retired guardsman who keeps a private watch on the wall walk.',      'Walk with me. Don''t draw your weapon.', '{}'::jsonb, true, 'khalvaris', 5),
('Forge-Sergeant Asra',   'Warden of the Forge Rise', 'forge-rise',        'A barrel-chested sergeant who drills the road-watch.',                 'Eyes up. You walked into my road.', '{}'::jsonb, true, 'khalvaris', 6),
('Cinder-Watch Tel',      'Warden of the Cinder Mile', 'cinder-mile',       'A road-warden whose cloak is permanently grey with ash.',              'Move along. The road has work today.', '{}'::jsonb, true, 'khalvaris', 7),
('Slag-Captain Yorrin',   'Warden of the Slag Mile',   'slag-mile',         'A captain who drills the slag-haulers like a militia.',                'Form up. Yes, you too.', '{}'::jsonb, true, 'khalvaris', 8),
('Quench-Marshal Ren',    'Warden of the Slag Flats',  'slag-flats',        'A marshal who keeps the cooling-yards orderly.',                       'Stand off the iron until it stops singing.', '{}'::jsonb, true, 'khalvaris', 9),
('Iron-Rider Hass',       'Warden of the Ironroad',    'ironroad',          'A road-rider in chain whose horse is shod in iron.',                   'I''ve seen you on this road before. Twice.', '{}'::jsonb, true, 'khalvaris', 10),
('Smith-Sworn Brennig',   'Warden of Anvilrest',       'anvilrest-square',  'A sworn smith of the bastion who runs the anvil-spur.',                'A bastion-sworn blade for a bastion-sworn coin.', '{}'::jsonb, true, 'khalvaris', 11),
('Verdict Steps Korin',   'Warden of the Magma Forge', 'the-magma-forge',   'A judge''s second who interrogates by the open furnace.',              'Heat is honest. People rarely lie at this temperature.', '{}'::jsonb, true, 'khalvaris', 12),
-- NYXARA
('Hush-Master Velen',     'First Warden of Nyxara',    'silent-horizon',    'A pale, soft-voiced master of the great hush.',                        'Lower your voice. She is listening.', '{}'::jsonb, true, 'nyxara', 1),
('Gate-Hush Ari',         'Warden of the Horizon Gate','horizon-gate',      'A gate-warden who waves travelers in without speaking.',               '*nods, gestures you through*', '{}'::jsonb, true, 'nyxara', 2),
('Stair-Keeper Imo',      'Warden of the Hush Stair',  'hush-stair',        'A stair-keeper whose footfalls cannot be heard.',                      'Step where I step. You will be quieter.', '{}'::jsonb, true, 'nyxara', 3),
('Glyph-Master Ena',      'Warden of the Glyph Hall',  'glyph-hall',        'A scholar of the unspoken sigils on the hall walls.',                  'Read with your eyes. Never your tongue.', '{}'::jsonb, true, 'nyxara', 4),
('Indexer Olrik',         'Warden of the Indexers',    'indexers-hall',     'A senior indexer who knows where every silence is filed.',             'The silence you want is in shelf eleven.', '{}'::jsonb, true, 'nyxara', 5),
('Pine-Walker Sera',      'Warden of the Hush Pines',  'hush-pines',        'A road-warden whose path winds between the black pines.',              'Walk softly. The pines remember footsteps.', '{}'::jsonb, true, 'nyxara', 6),
('Archive-Rider Tov',     'Warden of the Archive Rise','archive-rise',      'A messenger who carries unopened letters along the road.',             'A sealed letter. Not for you.', '{}'::jsonb, true, 'nyxara', 7),
('Ink-Watch Mae',         'Warden of the Ink Mile',    'ink-mile',          'A road-warden whose lantern burns black-flame ink.',                   'Mind the lantern. The flame stains.', '{}'::jsonb, true, 'nyxara', 8),
('Hush-Watch Riv',        'Warden of the Hush Mile',   'hush-mile',         'A road-warden who has not spoken aloud in nine years.',                '*holds up an open palm*', '{}'::jsonb, true, 'nyxara', 9),
('Hush-Master Olen',      'Warden of the Hush Room',   'the-hush-room',     'An old master of the inner hush.',                                     'Sit. Do not speak. Listen.', '{}'::jsonb, true, 'nyxara', 10),
('Pool-Keeper Aen',       'Warden of the Ink-Dark Pool','ink-dark-pool',    'A keeper who reads the pool''s surface for unspoken news.',            'Do not throw stones. The pool answers in kind.', '{}'::jsonb, true, 'nyxara', 11),
('Marginalia-Sworn Fen',  'Warden of Marginalia',      'marginalia-square', 'A scribe sworn to the silent archive at the spur.',                    'A copy is a copy. A truth is something else.', '{}'::jsonb, true, 'nyxara', 12),
-- THALVORA
('Reckoner Vex',          'First Warden of Thalvora',  'gilded-bazaar',     'The chief auditor of the bazaar. Her ledger has no errors.',           'Name your trade. I am already counting.', '{}'::jsonb, true, 'thalvora', 1),
('Customs-Master Lora',   'Warden of the Bazaar Gate', 'bazaar-gate',       'A bright, exact customs officer who never accepts a bribe.',           'All goods declared. Including the ones in your sleeve.', '{}'::jsonb, true, 'thalvora', 2),
('Bailiff Tov',           'Warden of the Customs Walk','customs-walk',      'A bailiff who polices the customs lane.',                              'Wait your turn. Everyone waits their turn here.', '{}'::jsonb, true, 'thalvora', 3),
('Beggar-Captain Rin',    'Warden of the Beggars'' Stair', 'beggars-stair', 'A beggar-king who keeps order on the lowest tier.',                    'A copper for news. Two for silence.', '{}'::jsonb, true, 'thalvora', 4),
('Pressman Coy',          'Warden of the Coin-Press',  'coin-press',        'A pressman who can spot a clipped coin in a darkened room.',           'Show me the coin. Both sides.', '{}'::jsonb, true, 'thalvora', 5),
('Auctioneer Sel',        'Warden of the Auction Tier','auction-tier',      'A fast-talking auctioneer who runs the high tier.',                    'Going once. Going twice. Going.', '{}'::jsonb, true, 'thalvora', 6),
('Stall-Boss Hena',       'Warden of Black-Stall Row', 'black-stall-row',   'A stall-boss who decides which traders work the black row.',           'Show your tags or step away.', '{}'::jsonb, true, 'thalvora', 7),
('Debt-Marshal Olwen',    'Warden of the Debt Pen',    'debt-pen',          'A marshal who keeps the debtors orderly until they pay.',              'Your name is in my book. That is not yet bad news.', '{}'::jsonb, true, 'thalvora', 8),
('Underbazaar Boss Trik', 'Warden of the Underbazaar', 'underbazaar',       'A wiry boss who keeps the under-market civil.',                        'Down here we deal in coin only. No promises.', '{}'::jsonb, true, 'thalvora', 9),
('Vault-Keeper Fenn',     'Warden of the Vault',       'vault-of-flowing-coin', 'A vault-keeper who has not seen daylight in a decade.',            'You are not on the list. The list is short.', '{}'::jsonb, true, 'thalvora', 10),
('River-Toll Mara',       'Warden of the Coin River',  'coin-choked-river', 'A toll-keeper at the coin river.',                                     'A copper for crossing. A silver for not being seen.', '{}'::jsonb, true, 'thalvora', 11),
('Goldwash-Master Pell',  'Warden of Goldwash',        'goldwash',          'A road-master at the goldwash road.',                                  'Carts to the right. Coin to the left.', '{}'::jsonb, true, 'thalvora', 12),
-- LAZARETH
('Archivist-Mirror Ish',  'First Warden of Lazareth',  'mirrorlands-court', 'The chief archivist whose hands open every locked memory.',            'Stand still. I am reading you.', '{}'::jsonb, true, 'lazareth', 1),
('Gate-Mirror Tyr',       'Warden of the Mirror Gate', 'mirror-gate',       'A gate-warden who carries a small hand-mirror with him.',              'Look in. If you see only yourself, pass.', '{}'::jsonb, true, 'lazareth', 2),
('Walk-Master Ven',       'Warden of the Mirror Walk', 'mirror-walk',       'An old master of the long mirror walk.',                               'Do not speak to your reflection. It speaks back.', '{}'::jsonb, true, 'lazareth', 3),
('Vault-Master Aen',      'Warden of the Mirror Vault','the-mirror-vault',  'A vault-master who keeps the deepest reflections sealed.',             'The vault is locked. The lock is older than you.', '{}'::jsonb, true, 'lazareth', 4),
('Chronoglass Ot',        'Warden of the Observatory', 'chronoglass-observatory', 'A keeper of the great glass that records yesterday.',          'Yesterday is on the third panel. Mind the dust.', '{}'::jsonb, true, 'lazareth', 5),
('Glassmere Warden Pel',  'Warden of Glassmere',       'glassmere',         'A road-warden of the lake hamlet.',                                    'Quiet road. Quiet town. Keep it so.', '{}'::jsonb, true, 'lazareth', 6),
('Reflection-Master Sar', 'Warden of Reflection Rise', 'reflection-rise',   'A master of the rise where the road first sees its own past.',         'Look at the road behind you before you walk on.', '{}'::jsonb, true, 'lazareth', 7),
('Glass-Mile Watch Tar',  'Warden of the Glass Mile',  'glass-mile',        'A road-warden whose lantern is a single curved sheet of glass.',       'Walk slow. The mile is longer than it looks.', '{}'::jsonb, true, 'lazareth', 8),
('Veil-Mile Watch Bren',  'Warden of the Veil Mile',   'veil-mile',         'A road-warden in a long pale veil.',                                   'Step through. The veil is thinner than it looks.', '{}'::jsonb, true, 'lazareth', 9),
('Quiet-Mirror Keeper',   'Warden of the Quiet Mirror','quiet-mirror',      'A keeper who polishes the great quiet mirror by hand.',                'Do not breathe on the glass.', '{}'::jsonb, true, 'lazareth', 10),
('Mirror-Pass Watch Lor', 'Warden of the Mirror Pass', 'mirror-pass',       'A road-warden of the high pass into the Mirrorlands.',                 'The pass is open. The pass is also a test.', '{}'::jsonb, true, 'lazareth', 11),
('Quietshore-Sworn Inara','Warden of Quietshore',      'quietshore-square', 'A glassblower sworn to the Mirrorlands at the lake spur.',             'A cup, perhaps. Or only conversation.', '{}'::jsonb, true, 'lazareth', 12),
-- VELITHRIA
('Vow-Master Ilen',       'First Warden of Velithria', 'evershade-court',   'The chief vow-keeper who blesses the great promises.',                 'Speak the name. The vow follows.', '{}'::jsonb, true, 'velithria', 1),
('Gate-Vow Ren',          'Warden of the Vow Gate',    'vow-gate',          'A gate-warden who lets only the vowed pass at night.',                 'Whose name do you carry?', '{}'::jsonb, true, 'velithria', 2),
('Walk-Master Vel',       'Warden of the Vow Walk',    'vow-walk',          'A master of the slow vow walk.',                                       'Walk slowly. The walk is the vow.', '{}'::jsonb, true, 'velithria', 3),
('Hall-Keeper Mir',       'Warden of the Vow Hall',    'candlelit-vow-hall','A hall-keeper who lights the vow-candles each evening.',               'Light a candle. Speak only the name.', '{}'::jsonb, true, 'velithria', 4),
('Window-Keeper Sela',    'Warden of the Tear-Glass',  'tear-glass-window', 'A keeper who tends the great teardrop window.',                        'Stand in the colored light. It is honest.', '{}'::jsonb, true, 'velithria', 5),
('Mourners'' Tier Keeper','Warden of the Mourners'' Tier', 'mourners-tier', 'A keeper of the mourners'' tier.',                                     'Sit. Grief takes time, even here.', '{}'::jsonb, true, 'velithria', 6),
('Garden-Keeper Faela',   'Warden of the Veil Garden', 'veil-garden',       'A garden-keeper who tends the veiled flowers.',                        'Mind the petals. They bruise.', '{}'::jsonb, true, 'velithria', 7),
('Pines-Master Onel',     'Warden of the Silver Pines','silver-pines',      'A road-warden of the pines.',                                          'A quiet road tonight. We like quiet.', '{}'::jsonb, true, 'velithria', 8),
('Mourner Rise Watch',    'Warden of Mourner Rise',    'mourner-rise',      'A road-warden of the mourner''s rise.',                                'Walk light. The rise was named for a reason.', '{}'::jsonb, true, 'velithria', 9),
('Silver-Mile Watch',     'Warden of the Silver Mile', 'silver-mile',       'A road-warden of the long silver mile.',                               'Coin in the dish at the end. For the candles.', '{}'::jsonb, true, 'velithria', 10),
('Vigil-Mile Keeper',     'Warden of the Vigil Mile',  'vigil-mile',        'A road-warden who keeps the night vigil.',                             'Stay awake with me a while.', '{}'::jsonb, true, 'velithria', 11),
('Vow-Walk Road Watch',   'Warden of the Vow-Walk Road','vow-walk-road',    'A road-warden of the long approach.',                                  'A name spoken now binds harder. Be careful.', '{}'::jsonb, true, 'velithria', 12),
-- MORVAYNE
('Harvest-Master Brun',   'First Warden of Morvayne',  'feastlands-keep',   'The chief harvest-master who plans the feast.',                        'Sit. There is always a place at the table.', '{}'::jsonb, true, 'morvayne', 1),
('Gate-Keeper Wenna',     'Warden of the Keep Gate',   'keep-gate',         'A round-faced gate-keeper who hands out warm bread to children.',      'Bread first. Then we will see your business.', '{}'::jsonb, true, 'morvayne', 2),
('Granary-Master Olbi',   'Warden of the Granary',     'granary-stair',     'A granary-master who knows every sack by weight.',                     'Sacks to the left. Wagons to the right.', '{}'::jsonb, true, 'morvayne', 3),
('Feast-Throne Watch',    'Warden of the Feast-Throne','feast-throne',      'A senior steward who keeps order at the great table.',                 'Eat slowly. There is more.', '{}'::jsonb, true, 'morvayne', 4),
('Honey-Loft Keeper',     'Warden of the Honey Loft',  'honey-loft',        'A loft-keeper whose hands are permanently sticky.',                    'Mind the bees. Or don''t. They prefer it that way.', '{}'::jsonb, true, 'morvayne', 5),
('Furnace-Master Ged',    'Warden of the Fat Furnace', 'fat-furnace',       'A furnace-master who renders the great fats.',                         'Stand back from the cauldron. The grease pops.', '{}'::jsonb, true, 'morvayne', 6),
('Hearth-Watch Mira',     'Warden of the Hearth Road', 'hearth-road',       'A road-warden whose lantern burns scented oil.',                       'A long road. Have you eaten?', '{}'::jsonb, true, 'morvayne', 7),
('Grain-Mile Watch',      'Warden of the Grain Mile',  'grain-mile',        'A road-warden of the long grain road.',                                'Carts to the verge. The grain comes through.', '{}'::jsonb, true, 'morvayne', 8),
('Orchard-Mile Watch',    'Warden of the Orchard Mile','orchard-mile',      'A road-warden between the orchards.',                                  'Pick none. They are counted.', '{}'::jsonb, true, 'morvayne', 9),
('Harvest-Rise Watch',    'Warden of the Harvest Rise','harvest-rise',      'A road-warden of the rise.',                                           'Up and over. The keep is just past.', '{}'::jsonb, true, 'morvayne', 10),
('Barley-Flats Watch',    'Warden of the Barley Flats','barley-flats',      'A road-warden of the flats.',                                          'Quiet today. Good for walking.', '{}'::jsonb, true, 'morvayne', 11),
('Cider-Hollow-Sworn Pel','Warden of Cider Hollow',    'cider-hollow-square','A sworn smallholder of the keep at the orchard spur.',                'Cider, if you are thirsty. Coin if you are not.', '{}'::jsonb, true, 'morvayne', 12)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5) TRIGGER: kill the Aether when their 12th warden falls
-- ============================================================
CREATE OR REPLACE FUNCTION public.maybe_fall_aether()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  ak text;
  killed int;
BEGIN
  IF NEW.kind <> 'npc_killed' OR NEW.target_id IS NULL THEN RETURN NEW; END IF;
  SELECT aether_key INTO ak FROM public.npcs WHERE id = NEW.target_id AND is_warden = true;
  IF ak IS NULL THEN RETURN NEW; END IF;

  UPDATE public.aethers
     SET wardens_killed = wardens_killed + 1
   WHERE key = ak
   RETURNING wardens_killed INTO killed;

  IF killed >= 12 THEN
    UPDATE public.aethers
       SET alive = false, fallen_at = COALESCE(fallen_at, now())
     WHERE key = ak AND alive = true;
    INSERT INTO public.world_events (kind, room, actor_id, actor_name, target_kind, target_name, details)
    VALUES ('aether_fell', NEW.room, NEW.actor_id, COALESCE(NEW.actor_name,'someone'), 'aether', ak,
            jsonb_build_object('aether', ak));
  END IF;
  RETURN NEW;
END
$func$;

DROP TRIGGER IF EXISTS world_events_maybe_fall_aether ON public.world_events;
CREATE TRIGGER world_events_maybe_fall_aether
AFTER INSERT ON public.world_events
FOR EACH ROW EXECUTE FUNCTION public.maybe_fall_aether();
