-- Add the two missing road connections from the gate to Mirrorlands and Silent Horizon.
UPDATE rooms
   SET exits = exits
       || jsonb_build_object('mirror','mirror-pass')
       || jsonb_build_object('horizon','star-stairs')
 WHERE slug = 'first-city-gate';

-- Generic reciprocity: every edge A->B (any direction key) should have a B->A.
-- If not, add B-> (back-or-source-slug) using the source slug as the direction.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    WITH edges AS (
      SELECT src.slug AS src, kv.key AS dir, trim(both '"' from kv.value::text) AS dst
      FROM rooms src, jsonb_each_text(src.exits) kv
    )
    SELECT a.src, a.dst
    FROM edges a
    JOIN rooms r2 ON r2.slug = a.dst
    WHERE NOT EXISTS (
      SELECT 1 FROM edges b WHERE b.src = a.dst AND b.dst = a.src
    )
  LOOP
    UPDATE rooms
       SET exits = exits || jsonb_build_object(r.src, to_jsonb(r.src))
     WHERE slug = r.dst
       AND NOT (exits ? r.src);
  END LOOP;
END $$;