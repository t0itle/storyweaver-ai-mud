
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  giver_npc_id uuid NOT NULL,
  giver_npc_name text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'offered',
  severity text NOT NULL DEFAULT 'minor',
  kind text NOT NULL DEFAULT 'favor',
  target_kind text,
  target_ref text,
  reward_gold integer NOT NULL DEFAULT 0,
  reward_xp integer NOT NULL DEFAULT 0,
  reward_amity integer NOT NULL DEFAULT 0,
  reward_item_key text,
  reward_rune_key text,
  reward_kanji_key text,
  offered_room text,
  accepted_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quests_user_status ON public.quests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quests_giver_user ON public.quests(giver_npc_id, user_id, status);

ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own quests readable" ON public.quests;
DROP POLICY IF EXISTS "own quests updatable" ON public.quests;
CREATE POLICY "own quests readable" ON public.quests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own quests updatable" ON public.quests
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS quests_set_updated ON public.quests;
CREATE TRIGGER quests_set_updated
  BEFORE UPDATE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.quest_reward_caps(_severity text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _severity
    WHEN 'trivial'   THEN '{"gold_max":5,"xp_max":15,"amity_max":3,"item":false,"knowledge":false}'::jsonb
    WHEN 'minor'     THEN '{"gold_max":20,"xp_max":40,"amity_max":6,"item":true,"knowledge":false}'::jsonb
    WHEN 'standard'  THEN '{"gold_max":60,"xp_max":100,"amity_max":10,"item":true,"knowledge":true}'::jsonb
    WHEN 'major'     THEN '{"gold_max":200,"xp_max":250,"amity_max":20,"item":true,"knowledge":true}'::jsonb
    WHEN 'legendary' THEN '{"gold_max":600,"xp_max":600,"amity_max":40,"item":true,"knowledge":true}'::jsonb
    ELSE '{"gold_max":20,"xp_max":40,"amity_max":6,"item":true,"knowledge":false}'::jsonb
  END
$$;

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
