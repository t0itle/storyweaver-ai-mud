// Learn a recipe from a scroll item in inventory.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// scroll key convention: scroll_recipe_<recipe_suffix>
const SCROLL_MAP: Record<string, string> = {
  scroll_recipe_hearty_stew: "recipe_hearty_stew",
  scroll_recipe_herb_pie: "recipe_herb_pie",
  scroll_recipe_greater_heal: "recipe_potion_greater_heal",
  scroll_recipe_iron_shortsword: "recipe_iron_shortsword",
  scroll_recipe_iron_helm: "recipe_iron_helm",
};

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

    const { player_item_id } = await req.json().catch(() => ({}));
    if (!player_item_id) return json({ error: "player_item_id required" }, 400);

    const { data: pi } = await admin.from("player_items").select("id,item_key,quantity,user_id").eq("id", player_item_id).maybeSingle();
    if (!pi || pi.user_id !== user.id) return json({ error: "not yours" }, 400);
    const recipeKey = SCROLL_MAP[pi.item_key];
    if (!recipeKey) return json({ error: "not a recipe scroll" }, 400);

    const { data: existing } = await admin.from("player_recipes").select("recipe_key")
      .eq("user_id", user.id).eq("recipe_key", recipeKey).maybeSingle();
    if (existing) return json({ error: "You already know this recipe." }, 400);

    await admin.from("player_recipes").insert({ user_id: user.id, recipe_key: recipeKey });

    // consume 1
    if ((pi.quantity ?? 1) > 1) {
      await admin.from("player_items").update({ quantity: pi.quantity - 1 }).eq("id", pi.id);
    } else {
      await admin.from("player_items").delete().eq("id", pi.id);
    }

    const { data: recipe } = await admin.from("recipes").select("name").eq("key", recipeKey).maybeSingle();
    return json({ ok: true, learned: recipeKey, message: `You learn the recipe for ${recipe?.name ?? recipeKey}.` });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
