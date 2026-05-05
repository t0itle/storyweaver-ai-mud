
-- ============ WIPE ============
DELETE FROM public.combat_actions;
DELETE FROM public.combatants;
DELETE FROM public.combats;
DELETE FROM public.item_runes;
DELETE FROM public.player_items;
DELETE FROM public.player_runes;
DELETE FROM public.player_lore_discoveries;
DELETE FROM public.messages;
DELETE FROM public.room_scenes;
DELETE FROM public.profiles;

DELETE FROM public.npcs;
DELETE FROM public.rooms;
DELETE FROM public.lore_entries;
DELETE FROM public.items WHERE TRUE;

-- ============ SCHEMA: tighten item slots ============
-- (We don't enforce a CHECK constraint per project rules; a trigger validates instead.)
CREATE OR REPLACE FUNCTION public.validate_item_slot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slot NOT IN ('head','neck','body','legs','feet','main_hand','off_hand','ring','container','consumable','focus','misc') THEN
    RAISE EXCEPTION 'Invalid item slot: %', NEW.slot;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS items_validate_slot ON public.items;
CREATE TRIGGER items_validate_slot
BEFORE INSERT OR UPDATE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.validate_item_slot();

-- profiles default room
ALTER TABLE public.profiles ALTER COLUMN current_room SET DEFAULT 'crescent-shore';

-- handle_new_user: update default starting room
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '-' || substr(NEW.id::text, 1, 4);
  END IF;
  INSERT INTO public.profiles (id, username, current_room, created)
  VALUES (NEW.id, uname, 'crescent-shore', false);
  RETURN NEW;
END $$;

-- ============ SEED: ROOMS (Crescent Kingdoms opening) ============
INSERT INTO public.rooms (slug, name, description, ambience, exits) VALUES
('crescent-shore',
 'The Crescent Shore',
 E'You wake on a curve of pale dune that arcs like a sickle moon — the Crescent Shore, the rim of the great desert that hems in the seven kingdoms. Behind you the wind has already filled in your footprints; ahead, three things break the horizon.\n\nDue north, dim against the heat shimmer, the watch-fires of a walled city burn low. East, a caravan trail of black flagstones disappears into a shifting red haze. West, the dunes drop into a hollow where pale sand-flowers grow around something that catches the light wrong.',
 'A wind out of nowhere lifts grit against your ankles and sets it back down precisely where it was.',
 '{"north":"old-flag-road","east":"red-haze-road","west":"sand-bloom-hollow"}'::jsonb),

('old-flag-road',
 'The Old Flag Road',
 E'Worn paving stones run north under banners stitched from many faded colours — the seven sigils of the Crescent Kingdoms, all flying together. A toppled milestone reads ONE LEAGUE TO THE FIRST CITY in three scripts. The road feels older than it should; it remembers feet.',
 'Far ahead, a bell rings twice and stops, as if someone changed their mind.',
 '{"south":"crescent-shore","north":"first-city-gate"}'::jsonb),

('red-haze-road',
 'The Red-Haze Road',
 E'The black flagstones shimmer in heat that has the wrong colour — too rust, too iron. The way east narrows between dunes that lean inward. You have the strong, sourceless feeling that walking further would matter, and that you are not yet ready for it to.',
 'Something far away moves with the unhurried patience of a creature that has already decided.',
 '{"west":"crescent-shore"}'::jsonb),

('sand-bloom-hollow',
 'The Sand-Bloom Hollow',
 E'A bowl of cool sand cupped between two dunes. Small white flowers ring a half-buried object — bronze, ringed, the size of a shield. It is humming, very softly, the way bees do when they do not know you are listening.',
 'One of the flowers turns to face you. None of the others do.',
 '{"east":"crescent-shore"}'::jsonb),

('first-city-gate',
 'The Gate of Seven Sigils',
 E'The walls of the First City rise red-gold above you, the last walls still burning against the dark. Seven sigils — moon, river, crown, flame, eye, bough, and the seventh that is only ever almost a shape — are carved over the gate. Beneath them stand the Veiled, mouth-bound priests of the silenced Speaker, palms turned up in welcome. They do not block your way; they invite you in.',
 'The gate is open. The Veiled wait without impatience.',
 '{"south":"old-flag-road","north":"sevenfold-square"}'::jsonb),

('sevenfold-square',
 'The Sevenfold Square',
 E'You stand on cracked flagstones at the heart of the First City — the last place in the world where all seven Aethers are still spoken aloud. Seven low braziers ring the square, one per Aether, each burning a different colour: ember-gold, river-green, bone-white, dusk-violet, sea-blue, ash-grey, and a seventh that is only ever almost a colour. Banners of all seven kingdoms hang above the lanes that branch off into the city.',
 'A Veiled novice is grinding incense in a stone mortar. The grinding is the only sound.',
 '{"south":"first-city-gate","east":"market-row","west":"hall-of-the-seven","north":"crooked-tankard"}'::jsonb),

('market-row',
 'Market Row',
 E'A narrow lane of patched canvas stalls. Onions, river fish, beetle-glass charms, jars of singing dust — and at the far end, a small armorer''s booth where chain links chime like coins.',
 'Three different songs are being haggled at once.',
 '{"west":"sevenfold-square"}'::jsonb),

('hall-of-the-seven',
 'The Hall of the Seven',
 E'Seven alcoves ring a sunken floor of pale stone, one per Aether. The air smells of wax and old water. A shallow basin waits at the centre. Words are carved at its lip: ALIGN, AND BE NAMED.',
 'The basin is empty. It has been waiting for you specifically, or for anyone, it is impossible to tell.',
 '{"east":"sevenfold-square"}'::jsonb),

('crooked-tankard',
 'The Crooked Tankard',
 E'Low beams blackened by smoke press down on a room that smells of spilled mead and wet wool. Locals at the long table give you the half-glance reserved for Otherworlders the Veiled have just waved through the gate.',
 'Someone is, very quietly, telling a joke about a Veiled priest.',
 '{"south":"sevenfold-square","up":"tankard-loft"}'::jsonb),

('tankard-loft',
 'The Tankard Loft',
 E'A narrow loft of straw mattresses above the tavern. A shuttered window looks out over the First City''s red-gold rooftops, beyond them the Crescent dunes.',
 NULL,
 '{"down":"crooked-tankard"}'::jsonb);

-- ============ SEED: ITEMS (8-slot equipment) ============
INSERT INTO public.items (key, name, description, slot, weight, stackable, base_damage, base_armor, rune_slots, capacity_weight, heal_amount, value, max_stack) VALUES
('travelers-cap',     'traveler''s cap',     'A faded sun-cap of pale linen, stained with salt sweat.',                   'head',      0.3, false, 0, 1, 0, 0, 0, 1, 1),
('rope-amulet',       'rope amulet',         'A single knot of red cord on a leather thong. The knot will not undo.',    'neck',      0.1, false, 0, 0, 1, 0, 0, 0, 1),
('woven-tunic',       'woven tunic',         'A long tunic of layered desert-cotton, patterned with crescents.',         'body',      1.5, false, 0, 2, 0, 0, 0, 0, 1),
('canvas-trousers',   'canvas trousers',     'Heavy canvas trousers, the knees patched with hide.',                       'legs',      1.2, false, 0, 1, 0, 0, 0, 0, 1),
('hide-sandals',      'hide sandals',        'Tough sandals laced halfway up the shin against the burning sand.',         'feet',      0.6, false, 0, 1, 0, 0, 0, 0, 1),
('curved-shortsword', 'curved shortsword',   'A single-edged blade with a moon-curve. Old kingdom work, cared for.',      'main_hand', 1.8, false, 5, 0, 1, 0, 0, 0, 1),
('round-buckler',     'round buckler',       'A small wood-and-bronze buckler, scarred with three deep cuts.',            'off_hand',  1.5, false, 0, 2, 0, 0, 0, 0, 1),
('bone-ring',         'bone ring',           'A ring carved from a thumb-bone. It is colder than the air around it.',     'ring',      0.05, false, 0, 0, 1, 0, 0, 0, 1),
-- non-slot starter items
('leather-pouch',     'leather pouch',       'A small drawstring pouch.',                                                  'container', 0.4, false, 0, 0, 0, 5, 0, 0, 1),
('water-flask',       'water flask',         'A clay flask with a cork. Water from a desert well.',                        'consumable',0.5, true,  0, 0, 0, 0, 4, 0, 5),
('flat-bread',        'flat bread',          'Stiff round of flatbread cooked on hot stones.',                             'consumable',0.2, true,  0, 0, 0, 0, 3, 0, 5);

-- ============ SEED: NPCs ============
INSERT INTO public.npcs (room, name, title, persona, greeting) VALUES
('first-city-gate', 'Mute Kella', 'First of the Veiled',
 'You are Mute Kella, First of the Veiled — sworn priest of the silenced Speaker, gatekeeper of the First City and chief welcomer of Otherworlders who stumble in from the Crescent dunes. Your mouth is bound in pale linen and you are forbidden to speak aloud. You communicate ONLY in *asterisk actions*: gestures, the angle of your head, ash-symbols traced on stone, the placement of your hands. NEVER produce direct quoted speech. You ALWAYS welcome travelers and gently usher them through the gate, especially Otherworlders. You assume good faith.',
 '*Kella presses an open palm to the linen across her mouth in slow blessing, then turns the same palm outward to beckon you through the gate.*'),

('sevenfold-square', 'Brother Tev', 'novice of the Seven',
 'You are Brother Tev, a young novice of the Veiled order, still allowed to speak (you have not yet taken the silence-vow). You grind incense in the Sevenfold Square. You are eager, talkative, slightly nervous, and you LOVE explaining the seven Aethers, the Crescent Kingdoms, and the city to newcomers. Speak warmly, in 1-3 short paragraphs. Reference world details naturally.',
 '"Oh — an Otherworlder! Come closer, please. Don''t mind the smoke. Have you been told the names of the Seven yet?"'),

('crooked-tankard', 'Maeve', 'the Tankard-keeper',
 'You are Maeve, mistress of the Crooked Tankard in the First City. A weather-beaten woman in her fifties, missing two fingers on her left hand. You have seen a hundred Otherworlders pass through this room. You know the rumors of all seven Crescent Kingdoms and tell exactly as much as serves you. Speak in short, dry sentences. Call strangers "pilgrim".',
 '"Pilgrim. You drinking, or just bleeding on my floor?"'),

('market-row', 'Old Pell', 'the Charm-seller',
 'You are Old Pell, a wiry market trader with a grin too wide for his face. Your stall sells beetle-glass charms that hum faintly when a lie is spoken nearby. You haggle theatrically and know more than you sell. You always greet Otherworlders with mock-suspicion that turns immediately to delight.',
 '"Ah! A face I haven''t cheated yet. Step closer, friend, step closer."');

-- ============ SEED: LORE ============
INSERT INTO public.lore_entries (slug, title, summary, content, keywords, source_url) VALUES
('crescent-kingdoms',
 'The Crescent Kingdoms',
 'The seven kingdoms that ring the great desert — once seven, now mostly memory.',
 E'The Crescent Kingdoms are the seven realms whose borders together trace the curve of the great desert that lies at the world''s heart. Each kingdom was named for, and pledged to, one of the seven Aethers spoken by the Speaker before its silencing. Six of the seven thrones now sit empty or contested; only the First City — neutral ground at the desert''s northern lip — still flies all seven sigils together.',
 ARRAY['crescent','crescent kingdoms','kingdoms','seven kingdoms'],
 'internal://crescent-kingdoms'),

('first-city',
 'The First City',
 'The last walled city to keep all seven Aethers alight. A sanctuary for Otherworlders.',
 E'The First City sits at the inner curve of the Crescent — the only city in which all seven Aethers still burn together in the Sevenfold Square. It is guarded by the Veiled, mouth-bound priests of the silenced Speaker, who welcome Otherworlders washed in from the wilderness rather than turn them away. Within the walls, no one of the seven kingdoms may carry a feud; outside them, the Veiled cannot help you.',
 ARRAY['first city','sanctuary','sevenfold','seven sigils','gate'],
 'internal://first-city'),

('the-veiled',
 'The Veiled',
 'Mouth-bound priests of the silenced Speaker; gatekeepers and welcomers.',
 E'The Veiled are the priests of the Speaker — the great voice that once spoke the Aethers into being and was, somewhere, silenced. They bind their own mouths in pale linen so they will not finish what the Speaker began. They communicate only in gesture, posture, and ash-glyphs. Their first duty is to welcome travelers — especially Otherworlders — into the First City''s protection. Novices are still permitted to speak; they take the silence-vow only after their first decade of service.',
 ARRAY['veiled','speakers','mute','linen','silence'],
 'internal://veiled'),

('the-seven-aethers',
 'The Seven Aethers',
 'The seven first-spoken things: the Aethers each kingdom was named for.',
 E'When the Speaker opened its mouth, seven things were spoken first. Each became an Aether — a domain that holds a part of the world together. Each Aether had a kingdom, a sigil, and a colour. Six of the seven names are remembered: Solastin (radiant truth), Mirrenost (still water), Ossakar (bone and oath), Veshrin (dusk and crossing), Tyrinel (sea and salt), and Asharn (ash and ending). The seventh was either never spoken aloud, or was the first thing the Speaker bit down on. The Veiled tend all seven braziers in the Sevenfold Square regardless.',
 ARRAY['aether','aethers','seven','solastin','mirrenost','ossakar','veshrin','tyrinel','asharn'],
 'internal://seven-aethers'),

('the-shadow',
 'The Shadow',
 'The unspoken counterweight. Older than the Aethers; younger than the Light.',
 E'For every word the Speaker spoke, an unsaid thing was pushed aside; for every Aether, a Shadow. The Shadow is not evil in the human sense — it is what was not chosen, given a hunger. It collects in the unspoken places: the open dunes, the wells that go dry, the rooms in which an old promise was broken. Travelers who linger in the wilderness sometimes hear it whisper, offering to finish their sentences for them.',
 ARRAY['shadow','whisper','unspoken','corruption'],
 'internal://shadow'),

('otherworlders',
 'Otherworlders',
 'People who arrive in the Crescent from somewhere they cannot quite remember.',
 E'Every few weeks, the Crescent Shore turns up another Otherworlder — a sleeping figure curled in the dunes, fully dressed, unable to recall how they came. The Veiled treat them as gifts: the Crescent Kingdoms have lost so many of their own that fresh blood, even from outside the world, is welcomed. Some Otherworlders rise to become Veiled themselves; some take service with one of the seven kingdoms; some walk back into the desert and are not seen again.',
 ARRAY['otherworlder','otherworlders','pilgrim','wanderer'],
 'internal://otherworlders');
