
-- =====================================================================
-- CLASS SYSTEM: class_defs, class_skill_nodes, player_class_skills
-- =====================================================================

CREATE TABLE public.class_defs (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  flavor TEXT NOT NULL,
  hp_mod INT NOT NULL DEFAULT 0,
  starting_kit JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{item_key, quantity, equipped_slot?}]
  awakenings JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{key, name, flavor, capstone_node_key}]
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.class_defs TO anon, authenticated;
GRANT ALL ON public.class_defs TO service_role;
ALTER TABLE public.class_defs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Class defs are public" ON public.class_defs FOR SELECT USING (true);

CREATE TABLE public.class_skill_nodes (
  key TEXT PRIMARY KEY,
  class_key TEXT NOT NULL REFERENCES public.class_defs(key) ON DELETE CASCADE,
  tier INT NOT NULL CHECK (tier BETWEEN 1 AND 4),
  sort_order INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  effect JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX class_skill_nodes_by_class ON public.class_skill_nodes(class_key, tier, sort_order);
GRANT SELECT ON public.class_skill_nodes TO anon, authenticated;
GRANT ALL ON public.class_skill_nodes TO service_role;
ALTER TABLE public.class_skill_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Class skill nodes are public" ON public.class_skill_nodes FOR SELECT USING (true);

CREATE TABLE public.player_class_skills (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL REFERENCES public.class_skill_nodes(key) ON DELETE CASCADE,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, node_key)
);
GRANT SELECT, INSERT ON public.player_class_skills TO authenticated;
GRANT ALL ON public.player_class_skills TO service_role;
ALTER TABLE public.player_class_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players see their class talents" ON public.player_class_skills
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Players take their own class talents" ON public.player_class_skills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- PROFILE COLUMNS
-- =====================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS class_key TEXT REFERENCES public.class_defs(key),
  ADD COLUMN IF NOT EXISTS awakened_class TEXT,
  ADD COLUMN IF NOT EXISTS awakened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS awakening_available BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unique_attribute JSONB;

-- =====================================================================
-- LEVEL-15 AWAKENING TRIGGER (extends existing handle_profile_xp_change)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_profile_xp_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_level integer;
  gained integer;
BEGIN
  IF NEW.xp IS DISTINCT FROM OLD.xp THEN
    new_level := public.level_for_xp(NEW.xp);
    IF new_level > COALESCE(OLD.level, 1) THEN
      gained := new_level - COALESCE(OLD.level, 1);
      NEW.level := new_level;
      NEW.max_hp := COALESCE(OLD.max_hp, 20) + gained;
      NEW.hp := LEAST(NEW.max_hp, COALESCE(NEW.hp, OLD.hp) + gained);
      NEW.talent_points := COALESCE(OLD.talent_points, 0) + gained;
      INSERT INTO public.messages (room, user_id, author_name, kind, content)
      VALUES (NEW.current_room, NULL, '—', 'system',
              '✦ ' || NEW.username || ' rises to level ' || new_level || '. (+' || gained || ' max HP, +' || gained || ' talent point' || CASE WHEN gained = 1 THEN '' ELSE 's' END || ')');

      -- Awakening: first crossing of level 15 for a classed, un-awakened player
      IF new_level >= 15
         AND COALESCE(OLD.level, 1) < 15
         AND NEW.class_key IS NOT NULL
         AND NEW.awakened_class IS NULL
         AND NEW.awakening_available = false THEN
        NEW.awakening_available := true;
        INSERT INTO public.messages (room, user_id, author_name, kind, content)
        VALUES (NEW.current_room, NULL, '—', 'system',
                '✧ Something is stirring in ' || NEW.username || '. The Mirror of Becoming will know their face — seek it in any capital.');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- =====================================================================
-- SEED: 12 CLASSES
-- =====================================================================
INSERT INTO public.class_defs (key, name, tagline, flavor, hp_mod, starting_kit, awakenings, sort_order) VALUES
('warrior',     'Warrior',     'steel, sweat, and the last stand',
  'You learned young that a well-placed blade ends more arguments than any prayer. The road remembers your footfalls.',
  3, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"warlord","name":"Warlord","flavor":"Command the field. Fear follows your banner."},{"key":"blade-saint","name":"Blade Saint","flavor":"One perfect stroke. One perfect life."}]'::jsonb, 1),
