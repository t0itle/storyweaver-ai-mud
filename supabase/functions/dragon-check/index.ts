// Dragon aggro: large gold hoards may wake a sleeping dragon.
// Called by world-tick (and could be called after large gold transfers).
// No auth required — internal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAYER_GOLD_THRESHOLD = 500;
const ROOM_GOLD_THRESHOLD = 2000;
const COOLDOWN_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find sleeping dragons (no current_room and either never woken or off cooldown).
    const cooldownIso = new Date(Date.now() - COOLDOWN_HOURS * 3600 * 1000).toISOString();
    const { data: sleeping } = await admin.from("dragons")
      .select("*").is("current_room", null);
    const wakeable = (sleeping ?? []).filter((d: any) =>
      !d.last_woken_at || d.last_woken_at < cooldownIso
    );
    if (!wakeable.length) {
      return new Response(JSON.stringify({ ok: true, woke: 0, reason: "no wakeable dragons" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find candidate hoards: rich rooms (sum of player gold) or rich players.
    const { data: profiles } = await admin.from("profiles").select("id, username, gold, current_room");
    const roomTotals = new Map<string, { total: number; richest: { name: string; gold: number; id: string } | null }>();
    let topPlayer: { id: string; username: string; gold: number; room: string } | null = null;
    for (const p of profiles ?? []) {
      const room = p.current_room;
      if (!room) continue;
      const cur = roomTotals.get(room) ?? { total: 0, richest: null };
      cur.total += p.gold ?? 0;
      if (!cur.richest || (p.gold ?? 0) > cur.richest.gold) {
        cur.richest = { name: p.username, gold: p.gold ?? 0, id: p.id };
      }
      roomTotals.set(room, cur);
      if (!topPlayer || (p.gold ?? 0) > topPlayer.gold) {
        topPlayer = { id: p.id, username: p.username, gold: p.gold ?? 0, room };
      }
    }

    let candidateRoom: string | null = null;
    let actorId: string | null = null;
    let trigger = "";
    for (const [room, info] of roomTotals) {
      if (info.total >= ROOM_GOLD_THRESHOLD) {
        candidateRoom = room;
        actorId = info.richest?.id ?? null;
        trigger = `room hoard of ${info.total}g`;
        break;
      }
    }
    if (!candidateRoom && topPlayer && topPlayer.gold >= PLAYER_GOLD_THRESHOLD) {
      candidateRoom = topPlayer.room;
      actorId = topPlayer.id;
      trigger = `${topPlayer.username} carries ${topPlayer.gold}g`;
    }

    if (!candidateRoom) {
      return new Response(JSON.stringify({ ok: true, woke: 0, reason: "no hoard large enough" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Weighted roll — 25% chance per check that ANY dragon stirs.
    if (Math.random() > 0.25) {
      return new Response(JSON.stringify({ ok: true, woke: 0, reason: "rolled to slumber" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const dragon = wakeable[Math.floor(Math.random() * wakeable.length)];
    const nowIso = new Date().toISOString();

    await admin.from("dragons").update({
      current_room: candidateRoom,
      hoard_target_room: candidateRoom,
      last_woken_at: nowIso,
    }).eq("key", dragon.key);

    // Spawn an actual fightable boss NPC for this dragon (or revive an existing one in the new room).
    const { data: existing } = await admin.from("npcs")
      .select("id")
      .eq("name", dragon.name)
      .eq("is_boss", true)
      .maybeSingle();

    const bossPayload = {
      name: dragon.name,
      title: dragon.epithet,
      persona: dragon.personality || `An ancient dragon, wrathful and cruel. ${dragon.epithet}.`,
      greeting: `*${dragon.name} fixes you with a slit-pupiled stare. The room shudders.*`,
      room: candidateRoom,
      home_room: candidateRoom,
      is_boss: true,
      aggro_on_sight: true,
      combat_max_hp: 640,
      combat_damage_min: 20,
      combat_damage_max: 40,
      base_armor: 7,
      str: 22, dex: 12, con: 22, level: 17,
      boss_reward_gold: 8000,
      boss_reward_xp: 7000,
      boss_reward_merit: 350,
      boss_intro: `*${dragon.name}, ${dragon.epithet}, uncoils from the hoard. Wings unfurl with the sound of tearing sky. The air sears. Combat is upon you.*`,
      dead_until: null as string | null,
    };

    if (existing?.id) {
      await admin.from("npcs").update(bossPayload).eq("id", existing.id);
    } else {
      await admin.from("npcs").insert(bossPayload);
    }

    await admin.from("world_events").insert({
      kind: "dragon_stirs",
      actor_name: dragon.name,
      target_name: dragon.name,
      actor_id: actorId,
      room: candidateRoom,
      details: { epithet: dragon.epithet, trigger, dragon_key: dragon.key },
      decay_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });

    await admin.from("messages").insert({
      room: candidateRoom,
      author_name: "—",
      kind: "system",
      content: `✦ The sky darkens. **${dragon.name}, ${dragon.epithet}** has caught the scent of gold.`,
      user_id: null,
    });

    // Nearby NPCs react to the dragon by persona.
    const { data: witnesses } = await admin.from("npcs")
      .select("name, title, persona, is_guard, is_warden, is_aether, is_boss, faction")
      .eq("room", candidateRoom)
      .or(`dead_until.is.null,dead_until.lte.${new Date().toISOString()}`)
      .limit(6);

    const reactions: { room: string; author_name: string; kind: string; content: string; user_id: null }[] = [];
    for (const n of witnesses ?? []) {
      if (n.is_boss) continue; // don't have the dragon react to itself
      const persona = ((n.persona ?? "") + " " + (n.title ?? "")).toLowerCase();
      let line: string;
      if (n.is_aether) {
        line = `*${n.name} rises from the throne, voice like a bell struck once: "Wyrm. You dare, in my house?"*`;
      } else if (n.is_warden || n.is_guard || /guard|watch|soldier|knight|warden|captain/.test(persona)) {
        line = `*${n.name} draws steel and sets between you and the shadow. "Stand behind me. NOW."*`;
      } else if (/priest|veil|speaker|monk|acolyte|cleric/.test(persona)) {
        line = `*${n.name} covers their mouth and drops to their knees, whispering a name no tongue should shape.*`;
      } else if (n.faction === "chaos" || /cult|shadow|unspoken|serviam/.test(persona)) {
        line = `*${n.name} smiles wide and kneels, palms up. "At last. At last."*`;
      } else if (/merchant|trader|vendor|shopkeep|fence|innkeep/.test(persona)) {
        line = `*${n.name} slams the coinbox shut and bolts for the back door, coppers scattering.*`;
      } else if (/child|beggar|urchin|farmer|peasant|servant/.test(persona)) {
        line = `*${n.name} freezes, then flees weeping, small hands over their head.*`;
      } else {
        line = `*${n.name} goes very still, breath caught, watching the sky.*`;
      }
      reactions.push({ room: candidateRoom, author_name: "—", kind: "ambient", content: line, user_id: null });
    }
    if (reactions.length) {
      await admin.from("messages").insert(reactions);
    }

    return new Response(JSON.stringify({ ok: true, woke: 1, dragon: dragon.key, room: candidateRoom, trigger }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
