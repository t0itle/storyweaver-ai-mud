-- Faction column on profiles (chaos vs aether vs neutral)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS faction text;

-- Dragons: dying lords of time, attracted to gold hoards
CREATE TABLE IF NOT EXISTS public.dragons (
  key text PRIMARY KEY,
  name text NOT NULL,
  epithet text NOT NULL DEFAULT '',
  personality text NOT NULL DEFAULT '',
  current_room text,
  hoard_target_room text,
  last_woken_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dragons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dragons readable" ON public.dragons FOR SELECT TO authenticated USING (true);

-- New rooms: wilderness + desert routes + a hidden roost
INSERT INTO public.rooms (slug, name, label, kind, description, ambience, exits) VALUES
('wilderness-edge','The Kingdoms'' Edge','Frontier','wilds',
 'The cobbled roads of the Crescent Kingdoms fray here into rutted tracks. Beyond the last warden-stone the land does not answer to any of the seven Aethers — it is older, indifferent, and its silence has weight.',
 'Wind through long grass; no bells, no banners.',
 '{"back":"red-haze-road","north":"deep-wilds","south":"desert-verge"}'::jsonb),
('deep-wilds','The Deep Wilds','Wilds','wilds',
 'Trees lean at angles no Aether allowed. Runes traced in the dirt drift, then disagree with themselves. This is the world before order — neither cruel nor kind, only un-sworn.',
 'A hush as if the land is listening for a name no one remembers.',
 '{"back":"wilderness-edge"}'::jsonb),
('desert-verge','The Crescent Verge','Verge','desert',
 'The grass dies in three steps and the dunes begin. South lies the long caravan road; far past it, the white walls of the First City shimmer like a rumor.',
 'Heat-shimmer; the dry tick of cooling stone.',
 '{"back":"wilderness-edge","south":"caravan-road"}'::jsonb),
('caravan-road','The Caravan Road','Road','desert',
 'A trampled scar of dunes between two worlds — the Crescent Kingdoms behind, the First City ahead. Bones of pack-beasts mark the way; the Veiled know which to bow to.',
 'Bells of a far caravan; sand whispering under the wind.',
 '{"north":"desert-verge","south":"first-city-gate","west":"bone-dunes"}'::jsonb),
('bone-dunes','The Bone Dunes','Dunes','desert',
 'Past the First City the desert does not end. It only forgets you. White ribs of long-dead leviathans surface and sink as the dunes breathe.',
 'A sound like a slow, slow exhale, very far below.',
 '{"east":"caravan-road"}'::jsonb),
('dragon-roost','A Dragon''s Roost','Roost','lair',
 'Heat without fire. Gold so old it has forgotten what it was minted for. Above it all, something patient is watching you decide whether to step closer.',
 'A breath like a forge, slow and amused.',
 '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Wire neighboring rooms outward (only if exit doesn't already exist)
UPDATE public.rooms SET exits = exits || '{"out":"wilderness-edge"}'::jsonb
  WHERE slug = 'red-haze-road' AND NOT (exits ? 'out');
UPDATE public.rooms SET exits = exits || '{"wilds":"wilderness-edge"}'::jsonb
  WHERE slug = 'whispering-wastes' AND NOT (exits ? 'wilds');
UPDATE public.rooms SET exits = exits || '{"desert":"desert-verge"}'::jsonb
  WHERE slug = 'ash-road' AND NOT (exits ? 'desert');
UPDATE public.rooms SET exits = exits || '{"caravan":"caravan-road"}'::jsonb
  WHERE slug = 'first-city-gate' AND NOT (exits ? 'caravan');

-- Seed three named dragons
INSERT INTO public.dragons (key, name, epithet, personality) VALUES
('valdracoth','Valdracoth','the Mirror-Coiled',
 'Vain beyond reason. Speaks in long, beautiful sentences and considers gold a form of self-portraiture. Cruel only when bored.'),
('khessareth','Khessareth','the Hour-Eater',
 'Cold, regal, archival. Counts seconds aloud while it decides whether you are worth one. Believes the dying of its kind is simply the world running out of time.'),
('orvath','Orvath','the Sky-Tyrant',
 'Wrathful and direct. Speaks in single words when possible. Has never forgiven the Aethers for the order they imposed on the wild sky.')
ON CONFLICT (key) DO NOTHING;

-- Extend journal trigger with chaos_aligned and dragon_stirs cases
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