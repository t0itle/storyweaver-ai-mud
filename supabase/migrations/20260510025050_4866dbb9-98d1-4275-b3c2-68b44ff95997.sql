
-- Environmental tags on rooms (a room can have multiple)
CREATE TABLE public.room_env_tags (
  room text NOT NULL,
  tag  text NOT NULL,
  PRIMARY KEY (room, tag)
);
ALTER TABLE public.room_env_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env tags readable" ON public.room_env_tags FOR SELECT TO authenticated USING (true);

-- Effects: tag-scoped (apply to any room with that tag) OR room-scoped (scripted)
CREATE TABLE public.rune_utility_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rune_key   text NOT NULL,                  -- lesser rune key
  scope      text NOT NULL CHECK (scope IN ('tag','room')),
  match_key  text NOT NULL,                  -- env tag OR room slug
  flavor_solve text NOT NULL,
  reward_kind text NOT NULL DEFAULT 'flavor' CHECK (reward_kind IN ('access','cache','lore','flavor')),
  reward_exit_dir   text,
  reward_exit_to    text,
  reward_exit_label text,
  reward_item_key   text,
  reward_gold int NOT NULL DEFAULT 0,
  reward_xp   int NOT NULL DEFAULT 0,
  reward_merit int NOT NULL DEFAULT 0,
  reward_lore_slug text,
  one_time boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rune_utility_effects_lookup ON public.rune_utility_effects(scope, match_key, rune_key);
ALTER TABLE public.rune_utility_effects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rune effects readable" ON public.rune_utility_effects FOR SELECT TO authenticated USING (true);

-- Per-player solves (per room, so tag effects can be solved in many rooms)
CREATE TABLE public.player_rune_solves (
  user_id uuid NOT NULL,
  effect_id uuid NOT NULL REFERENCES public.rune_utility_effects(id) ON DELETE CASCADE,
  room text NOT NULL,
  solved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, effect_id, room)
);
ALTER TABLE public.player_rune_solves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own solves readable" ON public.player_rune_solves FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Per-player extra exits unlocked by 'access' rewards
CREATE TABLE public.player_room_extra_exits (
  user_id uuid NOT NULL,
  room text NOT NULL,
  dir text NOT NULL,
  to_room text NOT NULL,
  label text,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room, dir)
);
ALTER TABLE public.player_room_extra_exits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own extra exits readable" ON public.player_room_extra_exits FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ===== Seed env tags =====
-- 'dark' — caves, crypts, vaults, cellars, tomb interiors
INSERT INTO public.room_env_tags (room, tag)
SELECT slug, 'dark' FROM public.rooms
WHERE kind IN ('crypt') OR slug ~ 'cellar|vault|crypt|tomb|cave|catacomb|chapel|archive'
ON CONFLICT DO NOTHING;

-- 'flooded' — pools, rivers, drowned places
INSERT INTO public.room_env_tags (room, tag)
SELECT slug, 'flooded' FROM public.rooms
WHERE slug ~ 'pool|river|drowned|spring|cistern|oasis|fount'
ON CONFLICT DO NOTHING;

-- 'parched' — deserts (aqua reveals)
INSERT INTO public.room_env_tags (room, tag)
SELECT slug, 'parched' FROM public.rooms
WHERE kind = 'desert'
ON CONFLICT DO NOTHING;

-- 'sealed' — gates, doors, vaults (aperio opens)
INSERT INTO public.room_env_tags (room, tag)
SELECT slug, 'sealed' FROM public.rooms
WHERE slug ~ 'gate|door|vault|seal|portal|warding'
ON CONFLICT DO NOTHING;

-- 'overgrown' — groves, hollows, gardens (tempus ages it back / vis cuts through)
INSERT INTO public.room_env_tags (room, tag)
SELECT slug, 'overgrown' FROM public.rooms
WHERE kind IN ('grove','hollow','garden') OR slug ~ 'orchard|grove|garden|thicket|brier'
ON CONFLICT DO NOTHING;

-- 'hallowed' — crypts, chapels, reliquaries (necros calls forth a memory)
INSERT INTO public.room_env_tags (room, tag)
SELECT slug, 'hallowed' FROM public.rooms
WHERE slug ~ 'reliquary|chapel|tomb|crypt|hall|sanctum|shrine'
ON CONFLICT DO NOTHING;

-- ===== Seed generic tag effects =====
-- LUX in dark: reveals a small cache + faint lore
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_gold, reward_xp, one_time)
VALUES
  ('lux','tag','dark',
   'Your **Lux** flares — the dark peels back, and something glints between the stones.',
   'cache', 12, 15, true);

-- IGNIS in dark: warmth + sees by firelight; small xp only
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, one_time)
VALUES
  ('ignis','tag','dark',
   '**Ignis** licks the air. In the dancing red, you see further than you should.',
   'flavor', 5, true);

