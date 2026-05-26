
-- 1. PROFILES: column-level UPDATE
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile safe cols" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (current_room, companion_npc_id, companion_mode, char_description, portrait_url, race, updated_at)
  ON public.profiles TO authenticated;

-- 2. NPCS: only allow updating room column
REVOKE UPDATE ON public.npcs FROM authenticated, anon;
GRANT UPDATE (room) ON public.npcs TO authenticated;

-- 3. QUESTS: no direct player updates; server-only
DROP POLICY IF EXISTS "own quests updatable" ON public.quests;
REVOKE UPDATE ON public.quests FROM authenticated, anon;

-- 4. QUESTS: hide solution & solution_hint columns from players
REVOKE SELECT ON public.quests FROM authenticated, anon;
GRANT SELECT (
  id, user_id, giver_npc_id, giver_npc_name, title, description, objective,
  status, severity, kind, target_kind, target_ref,
  reward_gold, reward_xp, reward_amity, reward_item_key, reward_rune_key, reward_kanji_key,
  offered_room, accepted_at, completed_at, expires_at, created_at, updated_at,
  escort_npc_id, source_guild, source_guild_town, is_initiation, attempts
) ON public.quests TO authenticated;

-- 5. PUZZLE_POOL: hide answer column
REVOKE SELECT ON public.puzzle_pool FROM authenticated, anon;
GRANT SELECT (id, npc_id, kind, prompt, hint, flavor, severity,
              reward_gold, reward_xp, reward_merit, reward_item_key, reward_rune_key, created_at)
  ON public.puzzle_pool TO authenticated;

-- 6. SCENE_MUSIC: restrict to authenticated
DROP POLICY IF EXISTS "scene_music readable by all" ON public.scene_music;
CREATE POLICY "scene_music readable by authenticated" ON public.scene_music
  FOR SELECT TO authenticated USING (true);

-- 7. STORAGE: drop broad public SELECT (public bucket URLs continue to work)
DROP POLICY IF EXISTS "music public read" ON storage.objects;
DROP POLICY IF EXISTS "portraits public read" ON storage.objects;
DROP POLICY IF EXISTS "room-audio public read" ON storage.objects;
DROP POLICY IF EXISTS "scenes public read" ON storage.objects;

-- 8. SECURITY DEFINER trigger functions: revoke EXECUTE from end-users
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maybe_post_auto_bounty() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_journal_from_world_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.react_market_to_world_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_profile_xp_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gossip_town_on_npc_killed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maybe_fall_aether() FROM PUBLIC, anon, authenticated;
