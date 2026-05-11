
CREATE TABLE IF NOT EXISTS public.npc_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id uuid NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  blurb text NOT NULL DEFAULT '',
  kind text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  price_gold integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (npc_id, key)
);

ALTER TABLE public.npc_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "npc services readable"
  ON public.npc_services FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_npc_services_npc ON public.npc_services(npc_id);

INSERT INTO public.npc_services (npc_id, key, name, blurb, kind, amount, price_gold) VALUES
  ('09cfd6a3-ef0b-45fa-bb80-25950674ff79','tend-scrape','Tend a Scrape','A poultice of senna root and crushed thyme — closes the smaller hurts.','heal_amount',15,2),
  ('09cfd6a3-ef0b-45fa-bb80-25950674ff79','bind-wounds','Bind Your Wounds','Quiet hands, a brewed draught, a long sit on the stool. You will rise whole.','heal_full',0,8),
  ('09cfd6a3-ef0b-45fa-bb80-25950674ff79','steady-the-blood','Steady the Blood','A bitter cordial against poison still humming in the veins.','cure_poison',0,12)
ON CONFLICT (npc_id, key) DO NOTHING;
