CREATE OR REPLACE FUNCTION public.maybe_fall_aether()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ak text;
  killed int;
  is_aether_kill boolean := false;
  long_dead timestamptz := now() + interval '30 days';
BEGIN
  IF NEW.kind <> 'npc_killed' OR NEW.target_id IS NULL THEN RETURN NEW; END IF;

  -- Direct Aether kill
  SELECT aether_key, is_aether INTO ak, is_aether_kill
    FROM public.npcs WHERE id = NEW.target_id;

  IF is_aether_kill AND ak IS NOT NULL THEN
    UPDATE public.aethers
       SET alive = false, fallen_at = COALESCE(fallen_at, now())
     WHERE key = ak AND alive = true;
    INSERT INTO public.world_events (kind, room, actor_id, actor_name, target_kind, target_name, details)
    VALUES ('aether_fell', NEW.room, NEW.actor_id, COALESCE(NEW.actor_name,'someone'),
            'aether', ak, jsonb_build_object('aether', ak, 'cause', 'aether_slain'));
    RETURN NEW;
  END IF;

  -- Warden kill path
  SELECT aether_key INTO ak FROM public.npcs WHERE id = NEW.target_id AND is_warden = true;
  IF ak IS NULL THEN RETURN NEW; END IF;

  UPDATE public.aethers
     SET wardens_killed = wardens_killed + 1
   WHERE key = ak
   RETURNING wardens_killed INTO killed;

  IF killed >= 12 THEN
    UPDATE public.aethers
       SET alive = false, fallen_at = COALESCE(fallen_at, now())
     WHERE key = ak AND alive = true;

    -- The Aether figure itself falls in their throne room
    UPDATE public.npcs
       SET dead_until = long_dead
     WHERE aether_key = ak AND is_aether = true;

    INSERT INTO public.world_events (kind, room, actor_id, actor_name, target_kind, target_name, details)
    VALUES ('aether_fell', NEW.room, NEW.actor_id, COALESCE(NEW.actor_name,'someone'),
            'aether', ak, jsonb_build_object('aether', ak, 'cause', 'wardens_slain'));
  END IF;
  RETURN NEW;
END
$function$;