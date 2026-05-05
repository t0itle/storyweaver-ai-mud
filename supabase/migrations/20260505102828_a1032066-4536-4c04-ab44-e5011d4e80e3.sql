ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS addressed_to uuid;
CREATE INDEX IF NOT EXISTS idx_messages_addressed_to ON public.messages(addressed_to);