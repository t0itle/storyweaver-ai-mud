// Turning an NPC's wants into help from players (docs/npc-agents.md §6.1, phase 3).
//
// A want that has lasted ASK_AFTER_HOURS becomes a request, paid from the NPC's own purse:
//  - if some player has earned the NPC's trust (amity ≥ LETTER_AMITY), a letter goes straight to
//    them with an offered quest (accept/decline as usual);
//  - otherwise a posting goes up on the town board of the NPC's home town.
// A request that goes unanswered for ASK_AGAIN_AFTER_DAYS lapses, and the NPC may ask again.
// quest-award resolves the want when the quest is completed.
// The reward is escrowed (quests/posted_quests.escrow_gold): paid to the player on completion, and
// returned to this purse if the request lapses, is declined or is abandoned (_shared/questEscrow.ts).
import {
  ASK_AFTER_HOURS, ASK_AGAIN_AFTER_DAYS, LETTER_AMITY, QUESTABLE_NEEDS, questForWant, rewardFor,
  targetRoomFor, wantTarget, type Want,
} from "../_shared/npcMind.ts";

export interface AskedWant extends Want {
  asked_at?: string;
  quest_title?: string;
  posted_quest_id?: string;
  letter_to?: string;
  letter_quest_id?: string;
}

export interface WantContext {
  npc: { id: string; name: string; room: string; home_room: string | null; purse_gold: number };
  wants: AskedWant[];
  roomBySlug: Map<string, { slug: string; name: string; kind: string; town_key: string | null }>;
  now: Date;
}

const HOUR = 3_600_000;

/** Returns the wants (updated with what was asked). Spends from the purse via the npcs row. */
// deno-lint-ignore no-explicit-any
export async function pursueWants(admin: any, ctx: WantContext): Promise<AskedWant[]> {
  const { npc, now } = ctx;
  const out: AskedWant[] = [];
  let purse = npc.purse_gold;

  for (const w of ctx.wants) {
    const next: AskedWant = { ...w };
    out.push(next);

    // An earlier request lapses after a few days so the NPC can try again.
    if (next.asked_at && now.getTime() - new Date(next.asked_at).getTime() > ASK_AGAIN_AFTER_DAYS * 24 * HOUR) {
      // Take back an unanswered request and its escrow. The refund goes into the local purse, which
      // is written once at the end, so it is not overwritten.
      if (next.posted_quest_id) {
        const { data: closed } = await admin.from("posted_quests").update({ status: "expired" })
          .eq("id", next.posted_quest_id).eq("status", "open").select("escrow_gold");
        if (closed?.[0]) purse += closed[0].escrow_gold ?? 0;
      }
      if (next.letter_quest_id) {
        const { data: lapsed } = await admin.from("quests").select("escrow_gold")
          .eq("id", next.letter_quest_id).eq("status", "offered").maybeSingle();
        if (lapsed) {
          const { data: closed } = await admin.from("quests").update({ status: "declined", escrow_gold: 0 })
            .eq("id", next.letter_quest_id).eq("status", "offered").eq("escrow_gold", lapsed.escrow_gold).select("id");
          if (closed?.length) purse += lapsed.escrow_gold ?? 0;
        }
      }
      delete next.asked_at; delete next.posted_quest_id; delete next.letter_to; delete next.quest_title;
      delete next.letter_quest_id;
    }
    if (next.asked_at) continue;
    if (!QUESTABLE_NEEDS.includes(next.need)) continue;
    if (now.getTime() - new Date(next.since).getTime() < ASK_AFTER_HOURS * HOUR) continue;

    const reward = rewardFor(purse);
    if (reward === null) continue;   // too poor to offer anything; the code brain will make them work
    const homeTown = ctx.roomBySlug.get(npc.home_room ?? npc.room)?.town_key ?? null;
    const target = targetRoomFor(next.need, npc, homeTown, [...ctx.roomBySlug.values()]);
    if (!target) continue;
    const draft = questForWant(npc.name, next.need, ctx.roomBySlug.get(target)?.name ?? target);
    if (!draft) continue;
    const goal = wantTarget(next.need, target);   // hunger asks for real bread, not just a visit

    // 1) A letter to the player who trusts them most, if anyone has earned it.
    const { data: friend } = await admin.from("npc_amity").select("user_id, score")
      .eq("npc_id", npc.id).gte("score", LETTER_AMITY).order("score", { ascending: false }).limit(1).maybeSingle();
    if (friend) {
      const { data: q } = await admin.from("quests").insert({
        user_id: friend.user_id, giver_npc_id: npc.id, giver_npc_name: npc.name,
        title: draft.title, objective: draft.objective, description: draft.description,
        kind: "favor", severity: "minor", status: "offered",
        target_kind: goal.kind, target_ref: goal.ref,
        reward_gold: reward, reward_xp: 15, reward_amity: 6, offered_room: npc.room,
        escrow_gold: reward, escrow_npc_id: npc.id,
      }).select("id").single();
      if (q) {
        await admin.from("player_letters").insert({
          user_id: friend.user_id, from_npc_id: npc.id, from_name: npc.name,
          subject: draft.title,
          body: `${next.text} ${draft.objective} I can spare ${reward} gold. — ${npc.name}\n(Type \`accept ${draft.title}\` to take this on.)`,
          quest_id: q.id,
        });
        purse -= reward;
        Object.assign(next, { asked_at: now.toISOString(), letter_to: friend.user_id, quest_title: draft.title, letter_quest_id: q.id });
        await admin.from("npc_journal").insert({
          npc_id: npc.id, kind: "deed", subject_kind: "player", subject_id: friend.user_id,
          summary: `Wrote to a trusted friend asking for help: ${draft.objective}`,
          importance: 2, disclosure: 2, room: npc.room,
        });
        continue;
      }
    }

    // 2) Otherwise, the town board of their home town.
    if (!homeTown) continue;
    const { data: post } = await admin.from("posted_quests").insert({
      town_key: homeTown, author_user_id: null, author_npc_id: npc.id, author_name: npc.name,
      title: draft.title, description: draft.description, objective: draft.objective,
      target_kind: goal.kind === "room" ? "visit" : goal.kind, target_ref: goal.ref,
      reward_gold: reward, reward_xp: 15, escrow_gold: reward, status: "open",
      expires_at: new Date(now.getTime() + ASK_AGAIN_AFTER_DAYS * 24 * HOUR).toISOString(),
    }).select("id").single();
    if (!post) continue;
    purse -= reward;
    Object.assign(next, { asked_at: now.toISOString(), posted_quest_id: post.id, quest_title: draft.title });
    await admin.from("npc_journal").insert({
      npc_id: npc.id, kind: "deed", subject_kind: "self",
      summary: `Posted a notice on the town board: ${draft.objective}`,
      importance: 2, disclosure: 0, room: npc.room,
    });
  }

  if (purse !== npc.purse_gold) await admin.from("npcs").update({ purse_gold: Math.max(0, purse) }).eq("id", npc.id);
  return out;
}
