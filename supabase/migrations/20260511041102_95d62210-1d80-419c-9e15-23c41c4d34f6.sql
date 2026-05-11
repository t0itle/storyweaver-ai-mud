
CREATE TABLE IF NOT EXISTS public.npc_service_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id uuid NOT NULL,
  user_id uuid NOT NULL,
  service_key text NOT NULL,
  price_gold integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  used_at timestamptz
);
ALTER TABLE public.npc_service_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own offers readable" ON public.npc_service_offers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_npc_service_offers_lookup
  ON public.npc_service_offers(user_id, npc_id, service_key, expires_at);
