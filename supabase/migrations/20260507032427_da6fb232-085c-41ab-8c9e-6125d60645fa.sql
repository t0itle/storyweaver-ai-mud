
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS desert_depth integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desert_bearing integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desert_entered_from text;

INSERT INTO public.rooms (slug, name, label, kind, description, ambience, exits, hidden)
VALUES (
  'deep-desert',
  'The Deep Desert',
  'Sands',
  'desert',
  'Sand to every horizon. The wind has erased every footprint but your own — and even those, before you can turn around. The sun above feels wrong, as if it has been moved while you weren''t looking.',
  'Hot wind. Grit in your teeth. The far dunes shimmer and re-shimmer.',
  '{}'::jsonb,
  false
)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  ambience = EXCLUDED.ambience,
  kind = EXCLUDED.kind,
  exits = EXCLUDED.exits;
