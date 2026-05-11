CREATE TABLE public.npc_item_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id uuid NOT NULL,
  user_id uuid NOT NULL,
  item_key text NOT NULL,
  price_gold integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '2 hours'),
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.npc_item_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own item offers readable" ON public.npc_item_offers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_npc_item_offers_lookup
  ON public.npc_item_offers(npc_id, user_id, item_key) WHERE used_at IS NULL;