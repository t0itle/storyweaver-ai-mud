
-- Insert starting room + 7 routes worth of new rooms (3 mid-road + 1 gate per route = 28) + 1 starter = 29
INSERT INTO public.rooms (slug, name, label, kind, description, ambience, exits) VALUES
('gates-approach','The Approach of Seven Sigils','Approach','road',
 'You stand on a sun-warmed road of pale flagstones. To the north the wall of the First City lifts impossibly high, its banners — seven sigils braided into one — snapping in the dry wind above the great gate. Eastward the road thins to caravan ruts and dust; westward the stones give way to wild grass and standing thorns. Behind you the road runs south toward distant water and the older country.',
 'The wind carries bell-tones from the gatehouse and, faintly, the call of a Veiled crier inside the wall.',
 '{"north":"first-city-gate","south":"old-flag-road"}'::jsonb),

-- Sanctum route
('sun-blanched-mile','The Sun-Blanched Mile','Road','road','A long straight road bleached pale by an unbroken sun. Pilgrims have left painted handprints on the milestones, all of them faded.','Heat-haze shimmers on the next rise. A cicada saws somewhere unseen.','{"north":"pilgrim-causeway","south":"ember-mile"}'::jsonb),
('ember-mile','The Ember Mile','Road','road','The road climbs through low hills the colour of banked coals. Smoke from distant pyres smudges the sky south.','A flake of warm ash drifts past on the wind.','{"north":"sun-blanched-mile","south":"pilgrim-rise"}'::jsonb),
('pilgrim-rise','The Pilgrim Rise','Road','road','At the crest the road opens. Far ahead, the lacquered roofs of the Sanctum catch the sun like struck bells.','A line of pilgrims sits in the shade of a roadside shrine, eating bread in silence.','{"north":"ember-mile","south":"solar-foothills"}'::jsonb),
('sanctum-gate','The Sanctum Gate','Sanctum Gate','gate','A high white arch carved with a thousand named flames. Wardens in gilded mail watch travellers without speaking.','Censers swing slowly above the threshold; the smoke smells of sandalwood and burnt paper.','{"north":"solar-foothills","south":"high-sanctum"}'::jsonb),

-- Bastion route
('slag-mile','The Slag Mile','Road','road','The road runs between black hills of cinder. Broken weapons, half-melted, jut from the slope.','Somewhere a foundry hammer keeps a slow, patient time.','{"north":"ironroad","south":"cinder-mile"}'::jsonb),
('cinder-mile','The Cinder Mile','Road','road','The flagstones here are scorched and cracked. The wind tastes of iron.','A wheel of a broken war-cart leans against a milestone, still smoking faintly.','{"north":"slag-mile","south":"forge-rise"}'::jsonb),
('forge-rise','The Forge Rise','Road','road','The road climbs to a ridge from which red light pulses on the underside of the clouds.','You can hear the long breath of bellows even from here.','{"north":"cinder-mile","south":"slag-flats"}'::jsonb),
('bastion-gate','The Bastion Gate','Bastion Gate','gate','A wedge of black iron sunk into the stone of the mountain. Two wardens stand bare-armed in the heat, weighing every passerby with their eyes.','The gate creaks open and shut on counterweights of slag, with a sound like a great mouth working.','{"north":"slag-flats","south":"iron-bastion"}'::jsonb),

-- Mirrorlands route
('veil-mile','The Veil Mile','Road','road','Tattered silver veils have been tied between the trees lining the road. They turn slowly, showing the road behind you instead of the road ahead.','A veil lifts in the wind and, for a moment, your reflection lifts with it.','{"north":"mirror-pass","south":"glass-mile"}'::jsonb),
('glass-mile','The Glass Mile','Road','road','The flagstones are inset with shards of polished glass. Walking, you see a hundred tiny versions of yourself flicker beneath your feet.','A small shard underfoot shows a face that does not match yours, then is gone.','{"north":"veil-mile","south":"reflection-rise"}'::jsonb),
('reflection-rise','The Reflection Rise','Road','road','From the rise the Mirrorlands Court spreads below: a city of pale roofs ringed by still water that holds it twice.','A heron stands in the water and does not move while you watch.','{"north":"glass-mile","south":"glassmere"}'::jsonb),
('mirror-gate','The Mirror Gate','Mirror Gate','gate','An archway of polished obsidian. Stepping under it, you see yourself walking the other way.','The gate hums faintly, the way a struck bowl hums after the strike.','{"north":"glassmere","south":"mirrorlands-court"}'::jsonb),

