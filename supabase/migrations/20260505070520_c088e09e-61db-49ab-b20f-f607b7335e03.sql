
-- profiles: carry capacity
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_weight numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS in_combat_id uuid;

-- ITEM CATALOG
CREATE TABLE public.items (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  slot text NOT NULL DEFAULT 'misc', -- weapon | armor | focus | container | consumable | misc
  weight numeric NOT NULL DEFAULT 1,
  stackable boolean NOT NULL DEFAULT false,
  max_stack int NOT NULL DEFAULT 1,
  base_damage int NOT NULL DEFAULT 0,
  base_armor int NOT NULL DEFAULT 0,
  rune_slots int NOT NULL DEFAULT 0,
  capacity_weight numeric NOT NULL DEFAULT 0, -- for containers
  heal_amount int NOT NULL DEFAULT 0, -- for consumables
  value int NOT NULL DEFAULT 0
);
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items readable" ON public.items FOR SELECT TO authenticated USING (true);

-- RUNE CATALOG
CREATE TABLE public.runes (
  key text PRIMARY KEY,
  name text NOT NULL,
  glyph text NOT NULL DEFAULT '✶',
  kind text NOT NULL DEFAULT 'passive', -- passive | active
  description text NOT NULL DEFAULT '',
  effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- effect shapes:
  --   passive: {type:'damage_bonus',value:2} | {type:'armor_bonus',value:1} | {type:'max_hp',value:5}
  --   active : {type:'fire_bolt',damage:8,target:'enemy'} | {type:'mend',heal:10,target:'self'}
  max_charges int NOT NULL DEFAULT 0, -- for active runes when woven
  lore_slug text, -- if set, learned by discovering this lore
  teacher_npc uuid, -- if set, this NPC can teach it
  rarity text NOT NULL DEFAULT 'common'
);
ALTER TABLE public.runes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "runes readable" ON public.runes FOR SELECT TO authenticated USING (true);

-- PLAYER INVENTORY
CREATE TABLE public.player_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_key text NOT NULL REFERENCES public.items(key),
  quantity int NOT NULL DEFAULT 1,
  container_id uuid REFERENCES public.player_items(id) ON DELETE SET NULL,
  equipped_slot text, -- weapon | armor | focus | offhand
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_player_items_user ON public.player_items(user_id);
ALTER TABLE public.player_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own items readable" ON public.player_items FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- PLAYER LEARNED RUNES
CREATE TABLE public.player_runes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rune_key text NOT NULL REFERENCES public.runes(key),
  source text NOT NULL DEFAULT 'unknown',
  learned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, rune_key)
);
ALTER TABLE public.player_runes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runes readable" ON public.player_runes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ITEM-WOVEN RUNES
CREATE TABLE public.item_runes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_item_id uuid NOT NULL REFERENCES public.player_items(id) ON DELETE CASCADE,
  rune_key text NOT NULL REFERENCES public.runes(key),
  charges int NOT NULL DEFAULT 0,
  max_charges int NOT NULL DEFAULT 0,
  woven_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_item_runes_item ON public.item_runes(player_item_id);
ALTER TABLE public.item_runes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own woven runes readable" ON public.item_runes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.player_items pi WHERE pi.id = item_runes.player_item_id AND pi.user_id = auth.uid())
);

-- COMBAT
CREATE TABLE public.combats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room text NOT NULL,
  status text NOT NULL DEFAULT 'active', -- active | ended
  turn_number int NOT NULL DEFAULT 1,
  current_combatant_id uuid,
  winner_side text,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
ALTER TABLE public.combats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "combats readable" ON public.combats FOR SELECT TO authenticated USING (true);

CREATE TABLE public.combatants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combat_id uuid NOT NULL REFERENCES public.combats(id) ON DELETE CASCADE,
  side text NOT NULL, -- 'a' or 'b'
  kind text NOT NULL, -- 'player' | 'npc'
  user_id uuid,
  npc_id uuid,
  name text NOT NULL,
  hp int NOT NULL,
  max_hp int NOT NULL,
  initiative int NOT NULL DEFAULT 0,
  defending boolean NOT NULL DEFAULT false,
  defeated boolean NOT NULL DEFAULT false,
  turn_order int NOT NULL DEFAULT 0
);
CREATE INDEX idx_combatants_combat ON public.combatants(combat_id);
ALTER TABLE public.combatants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "combatants readable" ON public.combatants FOR SELECT TO authenticated USING (true);

CREATE TABLE public.combat_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combat_id uuid NOT NULL REFERENCES public.combats(id) ON DELETE CASCADE,
  turn_number int NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL,
  action text NOT NULL, -- attack | defend | cast | flee | npc-turn | system
  target_name text,
  text text NOT NULL,
  damage int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_combat_actions_combat ON public.combat_actions(combat_id, created_at);
ALTER TABLE public.combat_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "combat actions readable" ON public.combat_actions FOR SELECT TO authenticated USING (true);

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.combats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.combatants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_runes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.item_runes;
