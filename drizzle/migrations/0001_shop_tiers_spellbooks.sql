ALTER TABLE public.items ADD COLUMN IF NOT EXISTS teaches_rune text REFERENCES public.runes(key) ON DELETE SET NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS tier smallint NOT NULL DEFAULT 1;