-- Bazaar route
('coin-mile','The Coin Mile','Road','road','The road is studded with small bronze coins hammered into the flagstones — a tradition, a tax, a boast, no one is sure.','A child runs past chasing a coin that rolls and rolls and does not stop.','{"north":"caravan-spur","south":"spice-mile"}'::jsonb),
('spice-mile','The Spice Mile','Road','road','Caravan masters have spilled their sweepings here for generations. The dust under your boots smells of saffron, cardamom, and old smoke.','A merchant on a tired mule lifts a hand in greeting and does not stop talking to himself.','{"north":"coin-mile","south":"broker-rise"}'::jsonb),
('broker-rise','The Broker Rise','Road','road','From this hill you can see the Gilded Bazaar — gold leaf on every roof, a city that hurts the eye in late sun.','Someone has scratched a debtor''s name into a milestone and crossed it out, twice.','{"north":"spice-mile","south":"goldwash"}'::jsonb),
('bazaar-gate','The Bazaar Gate','Bazaar Gate','gate','A gate of beaten gold, dented and re-beaten a thousand times. A toll-keeper sits in the shade with a small scale and a long, bored face.','The gate''s hinges are inlaid with old coin that rings softly when the wind takes the door.','{"north":"goldwash","south":"gilded-bazaar"}'::jsonb),

-- Horizon route
('hush-mile','The Hush Mile','Road','road','The trees thicken and the wind drops away. Sound travels strangely — your own footsteps come back to you a beat late.','A bird calls once, very far off, and then there is no other sound.','{"north":"star-stairs","south":"ink-mile"}'::jsonb),
('ink-mile','The Ink Mile','Road','road','The flagstones are dark with the spillings of a hundred scribes who walked this road carrying their work. The black has never quite washed out.','A torn page tumbles past on the wind, blank on one side, dense with notes on the other.','{"north":"hush-mile","south":"archive-rise"}'::jsonb),
('archive-rise','The Archive Rise','Road','road','From the rise the Silent Horizon shows itself: a low, immense roof of slate, broken by a single tall observatory.','A telescope at the observatory catches the sun and, for a moment, points at you.','{"north":"ink-mile","south":"hush-pines"}'::jsonb),
('horizon-gate','The Horizon Gate','Horizon Gate','gate','A modest gate of pale wood, kept clean. A single mute warden hands you a printed card asking that you keep your voice down within the walls.','The gate makes no sound at all when it opens or shuts.','{"north":"hush-pines","south":"silent-horizon"}'::jsonb),

-- Evershade route
('vigil-mile','The Vigil Mile','Road','road','Candles in glass jars line the road, set there for travellers who never returned. Most are still burning.','A young mourner kneels at one of the jars, replacing the candle without looking up.','{"north":"vow-walk-road","south":"silver-mile"}'::jsonb),
('silver-mile','The Silver Mile','Road','road','A road of pale grey gravel, kept raked. Nothing grows on either side; only the planted silver birches, evenly spaced.','A bell hung in one of the birches gives a single, very soft note as you pass.','{"north":"vigil-mile","south":"mourner-rise"}'::jsonb),
('mourner-rise','The Mourner Rise','Road','road','From the rise the Evershade Court is visible — a city of white roofs in a held breath of mist.','Somewhere ahead a single voice is singing, very slowly, a song you almost know.','{"north":"silver-mile","south":"silver-pines"}'::jsonb),
('vow-gate','The Vow Gate','Vow Gate','gate','A gate of carved white wood. Couples and mourners alike pause beneath the arch to retie a thread to one of the iron rings set into the stone.','The wind moves the threads and they whisper against each other like a soft crowd talking.','{"north":"silver-pines","south":"evershade-court"}'::jsonb),

