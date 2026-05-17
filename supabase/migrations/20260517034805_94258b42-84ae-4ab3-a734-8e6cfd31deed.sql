
ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS str integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS dex integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS con integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_armor integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.npc_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id uuid NOT NULL REFERENCES public.npcs(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  equipped_slot text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npc_items_npc ON public.npc_items(npc_id);
ALTER TABLE public.npc_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc items readable" ON public.npc_items FOR SELECT TO authenticated USING (true);
