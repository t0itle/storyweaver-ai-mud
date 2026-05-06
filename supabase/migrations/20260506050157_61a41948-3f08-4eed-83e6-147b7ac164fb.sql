
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hall_refusals integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chaos_pressure integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS non_serviam_at timestamptz;

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
    WHEN 'aethers_refused' THEN
      jtitle := 'I walked away from the basin';
      jbody := 'I stood in the Hall of the Seven and chose none of them. The silence followed me out.';
    WHEN 'non_serviam_declared' THEN
      jtitle := 'Non Serviam';
      jbody := 'I spoke the words. **Non Serviam.** The air bent around me. I serve no Aether now — the Speaker''s wardens will know my name as a curse.';
    WHEN 'chaos_aligned' THEN
      jtitle := 'I turned to Chaos';
      jbody := 'I forsook the seven and bound myself to **Chaos**. The wardens will know me by a different name now.';
    WHEN 'dragon_stirs' THEN
      jtitle := 'A dragon has stirred';
      jbody := 'My hoard glittered too brightly. **' || COALESCE(NEW.target_name, 'A dragon') || '** has caught the scent' || COALESCE(' near ' || NEW.room, '') || '.';
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
