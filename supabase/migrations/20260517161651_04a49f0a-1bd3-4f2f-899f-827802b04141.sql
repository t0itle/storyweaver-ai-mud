ALTER TABLE public.trade_goods
  ADD CONSTRAINT trade_goods_item_key_fkey
  FOREIGN KEY (item_key) REFERENCES public.items(key) ON DELETE CASCADE;