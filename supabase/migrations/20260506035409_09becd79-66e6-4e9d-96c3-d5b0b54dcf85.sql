
-- Compute level from cumulative xp using Fibonacci thresholds (× 10), no cap.
-- cumulative XP needed to reach level N (N>=2) = fib(N+1) * 10
-- level 1 = 0 xp, level 2 = 20, level 3 = 30, level 4 = 50, level 5 = 80, level 6 = 130, ...
CREATE OR REPLACE FUNCTION public.level_for_xp(_xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a bigint := 1;  -- fib(2)
  b bigint := 2;  -- fib(3)
  lvl integer := 1;
  threshold bigint;
BEGIN
  IF _xp IS NULL OR _xp <= 0 THEN RETURN 1; END IF;
  -- starting at level 2 needing fib(3)*10 = 20
  LOOP
    threshold := b * 10;
    IF _xp < threshold THEN RETURN lvl; END IF;
    lvl := lvl + 1;
    -- advance fib: (a,b) -> (b, a+b)
    DECLARE next_b bigint := a + b;
    BEGIN
      a := b;
      b := next_b;
    END;
    -- safety: cap iterations astronomically; xp is int4 so this terminates fast
    IF lvl > 200 THEN RETURN lvl; END IF;
  END LOOP;
END $$;

-- Trigger: when xp changes, recompute level and grant tiny stat bumps.
CREATE OR REPLACE FUNCTION public.handle_profile_xp_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_level integer;
  gained integer;
BEGIN
  IF NEW.xp IS DISTINCT FROM OLD.xp THEN
    new_level := public.level_for_xp(NEW.xp);
    IF new_level > COALESCE(OLD.level, 1) THEN
      gained := new_level - COALESCE(OLD.level, 1);
      NEW.level := new_level;
      -- tiny permanent bonus per level so high levels don't dominate
      NEW.max_hp := COALESCE(OLD.max_hp, 20) + gained;
      NEW.hp := LEAST(NEW.max_hp, COALESCE(NEW.hp, OLD.hp) + gained);
      -- announce
      INSERT INTO public.messages (room, user_id, author_name, kind, content)
      VALUES (NEW.current_room, NULL, '—', 'system',
              '✦ ' || NEW.username || ' rises to level ' || new_level || '. (+' || gained || ' max HP)');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_xp_level ON public.profiles;
CREATE TRIGGER profiles_xp_level
BEFORE UPDATE OF xp ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_xp_change();

-- Backfill existing levels to match current xp.
UPDATE public.profiles
SET level = public.level_for_xp(xp)
WHERE level IS DISTINCT FROM public.level_for_xp(xp);
