
-- 1. Backfill reverse exits for every one-way connection.
DO $$
DECLARE
  src_slug text;
  dst_slug text;
  back_key text;
  existing jsonb;
  opp jsonb := '{"north":"south","south":"north","east":"west","west":"east","up":"down","down":"up","in":"out","out":"in"}'::jsonb;
  rec record;
BEGIN
  FOR rec IN
    WITH e AS (
      SELECT slug AS src, key AS dir, value AS dst FROM rooms, jsonb_each_text(exits)
    )
    SELECT e1.src, e1.dir, e1.dst FROM e e1
    LEFT JOIN e e2 ON e2.src = e1.dst AND e2.dst = e1.src
    WHERE e2.src IS NULL
  LOOP
    src_slug := rec.src; dst_slug := rec.dst;
    back_key := COALESCE(opp ->> rec.dir, 'back');
    SELECT exits INTO existing FROM rooms WHERE slug = dst_slug;
    IF existing IS NULL THEN CONTINUE; END IF;
    -- Only set if that key is unused on the destination.
    IF NOT (existing ? back_key) THEN
      UPDATE rooms SET exits = existing || jsonb_build_object(back_key, src_slug) WHERE slug = dst_slug;
    ELSIF NOT (existing ? 'back') THEN
      UPDATE rooms SET exits = existing || jsonb_build_object('back', src_slug) WHERE slug = dst_slug;
    END IF;
  END LOOP;
END $$;

-- 2. Stitch the 9 orphans into the map with two-way exits.
-- crescent-kingdoms (market) <-> first-city-gate
UPDATE rooms SET exits = exits || '{"out":"first-city-gate"}'::jsonb WHERE slug = 'crescent-kingdoms';
UPDATE rooms SET exits = exits || '{"kingdoms":"crescent-kingdoms"}'::jsonb WHERE slug = 'first-city-gate' AND NOT (exits ? 'kingdoms');

-- speaker-s-spire (room) <-> hall-of-the-seven
UPDATE rooms SET exits = exits || '{"down":"hall-of-the-seven"}'::jsonb WHERE slug = 'speaker-s-spire';
UPDATE rooms SET exits = exits || '{"spire":"speaker-s-spire"}'::jsonb WHERE slug = 'hall-of-the-seven' AND NOT (exits ? 'spire');

-- first-city (room) <-> sevenfold-square
UPDATE rooms SET exits = exits || '{"out":"sevenfold-square"}'::jsonb WHERE slug = 'first-city';
UPDATE rooms SET exits = exits || '{"in":"first-city"}'::jsonb WHERE slug = 'sevenfold-square' AND NOT (exits ? 'in');

-- city-gate (gate) <-> first-city-gate (alias gate)
UPDATE rooms SET exits = exits || '{"in":"first-city-gate"}'::jsonb WHERE slug = 'city-gate';
UPDATE rooms SET exits = exits || '{"gate":"city-gate"}'::jsonb WHERE slug = 'first-city-gate' AND NOT (exits ? 'gate');

-- grand-atrium-of-the-arkhive <-> archive-of-aethers
UPDATE rooms SET exits = exits || '{"out":"archive-of-aethers"}'::jsonb WHERE slug = 'grand-atrium-of-the-arkhive';
UPDATE rooms SET exits = exits || '{"atrium":"grand-atrium-of-the-arkhive"}'::jsonb WHERE slug = 'archive-of-aethers' AND NOT (exits ? 'atrium');

-- archive-of-echoes (crypt) <-> grand-atrium-of-the-arkhive
UPDATE rooms SET exits = exits || '{"out":"grand-atrium-of-the-arkhive"}'::jsonb WHERE slug = 'archive-of-echoes';
UPDATE rooms SET exits = exits || '{"echoes":"archive-of-echoes"}'::jsonb WHERE slug = 'grand-atrium-of-the-arkhive' AND NOT (exits ? 'echoes');

-- dragon-roost (lair) <-> whispering-wastes (one-way IN; out is the dragon)
UPDATE rooms SET exits = exits || '{"out":"whispering-wastes"}'::jsonb WHERE slug = 'dragon-roost';
UPDATE rooms SET exits = exits || '{"roost":"dragon-roost"}'::jsonb WHERE slug = 'whispering-wastes' AND NOT (exits ? 'roost');

-- wilds-of-aethel (wilds) <-> whispering-wastes
UPDATE rooms SET exits = exits || '{"out":"whispering-wastes"}'::jsonb WHERE slug = 'wilds-of-aethel';
UPDATE rooms SET exits = exits || '{"aethel":"wilds-of-aethel"}'::jsonb WHERE slug = 'whispering-wastes' AND NOT (exits ? 'aethel');

-- grand-atrium-of-the-first-city <-> sevenfold-square
UPDATE rooms SET exits = exits || '{"out":"sevenfold-square"}'::jsonb WHERE slug = 'grand-atrium-of-the-first-city';
UPDATE rooms SET exits = exits || '{"atrium":"grand-atrium-of-the-first-city"}'::jsonb WHERE slug = 'sevenfold-square' AND NOT (exits ? 'atrium');
