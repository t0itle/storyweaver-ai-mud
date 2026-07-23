// Gather from a resource node in the current room.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Yield = { item: string; weight: number; qty: [number, number] };

function pickWeighted(list: Yield[]): Yield {
  const total = list.reduce((s, y) => s + y.weight, 0);
  let r = Math.random() * total;
  for (const y of list) { r -= y.weight; if (r <= 0) return y; }
  return list[list.length - 1];
}

function xpForLevel(level: number) { return Math.floor(50 * Math.pow(level, 1.5)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauth" }, 401);
    const user_client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await user_client.auth.getUser();
    if (!user) return json({ error: "unauth" }, 401);

    const body = await req.json().catch(() => ({}));
    const nodeId = String(body?.node_id ?? "");
    if (!nodeId) return json({ error: "node_id required" }, 400);

    const { data: node } = await admin.from("resource_nodes").select("*").eq("id", nodeId).maybeSingle();
    if (!node) return json({ error: "node missing" }, 404);

    const { data: profile } = await admin.from("profiles").select("current_room,username").eq("id", user.id).maybeSingle();
    if (!profile) return json({ error: "no profile" }, 400);
    if (profile.current_room !== node.room_slug) return json({ error: "You're not near that." }, 400);
    if (node.depleted_until && new Date(node.depleted_until).getTime() > Date.now()) {
      return json({ error: "The node is spent. It needs time." }, 400);
    }

    // Tool check
    if (node.requires_tool) {
      const { data: tool } = await admin.from("player_items").select("id, items!inner(key)")
        .eq("user_id", user.id).eq("items.key", node.requires_tool).limit(1);
      if (!tool || tool.length === 0) {
        return json({ error: `You need a ${node.requires_tool.replace("tool_", "").replace(/_/g, " ")}.` }, 400);
      }
    }

    // Skill level
    const { data: skillRow } = await admin.from("player_lifeskills").select("level,xp")
      .eq("user_id", user.id).eq("skill", node.skill).maybeSingle();
    const level = skillRow?.level ?? 1;
    const xp = skillRow?.xp ?? 0;

    // Roll 1-3 pulls scaled by level
    const pulls = 1 + Math.floor(Math.random() * 2) + Math.floor(level / 15);
    const gained: Record<string, number> = {};
    const yields = node.yields as Yield[];
    for (let i = 0; i < pulls; i++) {
      const y = pickWeighted(yields);
      const q = y.qty[0] + Math.floor(Math.random() * (y.qty[1] - y.qty[0] + 1));
      gained[y.item] = (gained[y.item] ?? 0) + q;
    }

    // Grant items (stack)
    for (const [key, qty] of Object.entries(gained)) {
      const { data: it } = await admin.from("items").select("key,stackable,max_stack").eq("key", key).maybeSingle();
      if (!it) continue;
      if (it.stackable) {
        const { data: existing } = await admin.from("player_items").select("id,quantity")
          .eq("user_id", user.id).eq("item_key", key).is("container_id", null).limit(1).maybeSingle();
        if (existing) {
          await admin.from("player_items").update({ quantity: (existing.quantity ?? 1) + qty }).eq("id", existing.id);
        } else {
          await admin.from("player_items").insert({ user_id: user.id, item_key: key, quantity: qty });
        }
      } else {
        for (let i = 0; i < qty; i++) {
          await admin.from("player_items").insert({ user_id: user.id, item_key: key, quantity: 1 });
        }
      }
    }

    // XP + level
    const xpGain = 5 + Math.floor(Math.random() * 6);
    let newXp = xp + xpGain;
    let newLevel = level;
    while (newXp >= xpForLevel(newLevel) && newLevel < 50) {
      newXp -= xpForLevel(newLevel);
      newLevel += 1;
    }
    await admin.from("player_lifeskills").upsert(
      { user_id: user.id, skill: node.skill, level: newLevel, xp: newXp, updated_at: new Date().toISOString() },
      { onConflict: "user_id,skill" }
    );

    // Deplete
    await admin.from("resource_nodes").update({
      depleted_until: new Date(Date.now() + (node.respawn_seconds ?? 900) * 1000).toISOString()
    }).eq("id", node.id);

    // Room message
    const names = Object.entries(gained).map(([k, q]) => `${q}× ${k.replace(/^(herb_|ore_|gem_|fish_|mushroom_|wood_|salt_|reagent_)/, "").replace(/_/g, " ")}`).join(", ");
    await admin.from("messages").insert({
      room: profile.current_room, user_id: null, author_name: "—", kind: "system",
      content: `${profile.username} gathers ${names}.`
    });

    return json({
      ok: true, gained, xp_gained: xpGain, level: newLevel, xp: newXp,
      leveled: newLevel > level,
      depleted_until: new Date(Date.now() + (node.respawn_seconds ?? 900) * 1000).toISOString()
    });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
