
-- ============ Greater Runes (Kanji) schema ============

CREATE TABLE public.kanji_runes (
  key TEXT PRIMARY KEY,
  kanji TEXT NOT NULL,                  -- the actual character, e.g. 火
  romaji TEXT NOT NULL,                 -- e.g. "hi" or "ka"
  english_meaning TEXT NOT NULL,        -- "fire"
  element TEXT NOT NULL DEFAULT 'neutral', -- fire/water/earth/wind/light/shadow/life/death/mind/metal/void/time/etc
  description TEXT NOT NULL DEFAULT '',
  template JSONB NOT NULL DEFAULT '[]'::jsonb,  -- simplified unistroke [[x,y],...]
  difficulty INTEGER NOT NULL DEFAULT 1,
  rarity TEXT NOT NULL DEFAULT 'common',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kanji_runes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kanji runes readable" ON public.kanji_runes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.kanji_compounds (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  components TEXT[] NOT NULL,           -- ordered array of kanji_runes.key
  english_meaning TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  effect JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { type: 'damage'|'heal'|'buff'|'utility', power: int, ... }
  rarity TEXT NOT NULL DEFAULT 'common',
  lore_hint TEXT,                       -- optional hint shown when discovered
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kanji_compounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kanji compounds readable" ON public.kanji_compounds FOR SELECT TO authenticated USING (true);

CREATE TABLE public.player_kanji_knowledge (
  user_id UUID NOT NULL,
  kanji_key TEXT NOT NULL REFERENCES public.kanji_runes(key) ON DELETE CASCADE,
  knows_meaning BOOLEAN NOT NULL DEFAULT false,
  knows_stroke BOOLEAN NOT NULL DEFAULT false,
  learned_meaning_at TIMESTAMPTZ,
  learned_stroke_at TIMESTAMPTZ,
  meaning_source TEXT,
  PRIMARY KEY (user_id, kanji_key)
);
ALTER TABLE public.player_kanji_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own kanji knowledge readable" ON public.player_kanji_knowledge FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.player_kanji_compound_discoveries (
  user_id UUID NOT NULL,
  compound_key TEXT NOT NULL REFERENCES public.kanji_compounds(key) ON DELETE CASCADE,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'experimentation',
  PRIMARY KEY (user_id, compound_key)
);
ALTER TABLE public.player_kanji_compound_discoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own compound discoveries readable" ON public.player_kanji_compound_discoveries FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.player_kanji_mastery (
  user_id UUID NOT NULL,
  kanji_key TEXT NOT NULL REFERENCES public.kanji_runes(key) ON DELETE CASCADE,
  best_score NUMERIC NOT NULL DEFAULT 0,
  cast_count INTEGER NOT NULL DEFAULT 0,
  backfire_count INTEGER NOT NULL DEFAULT 0,
  first_cast_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kanji_key)
);
ALTER TABLE public.player_kanji_mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own kanji mastery readable" ON public.player_kanji_mastery FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Extend the journal trigger to handle kanji events
CREATE OR REPLACE FUNCTION public.write_journal_from_world_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE jtitle TEXT; jbody TEXT;
BEGIN
  IF NEW.actor_id IS NULL THEN RETURN NEW; END IF;
  CASE NEW.kind
    WHEN 'npc_killed' THEN
      jtitle := 'A life ended by my hand';
      jbody := 'I struck down ' || COALESCE(NEW.target_name, 'a stranger') || COALESCE(' at ' || NEW.room, '') || '. The deed is mine to carry.';
    WHEN 'rune_cast' THEN
      jtitle := 'I traced a lesser rune';
      jbody := 'The glyph **' || COALESCE(NEW.details->>'rune', 'a sigil') || '** answered my hand (' || COALESCE(NEW.details->>'score', '?') || '%).';
    WHEN 'rune_backfire' THEN
      jtitle := 'A sigil turned on me';
      jbody := 'I tried to weave **' || COALESCE(NEW.details->>'rune', 'a glyph') || '** but my stroke was crooked. The unspoken bit back.';
    WHEN 'rune_word_learned' THEN
      jtitle := 'A new word in my mouth';
      jbody := 'I have learned the word **' || COALESCE(NEW.details->>'rune', '?') || '** — ' || COALESCE(NEW.details->>'meaning', '') || '. Now I must find its shape.';
    WHEN 'rune_symbol_learned' THEN
      jtitle := 'The shape revealed itself';
      jbody := 'My hand has finally remembered the sigil of **' || COALESCE(NEW.details->>'rune', '?') || '**. I can call upon it now.';
    WHEN 'kanji_meaning_learned' THEN
      jtitle := 'A foreign character takes meaning';
      jbody := 'I have come to understand **' || COALESCE(NEW.details->>'kanji', '?') || '** (' || COALESCE(NEW.details->>'meaning', '') || '). Its shape still eludes my hand.';
    WHEN 'kanji_stroke_learned' THEN
      jtitle := 'My hand remembers the stroke';
      jbody := 'I traced **' || COALESCE(NEW.details->>'kanji', '?') || '** true for the first time. It is mine to weave now.';
    WHEN 'compound_discovered' THEN
      jtitle := 'A pattern revealed itself';
      jbody := 'By weaving **' || COALESCE(NEW.details->>'components', '?') || '** in sequence I uncovered **' || COALESCE(NEW.details->>'compound', '?') || '**. Few will know this.';
    WHEN 'compound_cast' THEN
      jtitle := 'I wove a Greater Rune';
      jbody := 'I called **' || COALESCE(NEW.details->>'compound', '?') || '** into being.';
    WHEN 'compound_backfire' THEN
      jtitle := 'The compound unraveled';
      jbody := 'I tried to bind **' || COALESCE(NEW.details->>'components', '?') || '** but the strokes did not hold. The weave bit back.';
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
    ELSE RETURN NEW;
  END CASE;
  INSERT INTO public.player_journal_entries (user_id, kind, title, body, room, source_event_id)
  VALUES (NEW.actor_id, NEW.kind, jtitle, jbody, NEW.room, NEW.id);
  RETURN NEW;
END $function$;
