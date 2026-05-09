-- Merchant flags on existing npcs
ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS is_merchant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merchant_town text,
  ADD COLUMN IF NOT EXISTS merchant_categories text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_npcs_merchant_room ON public.npcs(room) WHERE is_merchant = true;

-- Catalog of tradable goods
CREATE TABLE IF NOT EXISTS public.trade_goods (
  item_key text PRIMARY KEY,
  category text NOT NULL,
  origin_town_key text NOT NULL,
  base_price integer NOT NULL,
  demand_phase numeric NOT NULL DEFAULT 0,
  blurb text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_trade_goods_origin ON public.trade_goods(origin_town_key);
CREATE INDEX IF NOT EXISTS idx_trade_goods_cat ON public.trade_goods(category);

ALTER TABLE public.trade_goods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade goods readable" ON public.trade_goods FOR SELECT TO authenticated USING (true);

-- Time-bound market shocks
CREATE TABLE IF NOT EXISTS public.market_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  town_key text,           -- NULL = global
  category text,           -- NULL = any category
  item_key text,           -- NULL = any item
  multiplier numeric NOT NULL DEFAULT 1.0,
  source text NOT NULL DEFAULT 'event',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours')
);
CREATE INDEX IF NOT EXISTS idx_market_events_active ON public.market_events(expires_at);
CREATE INDEX IF NOT EXISTS idx_market_events_town ON public.market_events(town_key);

ALTER TABLE public.market_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market events readable" ON public.market_events FOR SELECT TO authenticated USING (true);

-- React to world events with price shocks
CREATE OR REPLACE FUNCTION public.react_market_to_world_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind = 'aether_fell' THEN
    INSERT INTO public.market_events(town_key, category, multiplier, source, reason, expires_at)
    VALUES
      (NULL, 'luxury', 0.6, 'aether_fell', 'An Aether has fallen — luxuries lose their lustre.', now() + interval '24 hours'),
      (NULL, 'arms',   1.5, 'aether_fell', 'An Aether has fallen — arms double in price.',        now() + interval '24 hours'),
      (NULL, 'relic',  1.8, 'aether_fell', 'Relics of the dead Aether spike on every counter.',   now() + interval '48 hours');
  ELSIF NEW.kind = 'dragon_stirs' THEN
    INSERT INTO public.market_events(town_key, category, multiplier, source, reason, expires_at)
    VALUES
      (NULL, 'spice', 2.0, 'dragon_stirs', 'A dragon stirs — spice routes choke.',  now() + interval '6 hours'),
      (NULL, 'gem',   0.7, 'dragon_stirs', 'Hoard rumors flood the gem markets.',   now() + interval '6 hours');
  ELSIF NEW.kind = 'npc_killed' THEN
    INSERT INTO public.market_events(town_key, category, multiplier, source, reason, expires_at)
    SELECT r.town_key, 'staple', 1.2, 'unrest', 'Local unrest — staples climb.', now() + interval '3 hours'
      FROM public.npcs n
      JOIN public.rooms r ON r.slug = n.home_room
     WHERE n.id = NEW.target_id AND r.town_key IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS market_react_to_world ON public.world_events;
CREATE TRIGGER market_react_to_world
AFTER INSERT ON public.world_events
FOR EACH ROW EXECUTE FUNCTION public.react_market_to_world_event();