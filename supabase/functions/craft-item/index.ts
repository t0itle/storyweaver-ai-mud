// Craft an item at a station.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { abilityMod, abilityScores, check, dcForChance, LIFESKILL_ABILITY } from "../_shared/dice.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function xpForLevel(level: number) { return Math.floor(50 * Math.pow(level, 1.5)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauth" }, 401);
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: "unauth" }, 401);

    const body = await req.json().catch(() => ({}));
    const recipeKey = String(body?.recipe_key ?? "");
    const count = Math.max(1, Math.min(10, Number(body?.count ?? 1)));
    if (!recipeKey) return json({ error: "recipe_key required" }, 400);

    const [{ data: recipe }, { data: profile }] = await Promise.all([
      admin.from("recipes").select("*").eq("key", recipeKey).maybeSingle(),
      admin.from("profiles").select("current_room,username,str,dex,con,int,wis,cha").eq("id", user.id).maybeSingle(),
    ]);
    if (!recipe) return json({ error: "unknown recipe" }, 400);
    if (!profile) return json({ error: "no profile" }, 400);

    // Station present in room?
    const { data: station } = await admin.from("crafting_stations").select("*")
      .eq("room_slug", profile.current_room).eq("kind", recipe.station_kind).limit(1).maybeSingle();
    if (!station) return json({ error: `You need a ${recipe.station_kind.replace("_", " ")} to make this.` }, 400);

    // Learned or starter?
    if (!recipe.starter) {
      const { data: learned } = await admin.from("player_recipes").select("recipe_key")
        .eq("user_id", user.id).eq("recipe_key", recipeKey).maybeSingle();
      if (!learned) return json({ error: "You don't know that recipe." }, 400);
    }

    // Skill level
    const { data: skillRow } = await admin.from("player_lifeskills").select("level,xp")
      .eq("user_id", user.id).eq("skill", recipe.skill).maybeSingle();
    const level = skillRow?.level ?? 1;
    let xp = skillRow?.xp ?? 0;
    if (level < recipe.level_req) return json({ error: `Requires ${recipe.skill} lvl ${recipe.level_req}.` }, 400);

    const inputs = recipe.inputs as { item: string; qty: number }[];

    // Verify all inputs (× count)
    for (const inp of inputs) {
      const { data: stack } = await admin.from("player_items")
        .select("id, quantity")
        .eq("user_id", user.id).eq("item_key", inp.item).is("container_id", null);
      const total = (stack ?? []).reduce((s: number, r: any) => s + (r.quantity ?? 1), 0);
      if (total < inp.qty * count) return json({ error: `Need ${inp.qty * count}× ${inp.item.replace(/_/g, " ")}.` }, 400);
    }

    // Consume inputs
    for (const inp of inputs) {
      let need = inp.qty * count;
      const { data: stacks } = await admin.from("player_items")
        .select("id, quantity")
        .eq("user_id", user.id).eq("item_key", inp.item).is("container_id", null)
        .order("quantity", { ascending: true });
      for (const s of (stacks ?? [])) {
        if (need <= 0) break;
        const take = Math.min(s.quantity ?? 1, need);
        if ((s.quantity ?? 1) <= take) {
          await admin.from("player_items").delete().eq("id", s.id);
        } else {
          await admin.from("player_items").update({ quantity: (s.quantity ?? 1) - take }).eq("id", s.id);
        }
        need -= take;
      }
    }

    // Produce output (× count × output_qty). Quality crit: d100 vs a DC worth level% (max 50%),
    // plus 5% per point of the skill's ability modifier.
    const critChance = Math.min(0.5, level / 100);
    const produced = (recipe.output_qty ?? 1) * count;
    const critMod = 5 * abilityMod(abilityScores(profile as any)[LIFESKILL_ABILITY[recipe.skill] ?? "int"]);
    let quality = 0;
    for (let i = 0; i < count; i++) if (check({ die: 100, dc: dcForChance(critChance, 100), modifier: critMod }).success) quality++;

    const { data: outItem } = await admin.from("items").select("key,stackable").eq("key", recipe.output_item).maybeSingle();
    if (!outItem) return json({ error: "output item missing" }, 500);
    if (outItem.stackable) {
      const { data: existing } = await admin.from("player_items").select("id,quantity")
        .eq("user_id", user.id).eq("item_key", recipe.output_item).is("container_id", null).limit(1).maybeSingle();
      if (existing) {
        await admin.from("player_items").update({ quantity: (existing.quantity ?? 1) + produced }).eq("id", existing.id);
      } else {
        await admin.from("player_items").insert({ user_id: user.id, item_key: recipe.output_item, quantity: produced });
      }
    } else {
      for (let i = 0; i < produced; i++) {
        await admin.from("player_items").insert({ user_id: user.id, item_key: recipe.output_item, quantity: 1 });
      }
    }

    // XP + level
    const xpGain = (recipe.xp_reward ?? 10) * count;
    xp += xpGain;
    let newLevel = level;
    while (xp >= xpForLevel(newLevel) && newLevel < 50) {
      xp -= xpForLevel(newLevel); newLevel += 1;
    }
    await admin.from("player_lifeskills").upsert(
      { user_id: user.id, skill: recipe.skill, level: newLevel, xp, updated_at: new Date().toISOString() },
      { onConflict: "user_id,skill" }
    );

    await admin.from("messages").insert({
      room: profile.current_room, user_id: null, author_name: "—", kind: "system",
      content: `${profile.username} crafts ${produced}× ${recipe.name}${quality ? ` (${quality} of fine quality)` : ""}.`
    });

    return json({ ok: true, produced, quality, xp_gained: xpGain, level: newLevel, xp, leveled: newLevel > level });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
