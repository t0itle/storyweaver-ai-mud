CREATE TABLE public.npc_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id uuid NOT NULL,
  user_id uuid NOT NULL,
  summary text NOT NULL,
  emotion text,
  importance int NOT NULL DEFAULT 2,
  room text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_npc_memories_lookup ON public.npc_memories (npc_id, user_id, created_at DESC);
ALTER TABLE public.npc_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read memories about them" ON public.npc_memories
  FOR SELECT TO authenticated USING (auth.uid() = user_id);