('mage',        'Mage',        'grammar of the unspoken',
  'The world has verbs older than any tongue. You have learned three of them and lived.',
  -1, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"archon","name":"Archon","flavor":"The elements answer without asking."},{"key":"chronomant","name":"Chronomant","flavor":"You bend the hour to your hand."}]'::jsonb, 2),
('monk',        'Monk',        'still water, sudden strike',
  'You need no weapon but your breath. Your fists are a philosophy the world does not want.',
  1, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"iron-mountain","name":"Iron Mountain","flavor":"Nothing moves you. Nothing."},{"key":"windbreath","name":"Windbreath","flavor":"You are between strikes before they land."}]'::jsonb, 3),
('paladin',     'Paladin',     'a vow with edges',
  'Your god is your weapon. Or your weapon is your god — you have stopped counting the difference.',
  2, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"crusader","name":"Crusader","flavor":"The vow burns brighter than the sword."},{"key":"oathbreaker","name":"Oathbreaker","flavor":"You broke it. What remains still cuts."}]'::jsonb, 4),
('ranger',      'Ranger',      'quiet feet, quiet arrows',
  'The road knows you better than any city ever did. You know the road better than it knows itself.',
  1, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"pathfinder","name":"Pathfinder","flavor":"No door is closed to you. No trail is cold."},{"key":"beastkeeper","name":"Beastkeeper","flavor":"Things with teeth follow you now."}]'::jsonb, 5),
('rogue',       'Rogue',       'nobody sees you leave',
  'Everything has a lock. Every lock has a key. You have decided you are the key.',
  0, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"shadowdancer","name":"Shadowdancer","flavor":"You slip between what people notice and what they don''t."},{"key":"kingslayer","name":"Kingslayer","flavor":"One strike. From behind. Forever remembered."}]'::jsonb, 6),
('summoner',    'Summoner',    'you were never alone',
  'The names in your throat are older than your teeth. When you call, they still come.',
  -1, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"beastlord","name":"Beastlord","flavor":"They come without being asked now."},{"key":"voidcaller","name":"Voidcaller","flavor":"You call to things that should not answer."}]'::jsonb, 7),
('gambler',     'Gambler',     'luck is a muscle',
  'You have folded better hands than most people ever hold. Every road is a coin, and you have learned to feel it turning.',
  0, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"knife-of-fortune","name":"Knife of Fortune","flavor":"Every gamble is loaded now — for you."},{"key":"empty-house","name":"Empty House","flavor":"You bet nothing. You win everything."}]'::jsonb, 8),
('bard',        'Bard',        'a song they cannot unhear',
  'You remember every name, every wound, every debt. Your voice does the work three swords could not.',
  0, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"lorekeeper","name":"Lorekeeper","flavor":"You are the last mouth that remembers."},{"key":"skald","name":"Skald","flavor":"Your song moves armies. And they know it."}]'::jsonb, 9),
('alchemist',   'Alchemist',   'salt, ash, and stubbornness',
  'Every liquid is a promise. You have learned which promises are worth keeping and which will kill you slowly.',
  0, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"transmuter","name":"Transmuter","flavor":"You unmake things back into what they were."},{"key":"plaguebearer","name":"Plaguebearer","flavor":"Your vials open doors nobody wants opened."}]'::jsonb, 10),
('necromancer', 'Necromancer', 'the dead still owe you',
  'Death did not stop you. It only slowed you down. You have taken it as a partner.',
  -1, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"lich","name":"Lich","flavor":"You have already crossed. You just came back."},{"key":"soulbinder","name":"Soulbinder","flavor":"You keep them close. You do not let them rest."}]'::jsonb, 11),
