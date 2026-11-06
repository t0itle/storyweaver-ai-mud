-- Wardens (wiki: everbloom-lore/characters/wardens): each Aether is bound to 12 Wardens — people,
-- items or places. **An Aether lives while any one of its Wardens still stands.** When the last
-- falls, the Aether desynchronizes and falls.
--   person: a warden NPC; destroyed when slain (and does not return).
--   item:   a relic resting in a room; destroyed by `shatter` (warden-action, STR check).
--   place:  a sacred room; destroyed by `desecrate` (warden-action, WIS check).
-- Lore pages: everbloom-lore/characters/wardens-of-<aether>.md (src/test/wardens.test.ts keeps them in step).

CREATE TABLE IF NOT EXISTS public.wardens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aether_key    text NOT NULL REFERENCES public.aethers(key) ON DELETE CASCADE,
  warden_index  smallint NOT NULL CHECK (warden_index BETWEEN 1 AND 12),
  kind          text NOT NULL CHECK (kind IN ('person','item','place')),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  npc_id        uuid REFERENCES public.npcs(id) ON DELETE SET NULL,   -- person wardens
  room_slug     text,                                                 -- where an item rests / the place itself
  check_ability text CHECK (check_ability IN ('str','dex','con','int','wis','cha')),
  check_dc      smallint,
  destroyed_at  timestamptz,
  destroyed_by  uuid,
  destroyed_by_name text,
  UNIQUE (aether_key, warden_index)
);
CREATE INDEX IF NOT EXISTS wardens_standing_idx ON public.wardens (aether_key) WHERE destroyed_at IS NULL;
ALTER TABLE public.wardens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wardens readable" ON public.wardens;
CREATE POLICY "wardens readable" ON public.wardens FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------- item and place wardens
-- One relic and one sacred place per Aether. The person who held that post stays on as its keeper
-- (no longer a warden), so each Aether keeps 12: 10 people, 1 item, 1 place.
DROP TABLE IF EXISTS _wv;
CREATE TEMP TABLE _wv (aether_key text, idx smallint, kind text, name text, description text,
                       room text, ability text, dc smallint, keeper_title text);
INSERT INTO _wv VALUES
  ('solastin', 3, 'item',  'The Oathstone of Illumination', 'A crystalline monolith said to be a primordial shard of pure light, gifted by Solastin. Oaths sworn on it bind; lies spoken before it are met with silence or a blinding flash.', 'oratory-of-flame', 'str', 18, 'Keeper of the Oathstone'),
  ('solastin', 4, 'place', 'The Penitents'' Stair',         'The stair the Beacon counts, step by step, each dawn. Every footfall of humility laid here holds up Solastin''s light.', 'penitents-stair', 'wis', 18, 'Penitent of the Stair'),
  ('khalvaris',4, 'item',  'Verity, the Scales',             'The Scales of Khalvaris. Every verdict in the Bastion is weighed on them; while they balance, the Judge endures.', 'dueling-pit', 'str', 18, 'Pit-Master'),
  ('khalvaris',12,'place', 'Ardent, the Fiery Judgment',     'The open furnace where the Bastion''s judgments are tempered. The fire is a Warden: it has never gone out.', 'the-magma-forge', 'wis', 18, 'Judge''s Second of the Magma Forge'),
  ('nyxara',   4, 'item',  'The Thousandth Mask',            'A mask that has been every face its wearer envied. It waits in the vault for someone to become.', 'the-mirror-vault', 'str', 18, 'Vault-Master of the Mirror Vault'),
  ('nyxara',  10, 'place', 'The Quiet Mirror',               'A single mirror the size of a wall that shows who you could become, and refuses some viewers. Nyxara looks out through it.', 'quiet-mirror', 'wis', 18, 'Keeper of the Quiet Mirror'),
  ('lazareth', 5, 'item',  'The Starlight Codex',            'A codex bound in compressed starlight that holds every history, including the ones that never were.', 'indexers-hall', 'str', 18, 'Senior Indexer'),
  ('lazareth', 4, 'place', 'The Glyph Hall',                 'A long hall whose walls record glyphs from every dead language. While its record holds, Lazareth remembers.', 'glyph-hall', 'wis', 18, 'Glyph-Master of the Hall'),
  ('thalvora', 5, 'item',  'The First Coin',                 'The first coin ever struck in the Bazaar, kept turning in the great press. Wealth that never stops moving.', 'coin-press', 'str', 18, 'Pressman'),
  ('thalvora',10, 'place', 'The Vault of Flowing Coin',      'A vault where gold is never allowed to rest. Thalvora''s charity flows out of it; hoarding here would wake dragons.', 'vault-of-flowing-coin', 'wis', 18, 'Keeper of the Vault'),
  ('velithria',4, 'item',  'The Ribbon of First Vows',       'The ribbon tied around the first vow ever spoken in the Evershade. It has never been untied.', 'candlelit-vow-hall', 'str', 18, 'Hall-Keeper of the Vow Hall'),
  ('velithria',5, 'place', 'The Tear-Glass Window',          'A window of set tears whose colors are wrong and beautiful. Every pure vow made beneath it strengthens Velithria.', 'tear-glass-window', 'wis', 18, 'Keeper of the Tear-Glass'),
  ('morvayne', 3, 'item',  'The Seed of the First Harvest',  'A single seed from the first harvest, kept in the granary. Temperance says it must never be eaten.', 'granary-stair', 'str', 18, 'Granary-Master'),
  ('morvayne', 4, 'place', 'The Endless Table',              'The great table of the Feastlands, which is never cleared. Morvayne''s bounty is laid here.', 'feast-throne', 'wis', 18, 'Steward of the Endless Table');

