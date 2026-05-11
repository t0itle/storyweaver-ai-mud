-- ============================================================
-- Skill Tree: schema, seed nodes, talent points, level-up trigger
-- ============================================================

-- 1. Catalog of all nodes (immutable, seeded)
CREATE TABLE public.skill_nodes (
  key text PRIMARY KEY,
  branch text NOT NULL CHECK (branch IN ('steel','whisper','sigil')),
  tier int NOT NULL CHECK (tier BETWEEN 1 AND 4),
  sort_order int NOT NULL DEFAULT 0,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  effect jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.skill_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skill nodes readable" ON public.skill_nodes FOR SELECT TO authenticated USING (true);

-- 2. Per-player acquired nodes
CREATE TABLE public.player_skills (
  user_id uuid NOT NULL,
  node_key text NOT NULL REFERENCES public.skill_nodes(key) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, node_key)
);
ALTER TABLE public.player_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own skills readable" ON public.player_skills FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- writes go through `spend-talent` edge function (service role)

-- 3. Talent points on the profile
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS talent_points int NOT NULL DEFAULT 0;

-- 4. Update level-up trigger to also grant talent points
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
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Make sure the trigger exists (was implied earlier)
DROP TRIGGER IF EXISTS handle_profile_xp_change_trg ON public.profiles;
CREATE TRIGGER handle_profile_xp_change_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_xp_change();

-- 5. Seed the 24 nodes
INSERT INTO public.skill_nodes (key, branch, tier, sort_order, name, description, effect) VALUES
-- STEEL
('sure_footing',    'steel', 1, 1, 'Sure Footing',     'A small, retroactive nudge: +1 max HP for every level you''ve already earned (capped at +20).', '{"max_hp_per_level":1,"cap":20}'),
('patience_stone',  'steel', 1, 2, 'Patience of Stone','+1 to all damage you mitigate while defending.', '{"defend_bonus":1}'),
('long_wind',       'steel', 2, 3, 'Long Wind',        'Heal 1 extra HP each time you rest.', '{"rest_bonus":1}'),
('iron_edge',       'steel', 2, 4, 'Iron Edge',        '+1 weapon damage on the opening blow of any fight.', '{"opening_blow_bonus":1}'),
('mules_back',      'steel', 3, 5, 'Mule''s Back',     '+5 carry weight — your shoulders learn to lie.', '{"carry_bonus":5}'),
('second_strike',   'steel', 3, 6, 'Second Strike',    '10% chance any successful hit becomes a two-hit flurry.', '{"flurry_chance":0.10}'),
('wound_reading',   'steel', 3, 7, 'Wound-Reading',    'You see exact NPC HP in combat instead of a rough wound state.', '{"exact_hp":true}'),
('last_breath',     'steel', 4, 8, 'Last Breath',      'Once per real day, the killing blow that would drop you instead leaves you at 1 HP and ends the fight.', '{"daily_save":true}'),

-- WHISPER
('quick_tongue',    'whisper', 1, 1, 'Quick Tongue',   '+5 starting amity with any NPC the first time you speak to them.', '{"first_meet_amity":5}'),
('light_fingers',   'whisper', 1, 2, 'Light Fingers',  '+1 to your steal d20 rolls.', '{"steal_bonus":1}'),
('traders_eye',     'whisper', 2, 3, 'Trader''s Eye',  'Merchant base prices show beside their ask. You can never be cheated blind.', '{"see_base_price":true}'),
('coin_purse',      'whisper', 2, 4, 'Coin-Purse',     'Pickpocketed gold rounds up. A successful steal never returns 0.', '{"steal_min_gold":1,"round_up":true}'),
('ear_to_wall',     'whisper', 3, 5, 'Ear to the Wall','Gossip about you bleeds through amity 50% farther than it should.', '{"gossip_radius_mult":1.5}'),
('quiet_step',      'whisper', 3, 6, 'Quiet Step',     'Fences pay you 0.62 of value instead of 0.55.', '{"fence_rate":0.62}'),
('map_sense',       'whisper', 3, 7, 'Map-Sense',      'Wagonmasters charge you 20% less for fast travel.', '{"wagon_discount":0.20}'),
('names_in_dark',   'whisper', 4, 8, 'Names in the Dark','Your infamy fades twice as fast, and one open bounty per real day quietly expires at dawn.', '{"infamy_decay_mult":2,"daily_bounty_dismiss":true}'),

-- SIGIL
('steady_hand',     'sigil', 1, 1, 'Steady Hand',      '+5 to your trace score on any lesser rune.', '{"trace_bonus":5}'),
('open_ear',        'sigil', 1, 2, 'Open Ear',         'The first meaning of any new kanji is revealed for free, the moment you encounter it.', '{"free_kanji_meaning":true}'),
('deep_memory',     'sigil', 2, 3, 'Deep Memory',      'Runes you weave into items get +1 max charge.', '{"woven_charge_bonus":1}'),
('echo',            'sigil', 2, 4, 'Echo',             '10% chance a successful lesser-rune cast doesn''t consume its charge.', '{"echo_chance":0.10}'),
('true_stroke',     'sigil', 3, 5, 'True Stroke',      'Kanji backfire chance is halved.', '{"backfire_mult":0.5}'),
('four_stroke',     'sigil', 3, 6, 'Four-Stroke',      'Compound rune attempts get +1 component to the timing window.', '{"compound_window_bonus":1}'),
('quiet_mouth',     'sigil', 3, 7, 'Quiet Mouth',      'Speaker artifacts regain 1 charge per real day, up to one above their base.', '{"artifact_recharge_per_day":1}'),
('the_unspoken',    'sigil', 4, 8, 'The Unspoken',     'A 4th Greater Rune slot opens in your spellbook, and one undiscovered compound recipe surfaces in your mind.', '{"greater_rune_slot":1,"reveal_compound":1}');

-- 6. Backfill talent_points for existing characters who already leveled up
--    (so a level 7 player who installs this gets 6 pending points immediately).
UPDATE public.profiles
   SET talent_points = GREATEST(0, COALESCE(level,1) - 1)
 WHERE COALESCE(talent_points,0) = 0
   AND COALESCE(level,1) > 1;