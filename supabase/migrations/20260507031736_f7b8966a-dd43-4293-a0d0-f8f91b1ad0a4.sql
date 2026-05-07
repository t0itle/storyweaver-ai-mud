-- Fix 1: For every sub-room with "out: <capital>", add a reciprocal exit
-- on the capital using the sub-room's slug as the direction label, so the
-- UI exposes the sub-room as a clickable destination.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT child.slug AS child_slug, trim(both '"' from kv.value::text) AS capital_slug
    FROM rooms child, jsonb_each_text(child.exits) kv
    WHERE kv.key = 'out'
      AND EXISTS (SELECT 1 FROM rooms cap WHERE cap.slug = trim(both '"' from kv.value::text)
                    AND cap.kind = 'capital')
  LOOP
    UPDATE rooms
       SET exits = exits || jsonb_build_object(r.child_slug, to_jsonb(r.child_slug))
     WHERE slug = r.capital_slug
       AND NOT (exits ? r.child_slug);
  END LOOP;
END $$;

-- Fix 2: Remove orphan duplicate capitals that conflict with canonical ones.
DELETE FROM rooms WHERE slug IN ('mirrorhall','star-reach');

-- Fix 3: First-city-gate referenced the deleted capitals; clean those keys.
UPDATE rooms
   SET exits = exits - 'mirrorhall' - 'reach'
 WHERE slug = 'first-city-gate';