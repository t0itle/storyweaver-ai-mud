
-- 1. Add an `is_guard` flag to npcs so the system can recognize town protectors.
ALTER TABLE public.npcs ADD COLUMN IF NOT EXISTS is_guard boolean NOT NULL DEFAULT false;

-- 2. Spawn 3 town guards per town in priority rooms (gate, square/throne, lane/well/inn).
DO $$
DECLARE
  t RECORD;
  r RECORD;
  picked text[];
  guard_names text[] := ARRAY['Brann','Helsa','Cor','Vesna','Doryn','Maela','Tilbar','Senna','Ohrid','Kestra','Marrik','Ylva','Pell','Joska','Aren','Berta','Hark','Niven','Sora','Wend','Tovar','Linna','Cardus','Esyl','Falk','Gretha','Hoyt','Idris','Jora','Kael','Lorca','Mira','Norven','Ossa','Pyr','Quill','Renn','Sef','Talia','Ulf','Vora','Wren','Xan','Yara'];
  gi int := 1;
BEGIN
  FOR t IN SELECT key, name FROM public.towns LOOP
    picked := ARRAY[]::text[];
    FOR r IN
      SELECT slug, name FROM public.rooms
       WHERE town_key = t.key
       ORDER BY CASE
         WHEN slug LIKE '%-gate'    THEN 1
         WHEN slug LIKE '%-square'  THEN 2
         WHEN slug LIKE '%-throne'  THEN 2
         WHEN slug LIKE '%-lane'    THEN 3
         WHEN slug LIKE '%-well'    THEN 4
         WHEN slug LIKE '%-inn'     THEN 5
         WHEN slug LIKE 'caravan-%' THEN 5
         ELSE 9 END,
         slug
       LIMIT 3
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.npcs n
         WHERE n.room = r.slug AND n.is_guard = true
      ) THEN
        INSERT INTO public.npcs (
          name, title, persona, room, home_room, greeting,
          is_guard, purse_gold, hidden, is_soul
        ) VALUES (
          guard_names[((gi-1) % array_length(guard_names,1)) + 1] || ' of ' || t.name,
          'Town Guard of ' || t.name,
          'A sworn protector of ' || t.name || '. Stands watch in ' || r.name || ' with mailed coat, short blade, and the town''s sigil at the shoulder. Calm in peace, terrible when the peace is broken.',
          r.slug, r.slug,
          'Move along, friend. Keep your hands where I can see them.',
          true, 12 + (gi % 8), false, false
        );
        gi := gi + 1;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 3. Trigger: when an NPC is killed, broadcast gossip into every other room of the same town.
CREATE OR REPLACE FUNCTION public.gossip_town_on_npc_killed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  victim_town text;
  victim_name text;
  victim_title text;
  killer_name text;
  victim_is_guard boolean;
  r RECORD;
  line text;
BEGIN
  IF NEW.kind <> 'npc_killed' OR NEW.target_id IS NULL THEN RETURN NEW; END IF;

  SELECT rm.town_key, n.name, n.title, n.is_guard
    INTO victim_town, victim_name, victim_title, victim_is_guard
    FROM public.npcs n
    JOIN public.rooms rm ON rm.slug = n.home_room
   WHERE n.id = NEW.target_id;

  IF victim_town IS NULL THEN RETURN NEW; END IF;

  killer_name := COALESCE(NEW.actor_name, 'a stranger');

  IF victim_is_guard THEN
    line := '✶ Word runs through the streets: a town guard, ' || victim_name || ', has been struck down by ' || killer_name || '. Doors bolt. Hands find hilts.';
  ELSE
    line := '✶ A rumor curls from doorway to doorway: ' || COALESCE(victim_name,'someone') || COALESCE(' (' || victim_title || ')','') || ' was killed by ' || killer_name || '. The name is spoken low, and remembered.';
  END IF;

  FOR r IN SELECT slug FROM public.rooms WHERE town_key = victim_town AND slug <> NEW.room LOOP
    INSERT INTO public.messages (room, user_id, author_name, kind, content)
    VALUES (r.slug, NULL, '—', 'system', line);
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gossip_town_on_npc_killed_trg ON public.world_events;
CREATE TRIGGER gossip_town_on_npc_killed_trg
AFTER INSERT ON public.world_events
FOR EACH ROW
EXECUTE FUNCTION public.gossip_town_on_npc_killed();