-- Demote the post-holders to keepers (they remain in the world, no longer wardens).
UPDATE public.npcs n SET is_warden = false, warden_index = NULL, title = v.keeper_title
FROM _wv v
WHERE n.is_warden AND n.aether_key = v.aether_key AND n.warden_index = v.idx;

INSERT INTO public.wardens (aether_key, warden_index, kind, name, description, room_slug, check_ability, check_dc)
SELECT v.aether_key, v.idx, v.kind, v.name, v.description, v.room, v.ability, v.dc
FROM _wv v JOIN public.rooms r ON r.slug = v.room
ON CONFLICT (aether_key, warden_index) DO NOTHING;

-- Players see them where they rest.
UPDATE public.rooms r SET description = r.description || ' ' ||
  CASE v.kind WHEN 'item' THEN 'Here rests ' || v.name || ', a Warden of ' || initcap(v.aether_key) || '.'
              ELSE 'This place is itself a Warden of ' || initcap(v.aether_key) || ': ' || v.name || '.' END
FROM _wv v
WHERE r.slug = v.room AND position('a Warden of' IN r.description) = 0 AND position('itself a Warden' IN r.description) = 0;

DROP TABLE _wv;

-- ---------------------------------------------------------------- person wardens
INSERT INTO public.wardens (aether_key, warden_index, kind, name, description, npc_id, room_slug)
SELECT n.aether_key, n.warden_index, 'person', n.name, COALESCE(n.title, '') || '. ' || COALESCE(n.persona, ''), n.id, n.room
FROM public.npcs n
WHERE n.is_warden AND n.aether_key IS NOT NULL AND n.warden_index BETWEEN 1 AND 12
ON CONFLICT (aether_key, warden_index) DO NOTHING;

-- ---------------------------------------------------------------- the rule
-- When a warden is destroyed: if none of that Aether's wardens still stands, the Aether falls.
CREATE OR REPLACE FUNCTION public.warden_destroyed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  standing int;
BEGIN
  IF OLD.destroyed_at IS NOT NULL OR NEW.destroyed_at IS NULL THEN RETURN NEW; END IF;

  UPDATE public.aethers SET wardens_killed = wardens_killed + 1 WHERE key = NEW.aether_key;
  INSERT INTO public.world_events (kind, room, actor_id, actor_name, target_kind, target_name, details)
  VALUES ('warden_destroyed', NEW.room_slug, NEW.destroyed_by, COALESCE(NEW.destroyed_by_name, 'someone'),
          'warden', NEW.name, jsonb_build_object('aether', NEW.aether_key, 'kind', NEW.kind));

  SELECT count(*) INTO standing FROM public.wardens WHERE aether_key = NEW.aether_key AND destroyed_at IS NULL;
  IF standing = 0 THEN
    UPDATE public.aethers SET alive = false, fallen_at = COALESCE(fallen_at, now())
     WHERE key = NEW.aether_key AND alive = true;
    UPDATE public.npcs SET dead_until = now() + interval '30 days'
     WHERE aether_key = NEW.aether_key AND is_aether = true;
    INSERT INTO public.world_events (kind, room, actor_id, actor_name, target_kind, target_name, details)
    VALUES ('aether_fell', NEW.room_slug, NEW.destroyed_by, COALESCE(NEW.destroyed_by_name, 'someone'),
            'aether', NEW.aether_key, jsonb_build_object('aether', NEW.aether_key, 'cause', 'last_warden_destroyed'));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wardens_on_destroyed ON public.wardens;
CREATE TRIGGER wardens_on_destroyed AFTER UPDATE OF destroyed_at ON public.wardens
FOR EACH ROW EXECUTE FUNCTION public.warden_destroyed();

-- Killing an NPC: the direct Aether-kill path is unchanged; a slain person warden is destroyed for
-- good (it does not return), and the rule above decides whether its Aether falls.
CREATE OR REPLACE FUNCTION public.maybe_fall_aether()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ak text;
  is_aether_kill boolean := false;
BEGIN
  IF NEW.kind <> 'npc_killed' OR NEW.target_id IS NULL THEN RETURN NEW; END IF;

  SELECT aether_key, is_aether INTO ak, is_aether_kill FROM public.npcs WHERE id = NEW.target_id;
  IF is_aether_kill AND ak IS NOT NULL THEN
    UPDATE public.aethers SET alive = false, fallen_at = COALESCE(fallen_at, now())
     WHERE key = ak AND alive = true;
    INSERT INTO public.world_events (kind, room, actor_id, actor_name, target_kind, target_name, details)
    VALUES ('aether_fell', NEW.room, NEW.actor_id, COALESCE(NEW.actor_name,'someone'),
            'aether', ak, jsonb_build_object('aether', ak, 'cause', 'aether_slain'));
    RETURN NEW;
  END IF;

  UPDATE public.wardens
     SET destroyed_at = now(), destroyed_by = NEW.actor_id, destroyed_by_name = NEW.actor_name
   WHERE npc_id = NEW.target_id AND kind = 'person' AND destroyed_at IS NULL;
  IF FOUND THEN
    UPDATE public.npcs SET dead_until = '9999-12-31'::timestamptz WHERE id = NEW.target_id;
  END IF;
  RETURN NEW;
END $$;
