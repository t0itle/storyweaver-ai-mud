INSERT INTO public.runes (key, name, glyph, kind, description, effect, max_charges, rarity, teacher_npc) VALUES
-- Solastin / High Sanctum (Verra Solain)
('sunpiercer', 'Sunpiercer', '☀', 'active', 'A lance of sun-bright judgement that burns through shadow.', '{"damage":12,"type":"radiant"}'::jsonb, 3, 'rare', 'd98579d2-19af-454a-9bb4-6a6d52f8d645'),
('truthbrand', 'Truthbrand', '✧', 'passive', 'Liars flinch when you speak; deceit costs them dearly.', '{"social":"truth"}'::jsonb, 0, 'uncommon', 'd98579d2-19af-454a-9bb4-6a6d52f8d645'),

-- Khalvaris / Iron Bastion (Captain Hadrek Vol)
('iron-edict', 'Iron Edict', '⚔', 'active', 'A binding strike that pins a foe to the law of steel.', '{"damage":8,"effect":"stun"}'::jsonb, 3, 'uncommon', 'db1922ce-1ed0-4f4e-a00b-7fabd112273b'),
('bulwark', 'Bulwark', '◈', 'passive', 'Set into shield or plate; turns aside the first killing blow.', '{"armor":4}'::jsonb, 0, 'uncommon', 'db1922ce-1ed0-4f4e-a00b-7fabd112273b'),

-- Nyxara / Mirrorhall (Issel-Who-Was)
('mirrorstep', 'Mirrorstep', '◇', 'active', 'You blur — for a heartbeat there are two of you, and the wrong one is struck.', '{"effect":"evade"}'::jsonb, 2, 'rare', '1f68de1a-141d-459c-865a-12e25b2281fa'),
('shiftskin', 'Shiftskin', '◊', 'passive', 'Your face refuses to settle; strangers misremember you.', '{"social":"disguise"}'::jsonb, 0, 'uncommon', '1f68de1a-141d-459c-865a-12e25b2281fa'),

-- Thalvora / Gilded Bazaar (Master Tannic)
('goldtongue', 'Goldtongue', '⚜', 'passive', 'Coin flows your way; merchants hear sweetness in your asking.', '{"social":"barter"}'::jsonb, 0, 'uncommon', 'aac302aa-3dd5-4724-baef-7b4a7515ee86'),
('coinward', 'Coinward', '⊙', 'active', 'A scattering of struck silver wards a blow and rings the air.', '{"effect":"shield"}'::jsonb, 3, 'common', 'aac302aa-3dd5-4724-baef-7b4a7515ee86'),

-- Lazareth / Archive of Aethers (Archivist Renn)
('starscript', 'Starscript', '✶', 'active', 'Reads the next moment from the night-script; warns of the killing strike.', '{"effect":"foresee"}'::jsonb, 2, 'rare', '8f17b5ee-2491-4708-a216-7540bd485ae8'),
('hourglass', 'Hourglass', '⧖', 'passive', 'A grain of borrowed time. Your wounds knit a touch faster.', '{"regen":1}'::jsonb, 0, 'uncommon', '8f17b5ee-2491-4708-a216-7540bd485ae8'),

-- Velithria / Evershade (Lady Sirine)
('heartfire', 'Heartfire', '♥', 'active', 'A pulse of bound longing that staggers the heart of a foe.', '{"damage":7,"effect":"charm"}'::jsonb, 3, 'uncommon', '25f7b5be-5793-4548-b739-ad4aca7dcddc'),
('duskveil', 'Duskveil', '☽', 'passive', 'Twilight clings to you; eyes slide off in low light.', '{"effect":"stealth"}'::jsonb, 0, 'uncommon', '25f7b5be-5793-4548-b739-ad4aca7dcddc'),

-- Morvayne / Feastlands (Old Bramwen)
('feastblood', 'Feastblood', '✿', 'active', 'Steal warmth from a foe; their wound feeds your wound.', '{"damage":6,"effect":"lifesteal"}'::jsonb, 3, 'uncommon', '79d86914-e2a8-4a84-83fc-d9a985217f64'),
('thornroot', 'Thornroot', '❦', 'passive', 'Briars stir under your skin; whoever strikes you bleeds in turn.', '{"effect":"thorns"}'::jsonb, 0, 'common', '79d86914-e2a8-4a84-83fc-d9a985217f64'),

-- Wild runes (no teacher — must be unearthed)
('shadewhisper', 'Shadewhisper', '☄', 'active', 'A rune the Speaker''s priests do not name. It bites where light cannot reach.', '{"damage":10,"type":"shadow"}'::jsonb, 2, 'rare', NULL),
('stormcall', 'Stormcall', '⚡', 'active', 'Calls down a single fork of caged sky.', '{"damage":14,"type":"lightning"}'::jsonb, 2, 'rare', NULL);