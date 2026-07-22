
-- 1. Progress table
CREATE TABLE public.onboarding_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  step integer NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.onboarding_progress TO authenticated;
GRANT ALL ON public.onboarding_progress TO service_role;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own onboarding readable" ON public.onboarding_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own onboarding writable" ON public.onboarding_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_onboarding_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Shore guide NPC (idempotent: only if not already present)
INSERT INTO public.npcs (room, home_room, name, title, persona, greeting, current_activity)
SELECT 'crescent-shore', 'crescent-shore',
  'Mirren of the First Walk',
  'Mirror of the Shore',
  'A weathered walker who greets every soul the tide washes ashore. Patient, quiet, calls newcomers "first-walker". Teaches the rune of last breath (Sana) before letting anyone leave the shore, because she has buried too many who never learned it.',
  'You wake to salt and grey light. Someone is already sitting on the driftwood beside you — a woman with sea-bleached hair. "First-walker," she says. "Before you leave this shore, learn the one rune that will bring you back. Ask me about **Sana**."',
  'watching the tide for new souls'
WHERE NOT EXISTS (
  SELECT 1 FROM public.npcs WHERE home_room = 'crescent-shore' AND name = 'Mirren of the First Walk'
);

-- 3. Seed onboarding row on user create (extends existing handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) THEN
    uname := uname || '-' || substr(NEW.id::text, 1, 4);
  END IF;
  INSERT INTO public.profiles (id, username, current_room, created)
  VALUES (NEW.id, uname, 'crescent-shore', false);
  INSERT INTO public.onboarding_progress (user_id, step) VALUES (NEW.id, 1)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $function$;

-- 4. Backfill onboarding rows for any pre-existing players (start at step 5 = done)
INSERT INTO public.onboarding_progress (user_id, step)
SELECT id, 5 FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 5. Trigger: first NPC kill bumps step 3 → 4
CREATE OR REPLACE FUNCTION public.onboarding_on_kill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kind = 'npc_killed' AND NEW.actor_id IS NOT NULL THEN
    UPDATE public.onboarding_progress
       SET step = 4
     WHERE user_id = NEW.actor_id AND step BETWEEN 1 AND 3;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_onboarding_on_kill ON public.world_events;
CREATE TRIGGER trg_onboarding_on_kill
  AFTER INSERT ON public.world_events
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_on_kill();

-- 6. Trigger: reaching the First City gate closes the chain
CREATE OR REPLACE FUNCTION public.onboarding_on_room_enter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.current_room = 'first-city-gate'
     AND (OLD.current_room IS DISTINCT FROM NEW.current_room) THEN
    UPDATE public.onboarding_progress
       SET step = 5
     WHERE user_id = NEW.id AND step BETWEEN 1 AND 4;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_onboarding_on_room_enter ON public.profiles;
CREATE TRIGGER trg_onboarding_on_room_enter
  AFTER UPDATE OF current_room ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_on_room_enter();
