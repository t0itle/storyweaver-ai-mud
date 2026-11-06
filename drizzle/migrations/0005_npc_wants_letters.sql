-- NPC agents phase 3: wants become quests on the town board, or letters to trusted players.

-- Board postings can be authored by an NPC (author_user_id is already nullable for this).
ALTER TABLE public.posted_quests
  ADD COLUMN IF NOT EXISTS author_npc_id uuid REFERENCES public.npcs(id) ON DELETE SET NULL;

-- A per-player inbox. NPCs (and, later, the Seven) write; the player reads and marks read.
CREATE TABLE IF NOT EXISTS public.player_letters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  from_npc_id uuid REFERENCES public.npcs(id) ON DELETE SET NULL,
  from_name   text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  quest_id    uuid,              -- an offered quest the letter asks the player to accept
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX IF NOT EXISTS player_letters_user_idx ON public.player_letters (user_id, created_at DESC);
ALTER TABLE public.player_letters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own letters readable" ON public.player_letters;
CREATE POLICY "own letters readable" ON public.player_letters
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own letters markable read" ON public.player_letters;
CREATE POLICY "own letters markable read" ON public.player_letters
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