-- Feastlands route
('grain-mile','The Grain Mile','Road','road','The road runs between fields of barley and rye, each field marked with a painted post bearing the lord''s seal.','A scarecrow with a real, ancient sword tied to its arm watches the road.','{"north":"hearth-road","south":"orchard-mile"}'::jsonb),
('orchard-mile','The Orchard Mile','Road','road','The road bends through low orchards of pear and quince. Windfall fruit lies sweet-rotting on the stones.','Wasps drift up from the fallen fruit and lose interest in you.','{"north":"grain-mile","south":"harvest-rise"}'::jsonb),
('harvest-rise','The Harvest Rise','Road','road','From the rise you can see the Feastlands Keep: a sprawling crown of long halls and smoke from a hundred kitchens.','You can smell roasting meat from here, and somebody''s burnt loaf.','{"north":"orchard-mile","south":"barley-flats"}'::jsonb),
('keep-gate','The Keep Gate','Keep Gate','gate','A wide, low gate built more for wagons than for war. A cook''s apprentice with a basket of onions waves you through without looking up.','The gate smells, faintly and permanently, of bread.','{"north":"barley-flats","south":"feastlands-keep"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Insert First City Gate's south exit -> gates-approach (preserving the rest)
UPDATE public.rooms
SET exits = exits - 'south' || jsonb_build_object('south','gates-approach')
WHERE slug = 'first-city-gate';

-- Re-key the existing first road rooms (currently use in/out) into proper north/south chain.
-- Pattern per route: <head-road>.south = <new mid 1>; <head-road>.north = first-city-gate.
-- The existing "tail" road room (e.g. solar-foothills) currently has in: capital, out: head; rewire to north/south chain.

-- Sanctum
UPDATE public.rooms SET exits = '{"north":"first-city-gate","south":"sun-blanched-mile"}'::jsonb WHERE slug = 'pilgrim-causeway';
UPDATE public.rooms SET exits = '{"north":"pilgrim-rise","south":"sanctum-gate"}'::jsonb WHERE slug = 'solar-foothills';
UPDATE public.rooms
SET exits = exits - 'south' || jsonb_build_object('south','sanctum-gate')
WHERE slug = 'high-sanctum';

-- Bastion
UPDATE public.rooms SET exits = '{"north":"first-city-gate","south":"slag-mile"}'::jsonb WHERE slug = 'ironroad';
UPDATE public.rooms SET exits = '{"north":"forge-rise","south":"bastion-gate"}'::jsonb WHERE slug = 'slag-flats';
UPDATE public.rooms
SET exits = exits - 'south' || jsonb_build_object('south','bastion-gate')
WHERE slug = 'iron-bastion';

-- Mirrorlands
UPDATE public.rooms SET exits = '{"north":"first-city-gate","south":"veil-mile"}'::jsonb WHERE slug = 'mirror-pass';
UPDATE public.rooms SET exits = '{"north":"reflection-rise","south":"mirror-gate"}'::jsonb WHERE slug = 'glassmere';
UPDATE public.rooms
SET exits = exits - 'south' || jsonb_build_object('south','mirror-gate')
WHERE slug = 'mirrorlands-court';

-- Bazaar
UPDATE public.rooms SET exits = '{"north":"first-city-gate","south":"coin-mile"}'::jsonb WHERE slug = 'caravan-spur';
UPDATE public.rooms SET exits = '{"north":"broker-rise","south":"bazaar-gate"}'::jsonb WHERE slug = 'goldwash';
UPDATE public.rooms
SET exits = exits - 'south' || jsonb_build_object('south','bazaar-gate')
WHERE slug = 'gilded-bazaar';

-- Horizon
UPDATE public.rooms SET exits = '{"north":"first-city-gate","south":"hush-mile"}'::jsonb WHERE slug = 'star-stairs';
UPDATE public.rooms SET exits = '{"north":"archive-rise","south":"horizon-gate"}'::jsonb WHERE slug = 'hush-pines';
UPDATE public.rooms
SET exits = exits - 'south' || jsonb_build_object('south','horizon-gate')
WHERE slug = 'silent-horizon';

-- Evershade
UPDATE public.rooms SET exits = '{"north":"first-city-gate","south":"vigil-mile"}'::jsonb WHERE slug = 'vow-walk-road';
UPDATE public.rooms SET exits = '{"north":"mourner-rise","south":"vow-gate"}'::jsonb WHERE slug = 'silver-pines';
UPDATE public.rooms
SET exits = exits - 'south' || jsonb_build_object('south','vow-gate')
WHERE slug = 'evershade-court';

-- Feastlands
UPDATE public.rooms SET exits = '{"north":"first-city-gate","south":"grain-mile"}'::jsonb WHERE slug = 'hearth-road';
UPDATE public.rooms SET exits = '{"north":"harvest-rise","south":"barley-flats"}'::jsonb WHERE slug = 'hearth-road' AND false; -- placeholder
UPDATE public.rooms SET exits = '{"north":"harvest-rise","south":"keep-gate"}'::jsonb WHERE slug = 'barley-flats';
UPDATE public.rooms
SET exits = exits - 'south' || jsonb_build_object('south','keep-gate')
WHERE slug = 'feastlands-keep';
