// Guild interactions: list / initiate / accept_quest / learn_rune / buy_item.
// City-flavored chapters (warriors, traders, mages); 5 ranks via guild quest count.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

import { GUILD_RANK_NAMES as RANK_NAMES, GUILD_XP_THRESHOLDS, guildRankFor, boardPicks, dayKey, weekKey } from "../_shared/guildRanks.ts";

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

    const body = await req.json();
    const { action, guildmaster_id } = body;
    if (!guildmaster_id) return json({ error: "guildmaster_id required" }, 400);

    // Resolve guildmaster and chapter.
    const { data: gm } = await admin.from("npcs")
      .select("id,name,title,guild_key,guild_town,is_guildmaster,room")
      .eq("id", guildmaster_id).maybeSingle();
    if (!gm || !gm.is_guildmaster || !gm.guild_key || !gm.guild_town)
      return json({ error: "not a guildmaster" }, 400);

    const { data: chapter } = await admin.from("guild_chapters")
      .select("*").eq("guild_key", gm.guild_key).eq("town_key", gm.guild_town).maybeSingle();
    if (!chapter) return json({ error: "no chapter here" }, 404);

    const { data: guild } = await admin.from("guilds").select("*").eq("key", gm.guild_key).maybeSingle();

    // Membership: lazy refresh from completed-quest count + initiation status.
    let { data: mem } = await admin.from("player_guild_membership")
      .select("*").eq("user_id", user.id).eq("guild_key", gm.guild_key).maybeSingle();
    if (!mem) {
      await admin.from("player_guild_membership").insert({
        user_id: user.id, guild_key: gm.guild_key, status: "prospect", rank: 0, quests_completed: 0,
      });
      mem = { user_id: user.id, guild_key: gm.guild_key, status: "prospect",
              rank: 0, quests_completed: 0, initiation_quest_id: null,
              joined_at: null, updated_at: new Date().toISOString() } as any;
    }

    // If initiation quest is complete (or the player has returned to the guildmaster), promote to member.
    if (mem!.status === "initiating" && mem!.initiation_quest_id) {
      const { data: iq } = await admin.from("quests")
        .select("status").eq("id", mem!.initiation_quest_id).maybeSingle();
      // Player is standing in front of the guildmaster right now — that *is* "returning to the hall".
      // Auto-complete any still-open initiation quest so the prospect can be promoted.
      if (iq && iq.status !== "complete" && iq.status !== "failed" && iq.status !== "abandoned") {
        await admin.from("quests").update({
          status: "complete", completed_at: new Date().toISOString(),
        }).eq("id", mem!.initiation_quest_id);
        await admin.from("world_events").insert({
          kind: "quest_completed", actor_id: user.id,
          target_kind: "quest", target_name: "Initiation",
          details: { title: "Initiation", giver: guild?.name ?? "the guild" },
        });
        mem!.status = "member";
        mem!.joined_at = new Date().toISOString();
      } else if (iq?.status === "complete") {
        mem!.status = "member";
        mem!.joined_at = new Date().toISOString();
      }
    }

    // Recount completed guild quests for this guild.
    const { count: completedCount } = await admin.from("quests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id).eq("status", "complete").eq("source_guild", gm.guild_key);
    const qc = completedCount ?? 0;
    const newRank = mem!.status === "member" ? rankFor(qc) : 0;
    if (qc !== mem!.quests_completed || newRank !== mem!.rank || mem!.status !== (mem as any).__prev) {
      await admin.from("player_guild_membership").update({
        status: mem!.status, rank: newRank, quests_completed: qc,
        joined_at: mem!.joined_at, updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("guild_key", gm.guild_key);
      mem!.quests_completed = qc;
      mem!.rank = newRank;
    }

    const isMember = mem!.status === "member";
    const playerRank = mem!.rank ?? 0;

    // Profile + known runes (for filtering UI).
    const { data: profile } = await admin.from("profiles")
      .select("id, gold, current_room, username").eq("id", user.id).maybeSingle();
    const { data: knownLesser } = await admin.from("player_lesser_rune_knowledge")
      .select("rune_key, knows_word, knows_symbol").eq("user_id", user.id);
    const { data: knownKanji } = await admin.from("player_kanji_knowledge")
      .select("kanji_key, knows_meaning, knows_stroke").eq("user_id", user.id);

    // ===== ACTIONS =====
    if (action === "list") {
      const { data: stock } = await admin.from("guild_stock")
        .select("*").eq("guild_key", gm.guild_key).eq("town_key", gm.guild_town);

      // Decorate stock with display names.
      const itemKeys = (stock ?? []).filter(s => s.kind === "item").map(s => s.ref_key);
      const lesserKeys = (stock ?? []).filter(s => s.kind === "lesser_rune").map(s => s.ref_key);
      const kanjiKeys = (stock ?? []).filter(s => s.kind === "kanji_rune").map(s => s.ref_key);
      const [items, lesser, kanji] = await Promise.all([
        itemKeys.length ? admin.from("items").select("key,name").in("key", itemKeys) : Promise.resolve({ data: [] }),
        lesserKeys.length ? admin.from("lesser_runes").select("key,latin_name,glyph,english_meaning").in("key", lesserKeys) : Promise.resolve({ data: [] }),
        kanjiKeys.length ? admin.from("kanji_runes").select("key,kanji,romaji,english_meaning").in("key", kanjiKeys) : Promise.resolve({ data: [] }),
      ]);
      const itemMap = new Map((items.data ?? []).map((i: any) => [i.key, i]));
      const lesserMap = new Map((lesser.data ?? []).map((i: any) => [i.key, i]));
      const kanjiMap = new Map((kanji.data ?? []).map((i: any) => [i.key, i]));

      const decoratedStock = (stock ?? []).map((s: any) => {
        let display = s.ref_key;
        let owned = false;
        if (s.kind === "item") display = itemMap.get(s.ref_key)?.name ?? s.ref_key;
        else if (s.kind === "lesser_rune") {
          const lr: any = lesserMap.get(s.ref_key);
          display = lr ? `${lr.glyph} ${lr.latin_name} (${lr.english_meaning})` : s.ref_key;
          const k = (knownLesser ?? []).find((x: any) => x.rune_key === s.ref_key);
          owned = !!(k?.knows_word && k?.knows_symbol);
        } else if (s.kind === "kanji_rune") {
          const kr: any = kanjiMap.get(s.ref_key);
          display = kr ? `${kr.kanji} ${kr.romaji} (${kr.english_meaning})` : s.ref_key;
          const k = (knownKanji ?? []).find((x: any) => x.kanji_key === s.ref_key);
          owned = !!(k?.knows_meaning && k?.knows_stroke);
        }
        return { ...s, display, owned, locked: s.rank_required > playerRank };
      });

      // Available quest templates the player hasn't completed yet (or already active for).
      const { data: tpls } = await admin.from("guild_quest_templates")
        .select("*").eq("guild_key", gm.guild_key).eq("town_key", gm.guild_town)
        .lte("rank_required", playerRank);
      const { data: activeGuildQuests } = await admin.from("quests")
        .select("title,status,id").eq("user_id", user.id)
        .eq("source_guild", gm.guild_key).eq("source_guild_town", gm.guild_town)
        .in("status", ["offered", "active"]);
      const usedTitles = new Set((activeGuildQuests ?? []).map((q: any) => q.title));
      const availableQuests = (tpls ?? []).filter((t: any) =>
        !usedTitles.has(t.title) && isMember);

      return json({
        ok: true,
        guild, chapter,
        guildmaster: { id: gm.id, name: gm.name, title: gm.title },
        membership: {
          status: mem!.status,
          rank: playerRank,
          rank_name: RANK_NAMES[playerRank],
          quests_completed: qc,
          next_threshold: RANK_THRESHOLDS[Math.min(playerRank + 1, 4)],
        },
        gold: profile?.gold ?? 0,
        stock: decoratedStock,
        quests: availableQuests,
        active_guild_quests: activeGuildQuests ?? [],
      });
    }

    if (action === "initiate") {
      if (mem!.status !== "prospect") return json({ error: "you have already begun your initiation" }, 400);
      // Build the initiation quest in the quests table.
      const initTpl = {
        warriors: { title: "An Oath in Steel — " + chapter.hall_room,
                    objective: "Walk a circuit of the streets and return to the Marshal." },
        traders:  { title: "Mind the Ledger — " + chapter.hall_room,
                    objective: "Make one round of the streets and return to the Factor." },
        mages:    { title: "Trace the First Stroke — " + chapter.hall_room,
                    objective: "Walk the chalk path and return to the Magister." },
      }[gm.guild_key]!;
      const { data: q, error } = await admin.from("quests").insert({
        user_id: user.id, giver_npc_id: gm.id, giver_npc_name: gm.name,
        title: initTpl.title, objective: initTpl.objective,
        description: "Your initiation into the " + (guild?.name ?? "guild") + ".",
        kind: "favor", severity: "minor", status: "active",
        target_kind: "room", target_ref: chapter.hall_room,
        reward_gold: 15, reward_xp: 25, reward_amity: 4,
        offered_room: chapter.hall_room,
        accepted_at: new Date().toISOString(),
        source_guild: gm.guild_key, source_guild_town: gm.guild_town, is_initiation: true,
      }).select("id").single();
      if (error) return json({ error: error.message }, 500);

      await admin.from("player_guild_membership").update({
        status: "initiating", initiation_quest_id: q!.id, updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("guild_key", gm.guild_key);

      await admin.from("world_events").insert({
        kind: "quest_accepted", actor_id: user.id, actor_name: profile?.username,
        room: profile?.current_room,
        details: { title: initTpl.title, objective: initTpl.objective, giver: gm.name },
      });
      return json({ ok: true, quest_id: q!.id, message: "Your initiation has begun." });
    }

    if (action === "accept_quest") {
      if (!isMember) return json({ error: "complete your initiation first" }, 400);
      const { template_id } = body;
      const { data: tpl } = await admin.from("guild_quest_templates")
        .select("*").eq("id", template_id).maybeSingle();
      if (!tpl) return json({ error: "no such quest template" }, 404);
      if (tpl.guild_key !== gm.guild_key || tpl.town_key !== gm.guild_town)
        return json({ error: "wrong chapter" }, 400);
      if (tpl.rank_required > playerRank) return json({ error: "you have not earned the rank for this task" }, 400);

      const { count: activeCount } = await admin.from("quests").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("status", "active");
      if ((activeCount ?? 0) >= 5) return json({ error: "you already carry too many promises (5 max)" }, 400);

      const severity = tpl.rank_required <= 0 ? "minor" : tpl.rank_required === 1 ? "standard" : "major";
      const { data: q, error } = await admin.from("quests").insert({
        user_id: user.id, giver_npc_id: gm.id, giver_npc_name: gm.name,
        title: tpl.title, objective: tpl.objective, description: tpl.description,
        kind: "favor", severity, status: "active",
        target_kind: tpl.target_kind, target_ref: tpl.target_ref ?? chapter.hall_room,
        reward_gold: tpl.reward_gold, reward_xp: tpl.reward_xp, reward_amity: 4,
        reward_item_key: tpl.reward_item_key, reward_rune_key: tpl.reward_rune_key,
        offered_room: chapter.hall_room,
        accepted_at: new Date().toISOString(),
        source_guild: gm.guild_key, source_guild_town: gm.guild_town,
      }).select("id").single();
      if (error) return json({ error: error.message }, 500);

      await admin.from("world_events").insert({
        kind: "quest_accepted", actor_id: user.id, actor_name: profile?.username,
        room: profile?.current_room,
        details: { title: tpl.title, objective: tpl.objective, giver: gm.name },
      });
      return json({ ok: true, quest_id: q!.id });
    }

    if (action === "learn_rune" || action === "buy_item") {
      const { stock_id } = body;
      const { data: s } = await admin.from("guild_stock").select("*").eq("id", stock_id).maybeSingle();
      if (!s || s.guild_key !== gm.guild_key || s.town_key !== gm.guild_town)
        return json({ error: "no such stock here" }, 404);
      if (s.rank_required > playerRank)
        return json({ error: `requires rank ${RANK_NAMES[s.rank_required]}` }, 400);
      if (!isMember && s.rank_required > 0)
        return json({ error: "members only" }, 400);

      const gold = profile?.gold ?? 0;
      if (gold < s.price_gold) return json({ error: "not enough gold" }, 400);

      if (action === "learn_rune") {
        if (s.kind === "lesser_rune") {
          await admin.from("player_lesser_rune_knowledge").upsert({
            user_id: user.id, rune_key: s.ref_key,
            knows_word: true, knows_symbol: true,
            learned_word_at: new Date().toISOString(),
            learned_symbol_at: new Date().toISOString(),
            word_source: "guild",
          }, { onConflict: "user_id,rune_key" });
          await admin.from("player_lesser_runes").upsert({
            user_id: user.id, rune_key: s.ref_key,
          }, { onConflict: "user_id,rune_key" });
          await admin.from("world_events").insert({
            kind: "rune_word_learned", actor_id: user.id, actor_name: profile?.username,
            room: profile?.current_room,
            details: { rune: s.ref_key, meaning: "(taught at the guild)", source: "guild" },
          });
        } else if (s.kind === "kanji_rune") {
          await admin.from("player_kanji_knowledge").upsert({
            user_id: user.id, kanji_key: s.ref_key,
            knows_meaning: true, knows_stroke: true,
            learned_meaning_at: new Date().toISOString(),
            learned_stroke_at: new Date().toISOString(),
            meaning_source: "guild",
          }, { onConflict: "user_id,kanji_key" });
          await admin.from("world_events").insert({
            kind: "kanji_meaning_learned", actor_id: user.id, actor_name: profile?.username,
            room: profile?.current_room,
            details: { kanji: s.ref_key, meaning: "(taught at the guild)", source: "guild" },
          });
        } else {
          return json({ error: "this stock is not a rune" }, 400);
        }
      } else { // buy_item
        if (s.kind !== "item") return json({ error: "this stock is not an item" }, 400);
        const { data: existing } = await admin.from("player_items")
          .select("id, quantity").eq("user_id", user.id).eq("item_key", s.ref_key)
          .is("equipped_slot", null).is("container_id", null).maybeSingle();
        const { data: itemDef } = await admin.from("items").select("stackable,max_stack").eq("key", s.ref_key).maybeSingle();
        if (existing && itemDef?.stackable) {
          await admin.from("player_items").update({
            quantity: Math.min(existing.quantity + 1, itemDef.max_stack ?? 99),
          }).eq("id", existing.id);
        } else {
          await admin.from("player_items").insert({
            user_id: user.id, item_key: s.ref_key, quantity: 1,
          });
        }
      }

      await admin.from("profiles").update({ gold: gold - s.price_gold }).eq("id", user.id);
      return json({ ok: true, paid: s.price_gold });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
