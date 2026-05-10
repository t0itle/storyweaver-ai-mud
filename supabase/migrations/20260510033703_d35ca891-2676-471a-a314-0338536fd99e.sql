ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS infamy integer NOT NULL DEFAULT 0;
ALTER TABLE public.player_items ADD COLUMN IF NOT EXISTS stolen boolean NOT NULL DEFAULT false;
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS is_fence boolean NOT NULL DEFAULT false;
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS fence_rate numeric NOT NULL DEFAULT 0.55;
CREATE INDEX IF NOT EXISTS idx_player_items_stolen ON public.player_items(user_id) WHERE stolen = true;
CREATE INDEX IF NOT EXISTS idx_npcs_fence_room ON public.npcs(room) WHERE is_fence = true;