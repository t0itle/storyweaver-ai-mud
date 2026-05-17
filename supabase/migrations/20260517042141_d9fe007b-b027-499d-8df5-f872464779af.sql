ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS hire_price_gold integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hire_no_trust boolean NOT NULL DEFAULT false;