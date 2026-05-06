
-- Journal entries
CREATE TABLE public.player_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  room TEXT,
  source_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_journal_user_time ON public.player_journal_entries (user_id, created_at DESC);
ALTER TABLE public.player_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal readable" ON public.player_journal_entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own journal writable" ON public.player_journal_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Lesser rune word/symbol knowledge
CREATE TABLE public.player_lesser_rune_knowledge (
  user_id UUID NOT NULL,
  rune_key TEXT NOT NULL REFERENCES public.lesser_runes(key) ON DELETE CASCADE,
  knows_word BOOLEAN NOT NULL DEFAULT false,
  knows_symbol BOOLEAN NOT NULL DEFAULT false,
  learned_word_at TIMESTAMPTZ,
  learned_symbol_at TIMESTAMPTZ,
  word_source TEXT,
  PRIMARY KEY (user_id, rune_key)
);
ALTER TABLE public.player_lesser_rune_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own knowledge readable" ON public.player_lesser_rune_knowledge
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Auto-journal trigger function
CREATE OR REPLACE FUNCTION public.write_journal_from_world_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jtitle TEXT;
  jbody TEXT;
BEGIN
  IF NEW.actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.kind
    WHEN 'npc_killed' THEN
      jtitle := 'A life ended by my hand';
      jbody := 'I struck down ' || COALESCE(NEW.target_name, 'a stranger')
        || COALESCE(' at ' || NEW.room, '') || '. The deed is mine to carry.';
    WHEN 'rune_cast' THEN
      jtitle := 'I traced a lesser rune';
      jbody := 'The glyph **' || COALESCE(NEW.details->>'rune', 'a sigil')
        || '** answered my hand (' || COALESCE(NEW.details->>'score', '?') || '%).';
    WHEN 'rune_backfire' THEN
      jtitle := 'A sigil turned on me';
      jbody := 'I tried to weave **' || COALESCE(NEW.details->>'rune', 'a glyph')
        || '** but my stroke was crooked. The unspoken bit back.';
    WHEN 'rune_word_learned' THEN
      jtitle := 'A new word in my mouth';
      jbody := 'I have learned the word **' || COALESCE(NEW.details->>'rune', '?')
        || '** — ' || COALESCE(NEW.details->>'meaning', '') || '. Now I must find its shape.';
    WHEN 'rune_symbol_learned' THEN
      jtitle := 'The shape revealed itself';
      jbody := 'My hand has finally remembered the sigil of **' || COALESCE(NEW.details->>'rune', '?') || '**. I can call upon it now.';
    WHEN 'blessing_received' THEN
      jtitle := 'A Blessing was granted to me';
      jbody := 'I received the Blessing of **' || COALESCE(NEW.details->>'blessing', '?') || '**. Few will ever know its weight.';
    WHEN 'lore_discovered' THEN
      jtitle := 'A truth uncovered';
      jbody := 'I have come to know of **' || COALESCE(NEW.details->>'title', NEW.target_name, '?') || '**.';
    WHEN 'aether_aligned' THEN
      jtitle := 'I bent my knee to an Aether';
      jbody := 'I aligned myself with **' || COALESCE(NEW.details->>'aether', '?') || '**. The world looks different now.';
    WHEN 'died' THEN
      jtitle := 'I fell into the dark';
      jbody := 'Death took me' || COALESCE(' at ' || NEW.room, '') || '. I came back, but something was left behind.';
    WHEN 'discovered_room' THEN
      jtitle := 'A new place';
      jbody := 'I set foot in **' || COALESCE(NEW.target_name, NEW.room, 'somewhere new') || '** for the first time.';
    ELSE
      RETURN NEW; -- skip noisy or unhandled kinds
  END CASE;

  INSERT INTO public.player_journal_entries (user_id, kind, title, body, room, source_event_id)
  VALUES (NEW.actor_id, NEW.kind, jtitle, jbody, NEW.room, NEW.id);

  RETURN NEW;
END $$;

CREATE TRIGGER world_events_to_journal
AFTER INSERT ON public.world_events
FOR EACH ROW
EXECUTE FUNCTION public.write_journal_from_world_event();
