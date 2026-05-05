import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  action: "equip" | "unequip" | "use" | "drop" | "give" | "store" | "take";
  player_item_id?: string;
  slot?: string;            // for equip
  target_username?: string; // for give
  container_id?: string | null; // for store/take
};

const ok = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return ok({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ok({ error: "Unauthorized" }, 401);

    const body = await req.json() as Body;
    const { action } = body;

    const loadItem = async (id: string) => {
      const { data: pi } = await admin.from("player_items").select("*, items(*)").eq("id", id).maybeSingle();
      if (!pi || pi.user_id !== user.id) throw new Error("Item not found");
      return pi as any;
    };

    if (action === "equip") {
      const pi = await loadItem(body.player_item_id!);
      const desired = body.slot ?? pi.items.slot;
      const EQUIP_SLOTS = ["head","neck","body","legs","feet","main_hand","off_hand","ring","focus"];
      if (!EQUIP_SLOTS.includes(desired)) throw new Error(`Cannot equip in slot ${desired}`);
      await admin.from("player_items").update({ equipped_slot: null })
        .eq("user_id", user.id).eq("equipped_slot", desired);
      await admin.from("player_items").update({ equipped_slot: desired }).eq("id", pi.id);
      return ok({ ok: true, message: `You equip the ${pi.items.name}.` });
    }

    if (action === "unequip") {
      const pi = await loadItem(body.player_item_id!);
      await admin.from("player_items").update({ equipped_slot: null }).eq("id", pi.id);
      return ok({ ok: true, message: `You stow the ${pi.items.name}.` });
    }

    if (action === "use") {
      const pi = await loadItem(body.player_item_id!);
      const it = pi.items;
      if (it.slot !== "consumable") throw new Error("That cannot be used.");
      const heal = it.heal_amount ?? 0;
      const { data: profile } = await admin.from("profiles").select("hp,max_hp").eq("id", user.id).maybeSingle();
      const newHp = Math.min((profile?.max_hp ?? 20), (profile?.hp ?? 0) + heal);
      await admin.from("profiles").update({ hp: newHp }).eq("id", user.id);
      // decrement quantity
      if ((pi.quantity ?? 1) > 1) {
        await admin.from("player_items").update({ quantity: pi.quantity - 1 }).eq("id", pi.id);
      } else {
        await admin.from("player_items").delete().eq("id", pi.id);
      }
      return ok({ ok: true, message: heal > 0 ? `You consume the ${it.name}. (+${heal} HP)` : `You consume the ${it.name}.` });
    }

    if (action === "drop") {
      const pi = await loadItem(body.player_item_id!);
      const { data: profile } = await admin.from("profiles").select("current_room,username").eq("id", user.id).maybeSingle();
      await admin.from("player_items").delete().eq("id", pi.id);
      await admin.from("messages").insert({
        room: profile!.current_room, user_id: null, author_name: "—", kind: "system",
        content: `${profile!.username} drops a ${pi.items.name}.`,
      });
      return ok({ ok: true, message: `You drop the ${pi.items.name}.` });
    }

    if (action === "store" || action === "take") {
      const pi = await loadItem(body.player_item_id!);
      await admin.from("player_items").update({ container_id: action === "store" ? body.container_id : null }).eq("id", pi.id);
      return ok({ ok: true, message: action === "store" ? `You stow the ${pi.items.name}.` : `You take out the ${pi.items.name}.` });
    }

    return ok({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return ok({ error: e instanceof Error ? e.message : "error" }, 400);
  }
});
