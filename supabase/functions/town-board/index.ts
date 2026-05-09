// Town board + bank — one endpoint for all actions in/around a town.
//
// Bank gating: Merit >= 50 unlocks bank everywhere; otherwise town rep >= 25
// in THAT town opens an account.
//
// Board lives in the capital room (and First City). Player must be standing
// in a room whose town_key is set to interact.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MERIT_BANK_BAR = 50;
const TOWN_REP_BANK_BAR = 25;
const QUEST_POST_FEE = 20;
const BOUNTY_MIN_REWARD = 50;

type Action =
  | { action: "list" }
  | { action: "post_quest"; title: string; description: string; objective: string; reward_gold: number; reward_xp?: number }
  | { action: "claim_quest"; posted_quest_id: string }
  | { action: "post_bounty"; target_username: string; reason: string; reward_gold: number; alive_bonus?: number }
  | { action: "claim_bounty"; bounty_id: string; claim_kind: "dead" | "alive" }
  | { action: "bank_open" }
  | { action: "bank_deposit"; amount: number }
  | { action: "bank_withdraw"; amount: number };

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

    const body = await req.json() as Action;
    const { data: profile } = await admin.from("profiles")
      .select("id, username, current_room, gold, merit, dead, downed").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 404);
    if (profile.dead || profile.downed) return json({ error: "you cannot do business in this state" }, 400);

    const { data: room } = await admin.from("rooms")
      .select("slug, town_key").eq("slug", profile.current_room).maybeSingle();
    const town_key = room?.town_key;
    if (!town_key) return json({ error: "There is no board here. Find the capital." }, 400);

    const { data: town } = await admin.from("towns").select("*").eq("key", town_key).maybeSingle();
    if (!town) return json({ error: "town missing" }, 500);

    const { data: rep } = await admin.from("player_town_rep")
      .select("score").eq("user_id", user.id).eq("town_key", town_key).maybeSingle();
    const town_rep = rep?.score ?? 0;
    const bank_unlocked = (profile.merit ?? 0) >= MERIT_BANK_BAR || town_rep >= TOWN_REP_BANK_BAR;

    // ─── list ───
    if (body.action === "list") {
      const [{ data: quests }, { data: bounties }, { data: bank }, { data: meBounty }] = await Promise.all([
        admin.from("posted_quests").select("*")
          .eq("town_key", town_key).eq("status", "open").order("created_at", { ascending: false }).limit(40),
        admin.from("bounties").select("*")
          .eq("town_key", town_key).eq("status", "open").order("reward_gold", { ascending: false }).limit(40),
        admin.from("town_bank_accounts").select("balance, opened_at")
          .eq("user_id", user.id).eq("town_key", town_key).maybeSingle(),
        admin.from("bounties").select("id, town_key, reward_gold, alive_bonus_gold, reason, posted_by_name")
          .eq("target_user_id", user.id).eq("status", "open"),
      ]);
      return json({
        ok: true,
        town,
        town_rep,
        merit: profile.merit ?? 0,
        gold: profile.gold ?? 0,
        bank: bank ?? null,
        bank_unlocked,
        merit_bar: MERIT_BANK_BAR,
        rep_bar: TOWN_REP_BANK_BAR,
        quests: quests ?? [],
        bounties: bounties ?? [],
        bounties_on_me: meBounty ?? [],
      });
    }

    // ─── post quest ───
    if (body.action === "post_quest") {
      const reward = Math.max(0, Math.floor(body.reward_gold ?? 0));
      if (reward < 5) return json({ error: "Reward must be at least 5g" }, 400);
      if ((profile.gold ?? 0) < reward + QUEST_POST_FEE)
        return json({ error: `Not enough gold (need ${reward + QUEST_POST_FEE})` }, 400);
      const title = String(body.title ?? "").trim().slice(0, 80);
      if (title.length < 3) return json({ error: "Title too short" }, 400);
      // Take gold up front; reward is held in escrow conceptually (deducted on claim).
      await admin.from("profiles").update({ gold: (profile.gold ?? 0) - QUEST_POST_FEE }).eq("id", user.id);
      const { data: q, error } = await admin.from("posted_quests").insert({
        town_key, author_user_id: user.id, author_name: profile.username,
        title, description: String(body.description ?? "").slice(0, 600),
        objective: String(body.objective ?? "").slice(0, 200),
        target_kind: "visit", target_ref: town_key,
        reward_gold: reward, reward_xp: Math.max(0, Math.floor(body.reward_xp ?? 0)),
        status: "open",
      }).select("*").single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, posted: q });
    }

    // ─── claim quest ───
    if (body.action === "claim_quest") {
      const { data: q } = await admin.from("posted_quests").select("*").eq("id", body.posted_quest_id).maybeSingle();
      if (!q || q.status !== "open") return json({ error: "Already taken" }, 400);
      if (q.author_user_id === user.id) return json({ error: "You cannot claim your own posting" }, 400);
      // Mirror into the player's own quests table so the existing UI/auto-resolve picks it up.
      const { data: insertedQuest } = await admin.from("quests").insert({
        user_id: user.id,
        giver_npc_id: crypto.randomUUID(), // placeholder; not a real NPC
        giver_npc_name: q.author_name,
        title: q.title,
        description: q.description,
        objective: q.objective,
        status: "active",
        kind: "favor",
        target_kind: "room",
        target_ref: q.target_ref ?? town_key,
        reward_gold: q.reward_gold,
        reward_xp: q.reward_xp,
        reward_amity: 0,
        offered_room: profile.current_room,
        accepted_at: new Date().toISOString(),
      }).select("id").single();
      await admin.from("posted_quests").update({
        status: "claimed", claimed_by: user.id, claimed_at: new Date().toISOString(),
      }).eq("id", q.id);
      return json({ ok: true, quest_id: insertedQuest?.id });
    }

    // ─── post bounty ───
    if (body.action === "post_bounty") {
      const reward = Math.max(BOUNTY_MIN_REWARD, Math.floor(body.reward_gold ?? 0));
      const aliveBonus = Math.max(0, Math.floor(body.alive_bonus ?? Math.floor(reward / 2)));
      if ((profile.gold ?? 0) < reward + aliveBonus) return json({ error: "Not enough gold to back this bounty" }, 400);
      const targetName = String(body.target_username ?? "").trim();
      if (!targetName) return json({ error: "Name the target" }, 400);
      const { data: target } = await admin.from("profiles").select("id, username")
        .ilike("username", targetName).maybeSingle();
      if (!target) return json({ error: "No such player walks the world" }, 404);
      if (target.id === user.id) return json({ error: "You cannot post a bounty on yourself" }, 400);
      await admin.from("profiles").update({ gold: (profile.gold ?? 0) - reward - aliveBonus }).eq("id", user.id);
      const { data: b } = await admin.from("bounties").insert({
        town_key, posted_by: user.id, posted_by_name: profile.username,
        target_user_id: target.id, target_name: target.username,
        reason: String(body.reason ?? "").slice(0, 280),
        reward_gold: reward, alive_bonus_gold: aliveBonus,
      }).select("*").single();
      return json({ ok: true, bounty: b });
    }

    // ─── claim bounty ───
    if (body.action === "claim_bounty") {
      const { data: b } = await admin.from("bounties").select("*").eq("id", body.bounty_id).maybeSingle();
      if (!b || b.status !== "open") return json({ error: "Bounty no longer open" }, 400);
      if (b.target_user_id === user.id) return json({ error: "You cannot claim a bounty on yourself" }, 400);
      const { data: target } = await admin.from("profiles")
        .select("id, dead, downed, current_room").eq("id", b.target_user_id).maybeSingle();
      if (!target) return json({ error: "Target gone" }, 404);

      // Verify the claimant was actually responsible.
      const { data: kill } = await admin.from("world_events")
        .select("id, created_at, kind, details")
        .eq("kind", "died").eq("actor_id", target.id)
        .gte("created_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      // For "dead" claim: target must currently be dead AND the claimant must be the killer.
      // For "alive" claim: target must be downed (not dead) and currently in the bounty's town.
      if (body.claim_kind === "dead") {
        if (!target.dead) return json({ error: "The mark still draws breath" }, 400);
        const killerOk = (kill?.details as { killer_id?: string } | null)?.killer_id === user.id;
        if (!killerOk) return json({ error: "You did not strike the killing blow" }, 400);
        const payout = b.reward_gold;
        await admin.from("bounties").update({
          status: "claimed", claimed_by: user.id, claim_kind: "dead", claimed_at: new Date().toISOString(),
        }).eq("id", b.id);
        await admin.from("profiles").update({ gold: (profile.gold ?? 0) + payout }).eq("id", user.id);
        return json({ ok: true, payout, kind: "dead" });
      } else {
        if (target.dead) return json({ error: "The mark is dead — claim it dead-payout instead" }, 400);
        if (!target.downed) return json({ error: "The mark must be downed (but not killed) to bring in alive" }, 400);
        if (target.current_room !== profile.current_room) return json({ error: "Drag the mark to this town first" }, 400);
        const payout = b.reward_gold + b.alive_bonus_gold;
        await admin.from("bounties").update({
          status: "claimed", claimed_by: user.id, claim_kind: "alive", claimed_at: new Date().toISOString(),
        }).eq("id", b.id);
        await admin.from("profiles").update({ gold: (profile.gold ?? 0) + payout }).eq("id", user.id);
        return json({ ok: true, payout, kind: "alive" });
      }
    }

    // ─── bank ───
    if (body.action === "bank_open") {
      if (!bank_unlocked) {
        return json({ error: `The teller refuses you. Need Merit ≥ ${MERIT_BANK_BAR} or town rep ≥ ${TOWN_REP_BANK_BAR} (you have ${town_rep}).` }, 400);
      }
      const { data: existing } = await admin.from("town_bank_accounts").select("*")
        .eq("user_id", user.id).eq("town_key", town_key).maybeSingle();
      if (existing) return json({ ok: true, bank: existing, already: true });
      const { data: b } = await admin.from("town_bank_accounts")
        .insert({ user_id: user.id, town_key }).select("*").single();
      return json({ ok: true, bank: b });
    }

    if (body.action === "bank_deposit" || body.action === "bank_withdraw") {
      const { data: account } = await admin.from("town_bank_accounts").select("*")
        .eq("user_id", user.id).eq("town_key", town_key).maybeSingle();
      if (!account) return json({ error: "Open an account first." }, 400);
      const amt = Math.max(1, Math.floor(body.amount ?? 0));
      if (body.action === "bank_deposit") {
        if ((profile.gold ?? 0) < amt) return json({ error: "Not enough gold on you" }, 400);
        await admin.from("profiles").update({ gold: (profile.gold ?? 0) - amt }).eq("id", user.id);
        await admin.from("town_bank_accounts").update({ balance: account.balance + amt })
          .eq("user_id", user.id).eq("town_key", town_key);
        return json({ ok: true, gold: (profile.gold ?? 0) - amt, balance: account.balance + amt });
      } else {
        if (account.balance < amt) return json({ error: "Insufficient balance" }, 400);
        await admin.from("town_bank_accounts").update({ balance: account.balance - amt })
          .eq("user_id", user.id).eq("town_key", town_key);
        await admin.from("profiles").update({ gold: (profile.gold ?? 0) + amt }).eq("id", user.id);
        return json({ ok: true, gold: (profile.gold ?? 0) + amt, balance: account.balance - amt });
      }
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("town-board error", e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
