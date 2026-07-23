
-- === Lifeskills, Gathering, Crafting ===

-- 1) Extend item slot validator to accept new lifeskill slots
CREATE OR REPLACE FUNCTION public.validate_item_slot()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.slot NOT IN ('head','neck','body','legs','feet','main_hand','off_hand','ring','container','consumable','focus','misc','material','tool','food','potion') THEN
    RAISE EXCEPTION 'Invalid item slot: %', NEW.slot;
  END IF;
  RETURN NEW;
END $$;

-- 2) player_lifeskills
CREATE TABLE public.player_lifeskills (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill text NOT NULL CHECK (skill IN ('foraging','mining','fishing','cooking','alchemy','smithing')),
  level int NOT NULL DEFAULT 1,
  xp int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill)
);
GRANT SELECT ON public.player_lifeskills TO authenticated;
GRANT ALL ON public.player_lifeskills TO service_role;
ALTER TABLE public.player_lifeskills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lifeskills read" ON public.player_lifeskills FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3) resource_nodes
CREATE TABLE public.resource_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('herbs','wood','ore','gems','fish','salt','mushrooms')),
  skill text NOT NULL CHECK (skill IN ('foraging','mining','fishing')),
  yields jsonb NOT NULL,       -- [{"item":"herb_starleaf","weight":3,"qty":[1,2]}]
  requires_tool text,           -- item key
  respawn_seconds int NOT NULL DEFAULT 900,
  depleted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.resource_nodes(room_slug);
GRANT SELECT ON public.resource_nodes TO authenticated;
GRANT ALL ON public.resource_nodes TO service_role;
ALTER TABLE public.resource_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nodes read all" ON public.resource_nodes FOR SELECT TO authenticated USING (true);

-- 4) crafting_stations
CREATE TABLE public.crafting_stations (
  key text PRIMARY KEY,
  room_slug text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('kitchen','alchemy_bench','forge')),
  name text NOT NULL,
  description text
);
CREATE INDEX ON public.crafting_stations(room_slug);
GRANT SELECT ON public.crafting_stations TO authenticated;
GRANT ALL ON public.crafting_stations TO service_role;
ALTER TABLE public.crafting_stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stations read all" ON public.crafting_stations FOR SELECT TO authenticated USING (true);

-- 5) recipes
CREATE TABLE public.recipes (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  skill text NOT NULL CHECK (skill IN ('cooking','alchemy','smithing')),
  station_kind text NOT NULL CHECK (station_kind IN ('kitchen','alchemy_bench','forge')),
  level_req int NOT NULL DEFAULT 1,
  inputs jsonb NOT NULL,      -- [{"item":"iron_ore","qty":2}]
  output_item text NOT NULL,
  output_qty int NOT NULL DEFAULT 1,
  xp_reward int NOT NULL DEFAULT 10,
  starter boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipes read all" ON public.recipes FOR SELECT TO authenticated USING (true);

-- 6) player_recipes
CREATE TABLE public.player_recipes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_key text NOT NULL REFERENCES public.recipes(key) ON DELETE CASCADE,
  learned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_key)
);
GRANT SELECT ON public.player_recipes TO authenticated;
GRANT ALL ON public.player_recipes TO service_role;
ALTER TABLE public.player_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recipes read" ON public.player_recipes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 7) player_buffs
CREATE TABLE public.player_buffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text,               -- 'food' | 'potion'
  effect jsonb NOT NULL,      -- {"hp_regen":1,"atk":2}
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.player_buffs(user_id, expires_at);
GRANT SELECT ON public.player_buffs TO authenticated;
GRANT ALL ON public.player_buffs TO service_role;
ALTER TABLE public.player_buffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own buffs read" ON public.player_buffs FOR SELECT TO authenticated USING (auth.uid() = user_id);
