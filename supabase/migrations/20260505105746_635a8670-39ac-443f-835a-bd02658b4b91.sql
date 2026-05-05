CREATE TABLE public.npc_amity (
  npc_id uuid NOT NULL,
  user_id uuid NOT NULL,
  score int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (npc_id, user_id)
);
ALTER TABLE public.npc_amity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read own amity" ON public.npc_amity
  FOR SELECT TO authenticated USING (auth.uid() = user_id);