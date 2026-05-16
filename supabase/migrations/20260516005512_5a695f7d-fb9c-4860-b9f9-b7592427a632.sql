
-- Catalog of Aether loyalty quest steps (7 per Aether)
CREATE TABLE IF NOT EXISTS public.aether_quest_steps (
  aether_key text NOT NULL,
  step_index integer NOT NULL,
  title text NOT NULL,
  objective text NOT NULL,
  flavor text NOT NULL DEFAULT '',
  themed_rune_key text,
  reward_gold integer NOT NULL DEFAULT 0,
  reward_xp integer NOT NULL DEFAULT 0,
  reward_merit integer NOT NULL DEFAULT 0,
  reward_artifact_key text,
  PRIMARY KEY (aether_key, step_index)
);
ALTER TABLE public.aether_quest_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aether quest steps readable"
  ON public.aether_quest_steps FOR SELECT TO authenticated USING (true);

-- Chaos path progress (one row per player)
CREATE TABLE IF NOT EXISTS public.chaos_path (
  user_id uuid PRIMARY KEY,
  step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  target_aether_key text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  last_advanced_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);
ALTER TABLE public.chaos_path ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chaos path readable"
  ON public.chaos_path FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Extend the existing journal trigger to log vow-step completions.
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
    WHEN 'aether_vow_step' THEN
      jtitle := 'A vow keeps me walking';
      jbody := 'I fulfilled **' || COALESCE(NEW.details->>'title', 'a charge') || '** in the name of **' || COALESCE(NEW.details->>'aether', '?') || '**. ' || COALESCE(NEW.details->>'flavor', '');
    WHEN 'aether_vow_complete' THEN
      jtitle := 'The Vow is sealed';
      jbody := 'I have walked the full chain of **' || COALESCE(NEW.details->>'aether', '?') || '**. I am Devout now. The Aether knows my name.';
    WHEN 'chaos_step' THEN
      jtitle := 'The unspoken thickens';
      jbody := 'I took another step down the chain of Refusal — **' || COALESCE(NEW.details->>'title', 'a deed') || '**. The world cracks where I tread.';
    WHEN 'chaos_complete' THEN
      jtitle := 'Crown of Refusal';
      jbody := 'The chain is finished. I wear no name the Aethers can call. **Non Serviam** is no longer a cry — it is a country I rule.';
    WHEN 'dragon_stirs' THEN
      jtitle := 'A dragon has stirred';
      jbody := 'My hoard glittered too brightly. **' || COALESCE(NEW.target_name, 'A dragon') || '** has caught the scent' || COALESCE(' near ' || NEW.room, '') || '.';
    WHEN 'died' THEN
      jtitle := 'I fell into the dark';
      jbody := 'Death took me' || COALESCE(' at ' || NEW.room, '') || '. I came back, but something was left behind.';
    WHEN 'discovered_room' THEN
      jtitle := 'A new place';
      jbody := 'I set foot in **' || COALESCE(NEW.target_name, NEW.room, 'somewhere new') || '** for the first time.';
    WHEN 'quest_accepted' THEN
      jtitle := 'A task taken up';
      jbody := COALESCE(NEW.details->>'giver', 'Someone') || ' has set me to **' || COALESCE(NEW.details->>'title', 'a task') || '**: ' || COALESCE(NEW.details->>'objective', '');
    WHEN 'quest_completed' THEN
      jtitle := 'A task fulfilled';
      jbody := 'I completed **' || COALESCE(NEW.details->>'title', 'the task') || '** for ' || COALESCE(NEW.details->>'giver', 'them') || '. ' || COALESCE(NEW.details->>'note', '');
    WHEN 'quest_failed' THEN
      jtitle := 'A task slipped through my hands';
      jbody := 'I failed **' || COALESCE(NEW.details->>'title', 'the task') || '**' || COALESCE(' for ' || (NEW.details->>'giver'), '') || '. ' || COALESCE(NEW.details->>'note', '');
    WHEN 'quest_abandoned' THEN
      jtitle := 'I walked away from a promise';
      jbody := 'I abandoned **' || COALESCE(NEW.details->>'title', 'a task') || '**. ' || COALESCE(NEW.details->>'giver', 'They') || ' will remember.';
    ELSE RETURN NEW;
  END CASE;
  INSERT INTO public.player_journal_entries (user_id, kind, title, body, room, source_event_id)
  VALUES (NEW.actor_id, NEW.kind, jtitle, jbody, NEW.room, NEW.id);
  RETURN NEW;
END $function$;