('runewright',  'Runewright',  'the letter is the sword',
  'You have learned that a well-cut sigil holds more than any blade. Ink is your discipline; stone is your page.',
  0, '[{"item_key":"tattered-cloak","quantity":1,"equipped_slot":"body"}]'::jsonb,
  '[{"key":"glyphmaster","name":"Glyphmaster","flavor":"The runes obey without stroke. You only think them."},{"key":"stonespeaker","name":"Stonespeaker","flavor":"The old letters wake and answer you by name."}]'::jsonb, 12);

-- =====================================================================
-- SEED: 96 CLASS SKILL NODES (8 per class, 2 per tier)
-- =====================================================================
INSERT INTO public.class_skill_nodes (key, class_key, tier, sort_order, name, description) VALUES
-- Warrior
('warrior-t1-a','warrior',1,1,'Thick Skin','+1 max HP per warrior talent taken. The road hardens you.'),
('warrior-t1-b','warrior',1,2,'Weighted Step','You wield heavier gear without penalty. Encumbrance eases.'),
('warrior-t2-a','warrior',2,1,'Second Wind','Once per fight, refuse a killing blow at 1 HP.'),
('warrior-t2-b','warrior',2,2,'Cleaving Strike','Your attacks nick the next foe in line.'),
('warrior-t3-a','warrior',3,1,'Iron Guard','Defend gives allies in room +2 armor for a turn.'),
('warrior-t3-b','warrior',3,2,'Warcry','Once per fight, cow enemies — they lose a turn.'),
('warrior-t4-a','warrior',4,1,'Last Stand','At 1 HP, your damage doubles until the fight ends.'),
('warrior-t4-b','warrior',4,2,'Unmoved','You cannot be forced from a square. Fear does not touch you.'),
-- Mage
('mage-t1-a','mage',1,1,'Focused Breath','Lesser runes cost less concentration; tracing is more forgiving.'),
('mage-t1-b','mage',1,2,'Ember Grasp','Your first cast each fight lands with +2 damage.'),
('mage-t2-a','mage',2,1,'Twin Trace','Chance to weave two lesser runes in the same beat.'),
('mage-t2-b','mage',2,2,'Ward-Weave','Cast Sana on yourself as a reflex when struck low.'),
('mage-t3-a','mage',3,1,'Elemental Bind','Runes you cast leave a lingering aura on the target.'),
('mage-t3-b','mage',3,2,'Mind''s Ear','You sense hostile intent in the room before it acts.'),
('mage-t4-a','mage',4,1,'Archon''s Breath','Once per day, unleash all traced runes at once.'),
('mage-t4-b','mage',4,2,'Bent Hour','Once per fight, take an extra turn.'),
-- Monk
('monk-t1-a','monk',1,1,'Empty Hand','You strike unarmed as if wielding a fine weapon.'),
('monk-t1-b','monk',1,2,'Still Center','Your first defend each fight negates all damage.'),
('monk-t2-a','monk',2,1,'Flowing Strike','Attacks chain — every hit boosts the next by +1.'),
('monk-t2-b','monk',2,2,'Read the Breath','You act first in every combat round.'),
('monk-t3-a','monk',3,1,'Iron Body','Physical damage against you is reduced by 25%.'),
('monk-t3-b','monk',3,2,'One-Inch Blow','Critical hits with unarmed strikes bypass armor.'),
('monk-t4-a','monk',4,1,'Perfect Stillness','You cannot be interrupted while tracing a rune.'),
('monk-t4-b','monk',4,2,'Wind Between','Once per fight, dodge the next blow entirely.'),
-- Paladin
('paladin-t1-a','paladin',1,1,'Aether''s Mark','Your strikes glow faintly with your god''s colour. +1 damage to the unaligned.'),
('paladin-t1-b','paladin',1,2,'Vigil','You do not need to sleep to recover HP.'),
('paladin-t2-a','paladin',2,1,'Laying On','Heal an ally in room for a small amount, once per fight.'),
('paladin-t2-b','paladin',2,2,'Righteous Wrath','+3 damage against wardens of opposing Aethers.'),
('paladin-t3-a','paladin',3,1,'Aura of Faith','Allies in room take -1 damage from all sources.'),
('paladin-t3-b','paladin',3,2,'Warding Hymn','Enemies who strike you take small backlash damage.'),
('paladin-t4-a','paladin',4,1,'Blazing Vow','Once per fight, become untargetable for one round.'),
('paladin-t4-b','paladin',4,2,'Judgement','A single named enemy takes double damage this fight.'),
-- Ranger
('ranger-t1-a','ranger',1,1,'Trail-Read','You always know which exit you last came in through, even lost in the dunes.'),
('ranger-t1-b','ranger',1,2,'Steady Aim','Your first ranged attack each fight cannot miss.'),
('ranger-t2-a','ranger',2,1,'Beast Sense','You can tell what NPCs and creatures are in adjacent rooms.'),
('ranger-t2-b','ranger',2,2,'Silent Step','You may leave combat by fleeing without a roll.'),
('ranger-t3-a','ranger',3,1,'Hunter''s Mark','Mark a target: +2 damage to them until the fight ends.'),
('ranger-t3-b','ranger',3,2,'Wilds-Born','Wilderness rooms restore HP faster while you rest.'),
('ranger-t4-a','ranger',4,1,'Pack Hunter','A wild beast companion joins you and fights on your side.'),
('ranger-t4-b','ranger',4,2,'Trueshot','One arrow per day cannot be avoided by any means.'),
-- Rogue
('rogue-t1-a','rogue',1,1,'Light Fingers','+20% success on steal attempts.'),
('rogue-t1-b','rogue',1,2,'Silent Boots','You are not spotted entering a room until you act.'),
('rogue-t2-a','rogue',2,1,'Backstab','First strike each fight deals double damage.'),
('rogue-t2-b','rogue',2,2,'Fence''s Ear','Fences pay you 70% instead of 55%.'),
('rogue-t3-a','rogue',3,1,'Vanish','Once per fight, become invisible for one round.'),
('rogue-t3-b','rogue',3,2,'Poison Blade','Your attacks apply small bleed for 3 turns.'),
('rogue-t4-a','rogue',4,1,'Shadowmeld','You may leave combat at will while below half HP.'),
('rogue-t4-b','rogue',4,2,'Killing Word','Once per day, instant-kill a wounded non-boss target.'),
-- Summoner
('summoner-t1-a','summoner',1,1,'First Name','Summon a small spirit that fights for one round each combat.'),
('summoner-t1-b','summoner',1,2,'Bound Voice','Your companion NPC gets +2 max HP.'),
('summoner-t2-a','summoner',2,1,'Shared Wound','Redirect a portion of damage taken to your summon.'),
('summoner-t2-b','summoner',2,2,'Second Name','You may keep two summons at once.'),
('summoner-t3-a','summoner',3,1,'Ancestor''s Aid','Once per fight, call an ancient warrior spirit for one devastating hit.'),
('summoner-t3-b','summoner',3,2,'Binding Chain','Enemies who strike your summon become marked.'),
('summoner-t4-a','summoner',4,1,'Choir','All summons act on your turn now, not separately.'),
('summoner-t4-b','summoner',4,2,'Third Name','Call a name you do not fully understand. It comes.'),
-- Gambler
('gambler-t1-a','gambler',1,1,'Coin Sense','You feel loaded dice and false weights instantly.'),
('gambler-t1-b','gambler',1,2,'Lucky Streak','Any attack roll of 1 is re-rolled once per fight.'),
('gambler-t2-a','gambler',2,1,'Double Down','Take a big risk: your next attack is +5 damage but you can be interrupted.'),
('gambler-t2-b','gambler',2,2,'House Odds','Gold rewards from quests are +15%.'),
('gambler-t3-a','gambler',3,1,'Cheat Death','Once per day, refuse a killing blow with a coin flip.'),
('gambler-t3-b','gambler',3,2,'All-In','Sacrifice half your gold to guarantee a critical hit.'),
('gambler-t4-a','gambler',4,1,'Knife of Fortune','Every third attack is automatically a critical hit.'),
('gambler-t4-b','gambler',4,2,'Empty House','If you enter combat with 0 gold, all your damage is doubled.'),
-- Bard
('bard-t1-a','bard',1,1,'Silver Tongue','+2 to any social check with NPCs.'),
('bard-t1-b','bard',1,2,'Perfect Memory','You remember every NPC name and every quest given, forever.'),
('bard-t2-a','bard',2,1,'Battle Hymn','Allies in room get +1 damage while you are conscious.'),
('bard-t2-b','bard',2,2,'Cutting Word','Once per fight, force an enemy to lose a turn laughing.'),
('bard-t3-a','bard',3,1,'Rally','Wake a downed ally to 25% HP once per day.'),
('bard-t3-b','bard',3,2,'Verse of Ruin','Deal small psychic damage to all enemies in room.'),
('bard-t4-a','bard',4,1,'Song That Ends the Fight','Once per day, end combat instantly — nobody wins, nobody loses.'),
('bard-t4-b','bard',4,2,'Skald''s Tongue','Your reputation gains double Merit per act.'),
-- Alchemist
('alchemist-t1-a','alchemist',1,1,'Steady Hand','You never spoil a potion or brew.'),
('alchemist-t1-b','alchemist',1,2,'Bitter Palate','Poisons deal 50% less damage to you.'),
('alchemist-t2-a','alchemist',2,1,'Flask Bomb','Throw a vial for splash damage once per fight.'),
('alchemist-t2-b','alchemist',2,2,'Elixir Sense','You know the effect of any unknown liquid by smell.'),
('alchemist-t3-a','alchemist',3,1,'Panacea','Consuming a potion clears one negative status.'),
('alchemist-t3-b','alchemist',3,2,'Distilled Ruin','Your thrown vials apply corrosion — targets lose armor.'),
('alchemist-t4-a','alchemist',4,1,'Philosopher''s Stone','Once per day, transmute a common item into gold.'),
('alchemist-t4-b','alchemist',4,2,'Plaguebearer','Enemies who strike you in melee are poisoned.'),
-- Necromancer
('necromancer-t1-a','necromancer',1,1,'Grave Sight','You can see how a corpse died and who killed it.'),
('necromancer-t1-b','necromancer',1,2,'Bone-Ward','You take -1 damage from undead of all kinds.'),
('necromancer-t2-a','necromancer',2,1,'Raise Shade','Raise a slain enemy as a shade for one fight, once per day.'),
('necromancer-t2-b','necromancer',2,2,'Whispered Debt','You learn one hidden truth from a slain NPC.'),
('necromancer-t3-a','necromancer',3,1,'Life Tap','Drain HP from an enemy on hit, small amount.'),
('necromancer-t3-b','necromancer',3,2,'Death''s Fluent','You may parley with undead as if they were NPCs.'),
('necromancer-t4-a','necromancer',4,1,'Lich Seed','If killed, you rise the next dawn at your death room. Once per week.'),
('necromancer-t4-b','necromancer',4,2,'Soulbinder','Bind a specific fallen ally as a permanent companion.'),
-- Runewright
('runewright-t1-a','runewright',1,1,'Clean Line','Your rune tracing tolerance is looser — score +10.'),
('runewright-t1-b','runewright',1,2,'Etcher''s Eye','You see inscribed sigils on any surface, even worn ones.'),
('runewright-t2-a','runewright',2,1,'Sigil Cache','Pre-draw one rune before combat; cast it for free.'),
('runewright-t2-b','runewright',2,2,'Ink of the Long Road','Runes drawn in the field last twice as long.'),
('runewright-t3-a','runewright',3,1,'Compound Grasp','Kanji compound tracing tolerance is looser — score +10.'),
('runewright-t3-b','runewright',3,2,'Warding Circle','Draw a circle on the floor: enemies who enter take small damage for one fight.'),
('runewright-t4-a','runewright',4,1,'Glyph-Thought','Once per day, cast any known rune with no trace at all.'),
('runewright-t4-b','runewright',4,2,'Stonespeaker','You may command any inscribed stone or door you can read.');
