-- Loot piles dropped in a room (from caches, NPC defeats, future drops)
CREATE TABLE IF NOT EXISTS public.room_loot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room text NOT NULL,
  gold integer NOT NULL DEFAULT 0,
  item_key text,
  quantity integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'unknown',
  placed_by_name text,
  placed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_loot_room ON public.room_loot(room);

ALTER TABLE public.room_loot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loot readable" ON public.room_loot
  FOR SELECT TO authenticated USING (true);

-- Add a coin purse to NPCs so steals have something to take.
ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS purse_gold integer NOT NULL DEFAULT 0;

-- Realtime so players see loot appear/disappear instantly.
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_loot;