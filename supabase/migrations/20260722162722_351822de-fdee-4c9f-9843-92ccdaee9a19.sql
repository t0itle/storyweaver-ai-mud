CREATE TABLE public.town_bank_item_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  town_key text NOT NULL REFERENCES public.towns(key) ON DELETE CASCADE,
  item_key text NOT NULL REFERENCES public.items(key) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  stolen boolean NOT NULL DEFAULT false,
  deposited_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.town_bank_item_vault TO authenticated;
GRANT ALL ON public.town_bank_item_vault TO service_role;
ALTER TABLE public.town_bank_item_vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vault readable" ON public.town_bank_item_vault
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_bank_vault_user_town ON public.town_bank_item_vault(user_id, town_key);