// Wipes the player's current character so they can create a fresh one.
// Clears character-specific tables and flips profiles.created back to false.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles").select("companion_npc_id").eq("id", user.id).maybeSingle();

    // Best-effort: free up player's combatant rows so combats can resolve.
    await admin.from("combatants").update({ defeated: true, hp: 0 }).eq("user_id", user.id);

    // Wipe per-character state. Order is not critical — no FKs are enforced cross-table here.
    const tables = [
      "player_items",
      "player_runes",
      "player_lesser_rune_knowledge",
      "player_lesser_runes",
      "player_kanji_knowledge",
      "player_kanji_mastery",
      "player_kanji_compound_discoveries",
      "player_lore_discoveries",
      "player_npc_discoveries",
      "player_room_cache_claims",
      "player_journal_entries",
      "player_skills",
      "player_songs",
      "player_speaker_artifacts",
      "player_artifact_rumors",
      "player_rune_solves",
      "player_room_extra_exits",
      "player_town_rep",
      "player_guild_membership",
      "npc_amity",
      "npc_memories",
      "quests",
      "aether_loyalty",
      "chaos_path",
    ];
    for (const t of tables) {
      await admin.from(t).delete().eq("user_id", user.id);
    }

    // Release any companion link.
    if (profile?.companion_npc_id) {
      // No-op on npcs table; just clear the pointer below.
    }

    // Reset the profile so the creation flow runs again.
    await admin.from("profiles").update({
      created: false,
      race: null,
      char_description: null,
      portrait_url: null,
      hp: 20, max_hp: 20,
      xp: 0, level: 1,
      gold: 10,
      merit: 0,
      corruption: 0,
      aether: null, aether_chosen_at: null,
      faction: null,
      hall_refusals: 0,
      chaos_pressure: 0,
      non_serviam_at: null,
      companion_npc_id: null,
      in_combat_id: null,
      downed: false, downed_at: null, downed_combat_id: null,
      dead: false, dead_at: null, death_room: null,
      zombified: false, revived_at: null, revived_by: null,
      current_room: "crescent-shore",
    }).eq("id", user.id);

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
