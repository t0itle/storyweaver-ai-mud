// Award quest rewards. Called server-side by npc-respond when a quest resolves,
// or by automated checks (visit/slay/fetch). Server clamps rewards to severity bands.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { GUILD_RANK_NAMES, GUILD_XP_PER_QUEST, GUILD_XP_WEEKLY_BONUS, guildRankFor } from "../_shared/guildRanks.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

export async function completeQuest(admin: any, questId: string, note = "") {
  const { data: quest } = await admin.from("quests").select("*").eq("id", questId).maybeSingle();
  if (!quest || quest.status !== "active") return { ok: false, reason: "not active" };

  const { data: capsRow } = await admin.rpc("quest_reward_caps", { _severity: quest.severity });
  const caps = capsRow ?? { gold_max: 20, xp_max: 40, amity_max: 6, item: false, knowledge: false };

  const gold = Math.max(0, Math.min(caps.gold_max, quest.reward_gold ?? 0));
  const xp = Math.max(0, Math.min(caps.xp_max, quest.reward_xp ?? 0));
  const amity = Math.max(0, Math.min(caps.amity_max, quest.reward_amity ?? 0));

  // Apply gold + xp.
  const { data: profile } = await admin.from("profiles")
    .select("gold, xp, username, current_room, merit").eq("id", quest.user_id).maybeSingle();
  await admin.from("profiles").update({
    gold: (profile?.gold ?? 0) + gold,
    xp: (profile?.xp ?? 0) + xp,
  }).eq("id", quest.user_id);

  // Bump amity with the giver.
  if (amity > 0) {
    const { data: a } = await admin.from("npc_amity").select("score")
      .eq("user_id", quest.user_id).eq("npc_id", quest.giver_npc_id).maybeSingle();
    const next = Math.max(-100, Math.min(100, (a?.score ?? 0) + amity));
    await admin.from("npc_amity").upsert({
      npc_id: quest.giver_npc_id, user_id: quest.user_id, score: next,
      updated_at: new Date().toISOString(),
    }, { onConflict: "npc_id,user_id" });
  }

  // Item reward (only if severity allows). Unique items are granted at most once per player.
  let itemGranted: string | null = null;
  if (caps.item && quest.reward_item_key) {
    const { data: item } = await admin.from("items")
      .select("key, unique_per_player").eq("key", quest.reward_item_key).maybeSingle();
    if (item) {
      let allow = true;
      if (item.unique_per_player) {
        const { count } = await admin.from("player_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", quest.user_id).eq("item_key", item.key);
        if ((count ?? 0) > 0) allow = false;
      }
      if (allow) {
        await admin.from("player_items").insert({
          user_id: quest.user_id, item_key: item.key, quantity: 1,
        });
        itemGranted = item.key;
      }
    }
  }

  // Knowledge rewards (only if severity allows).
  if (caps.knowledge && quest.reward_rune_key) {
    const { data: rune } = await admin.from("lesser_runes")
      .select("key, latin_name, english_meaning").eq("key", quest.reward_rune_key).maybeSingle();
    if (rune) {
      await admin.from("player_lesser_rune_knowledge").upsert({
        user_id: quest.user_id, rune_key: rune.key,
        knows_word: true, knows_symbol: false,
        learned_word_at: new Date().toISOString(),
        word_source: `quest:${quest.giver_npc_name}`,
      }, { onConflict: "user_id,rune_key" });
      await admin.from("world_events").insert({
        kind: "rune_word_learned", actor_id: quest.user_id, actor_name: profile?.username,
        room: profile?.current_room,
        details: { rune: rune.latin_name, meaning: rune.english_meaning, source: `quest` },
      });
    }
  }
  if (caps.knowledge && quest.reward_kanji_key) {
    const { data: k } = await admin.from("kanji_runes")
      .select("key, kanji, romaji, english_meaning").eq("key", quest.reward_kanji_key).maybeSingle();
    if (k) {
      await admin.from("player_kanji_knowledge").upsert({
        user_id: quest.user_id, kanji_key: k.key,
        knows_meaning: true, knows_stroke: false,
        learned_meaning_at: new Date().toISOString(),
        meaning_source: `quest:${quest.giver_npc_name}`,
      }, { onConflict: "user_id,kanji_key" });
      await admin.from("world_events").insert({
        kind: "kanji_meaning_learned", actor_id: quest.user_id, actor_name: profile?.username,
        room: profile?.current_room,
        details: { kanji: k.kanji, romaji: k.romaji, meaning: k.english_meaning, source: `quest` },
      });
    }
  }

  // Mark complete.
  await admin.from("quests").update({
    status: "complete",
    completed_at: new Date().toISOString(),
  }).eq("id", questId);

  // Escort completed: free the traveler and clear escortee fields, plus a small merit bump.
  if (quest.kind === "escort" && quest.escort_npc_id) {
    await admin.from("profiles").update({
      escortee_npc_id: null,
      escortee_destination: null,
      escortee_destination_name: null,
      merit: (profile?.merit ?? 0) + 2,
    }).eq("id", quest.user_id);
    // Retire the traveler NPC so they don't linger forever.
    await admin.from("npcs").update({ hidden: true }).eq("id", quest.escort_npc_id);
  }

  // Guild XP + rank-up announcement.
  if (quest.source_guild && !quest.is_initiation) {
    const { data: mem } = await admin.from("player_guild_membership")
      .select("guild_xp, rank, status").eq("user_id", quest.user_id).eq("guild_key", quest.source_guild).maybeSingle();
    if (mem?.status === "member") {
      const gain = GUILD_XP_PER_QUEST + (String(quest.title).startsWith("[Chapter Charge]") ? GUILD_XP_WEEKLY_BONUS : 0);
      const nx = (mem.guild_xp ?? 0) + gain;
      const nr = guildRankFor(nx);
      await admin.from("player_guild_membership").update({ guild_xp: nx, rank: nr, updated_at: new Date().toISOString() })
        .eq("user_id", quest.user_id).eq("guild_key", quest.source_guild);
      if (nr > (mem.rank ?? 0) && quest.source_guild_town) {
        await admin.from("messages").insert({
          room: `${quest.source_guild_town}-${quest.source_guild}-hall`, user_id: null, author_name: "—", kind: "system",
          content: `✦ ${profile?.username ?? "A member"} is raised to ${GUILD_RANK_NAMES[nr]} of the chapter.`,
        });
      }
    }
  }


  // Journal-yielding event.
  await admin.from("world_events").insert({
    kind: "quest_completed",
    actor_id: quest.user_id,
    actor_name: profile?.username,
    room: profile?.current_room ?? quest.offered_room,
    details: {
      title: quest.title, giver: quest.giver_npc_name, note,
      gold, xp, amity, item: itemGranted,
    },
  });

  return {
    ok: true, gold, xp, amity,
    item: itemGranted,
    rune: caps.knowledge ? quest.reward_rune_key : null,
    kanji: caps.knowledge ? quest.reward_kanji_key : null,
    title: quest.title,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { quest_id, note } = await req.json();
    if (!quest_id) return json({ error: "quest_id required" }, 400);
    // Verify ownership before awarding.
    const { data: q } = await admin.from("quests").select("user_id").eq("id", quest_id).maybeSingle();
    if (!q || q.user_id !== user.id) return json({ error: "no such quest" }, 404);

    const result = await completeQuest(admin, quest_id, note ?? "");
    return json(result);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
