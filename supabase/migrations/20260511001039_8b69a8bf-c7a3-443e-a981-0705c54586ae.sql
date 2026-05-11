-- Fix desert→First City connectivity. desert-verge.south was a self-loop;
-- caravan-road had no exit back to gates-approach (asymmetric with gates-approach.east).
UPDATE public.rooms
SET exits = jsonb_set(exits::jsonb, '{south}', '"caravan-road"'::jsonb)
WHERE slug = 'desert-verge';

UPDATE public.rooms
SET exits = (exits::jsonb - 'west') || jsonb_build_object('west', 'gates-approach', 'dunes', 'bone-dunes')
WHERE slug = 'caravan-road';