-- IGNIS in flooded: melts/dries a path — access (added "across" exit only if scripted; here just flavor + small reward)
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, reward_gold, one_time)
VALUES
  ('ignis','tag','flooded',
   'Steam hisses up where **Ignis** meets the water — a path of bare stone surfaces, and your hand finds something cool beneath.',
   'cache', 20, 18, true);

-- AQUA in flooded: calms & parts the surface — reveals
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, reward_gold, one_time)
VALUES
  ('aqua','tag','flooded',
   '**Aqua** answers its kin — the water bends aside, and a sunken thing shows itself.',
   'cache', 15, 22, true);

-- AQUA in parched (desert): coaxes a spring to the surface
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_gold, reward_xp, one_time)
VALUES
  ('aqua','tag','parched',
   '**Aqua** sinks into the sand and rises again — a small spring beads up, and pilgrims have left coin around it before.',
   'cache', 24, 12, true);

-- APERIO on sealed: opens the way
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, one_time)
VALUES
  ('aperio','tag','sealed',
   '**Aperio** unspools the binding — locks click, sigils unwind, and the way opens for you alone.',
   'flavor', 12, true);

-- VIS on overgrown: forces a path
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_gold, reward_xp, one_time)
VALUES
  ('vis','tag','overgrown',
   '**Vis** crashes through the briar — the broken stalks reveal something a careful walker would have missed.',
   'cache', 8, 10, true);

-- TEMPUS on overgrown: ages it back to seedlings
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, one_time)
VALUES
  ('tempus','tag','overgrown',
   '**Tempus** wheels backwards — the thicket withers to seedlings, and the old shape of the place returns.',
   'flavor', 14, true);

-- NECROS in hallowed: a name speaks — lore
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, reward_merit, one_time)
VALUES
  ('necros','tag','hallowed',
   '**Necros** opens a thin door. A voice, very far away, gives you a name you did not have before.',
   'flavor', 18, 1, true);

-- VOX in hallowed: speaks back; small flavor
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, one_time)
VALUES
  ('vox','tag','hallowed',
   'Your **Vox** rings against the stone. Something old listens, and is satisfied.',
   'flavor', 8, true);

-- ===== Scripted bespoke effects =====
-- aperio on famine-door — opens a hidden way
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_exit_dir, reward_exit_to, reward_exit_label, reward_xp, reward_merit)
SELECT 'aperio','room','famine-door',
       'The **Famine Door** has not opened in a hundred years. Your **Aperio** finds the seam — it parts for you with a sigh of dust.',
       'access','through','hall-of-folded-names','a black gap behind the door',
       40, 3
WHERE EXISTS (SELECT 1 FROM public.rooms WHERE slug='famine-door')
  AND EXISTS (SELECT 1 FROM public.rooms WHERE slug='hall-of-folded-names');

-- ignis on drowned-chapel — burns away the rot, reveals a vault
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_gold, reward_xp)
SELECT 'ignis','room','drowned-chapel',
       'Your **Ignis** boils the chapel water away in a great hiss. Beneath the rotten pews, an iron-banded box.',
       'cache', 60, 30
WHERE EXISTS (SELECT 1 FROM public.rooms WHERE slug='drowned-chapel');

-- aqua on forgotten-oasis — restores it; lore
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_gold, reward_xp, reward_merit)
SELECT 'aqua','room','forgotten-oasis',
       'You speak **Aqua** at the dead well. The water rises clear and sweet — pilgrims will thank you, even if they never know your name.',
       'cache', 35, 25, 2
WHERE EXISTS (SELECT 1 FROM public.rooms WHERE slug='forgotten-oasis');

-- lux on chamber-of-one-name — lore-only
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, reward_merit)
SELECT 'lux','room','chamber-of-one-name',
       'In the **Lux** you see what is written on every wall: the same name, repeated forever. You read it once, and then forget.',
       'flavor', 22, 2
WHERE EXISTS (SELECT 1 FROM public.rooms WHERE slug='chamber-of-one-name');

-- necros on bone-orchard — a soul speaks
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp, reward_merit)
SELECT 'necros','room','bone-orchard',
       'A child-shape rises from the **Bone Orchard** at your **Necros** and tells you, very quietly, where its mother hid the coins.',
       'cache', 30, 2
WHERE EXISTS (SELECT 1 FROM public.rooms WHERE slug='bone-orchard');

-- tempus on archive-of-echoes — pages reset; lore
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_xp)
SELECT 'tempus','room','archive-of-echoes',
       'The pages in the **Archive of Echoes** rewind under your **Tempus** — for one breath, you read what was burned out.',
       'flavor', 35
WHERE EXISTS (SELECT 1 FROM public.rooms WHERE slug='archive-of-echoes');

-- vis on coin-choked-river — clears a passage
INSERT INTO public.rune_utility_effects
  (rune_key, scope, match_key, flavor_solve, reward_kind, reward_gold, reward_xp)
SELECT 'vis','room','coin-choked-river',
       '**Vis** punches the silt loose — coins boil up by the handful. You take what you can carry.',
       'cache', 90, 20
WHERE EXISTS (SELECT 1 FROM public.rooms WHERE slug='coin-choked-river');
