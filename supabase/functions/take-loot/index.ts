import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const lootId: string | undefined = body?.loot_id;

    const { data: profile } = await admin.from("profiles").select("id, username, gold, current_room").eq("id", user.id).maybeSingle();
    if (!profile) throw new Error("no profile");
    const room = profile.current_room;

    // Pull loot rows: a single loot_id, or everything in this room.
    const q = admin.from("room_loot").select("*").eq("room", room);
    const { data: piles } = lootId ? await q.eq("id", lootId) : await q;
    if (!piles || !piles.length) {
      return new Response(JSON.stringify({ ok: true, taken: 0, message: "Nothing to take." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let goldTotal = 0;
    const items: { item_key: string; quantity: number }[] = [];
    for (const p of piles as any[]) {
      goldTotal += p.gold ?? 0;
      if (p.item_key) items.push({ item_key: p.item_key, quantity: p.quantity ?? 1 });
    }

    if (goldTotal) {
      await admin.from("profiles").update({ gold: (profile.gold ?? 0) + goldTotal }).eq("id", user.id);
    }
    for (const it of items) {
      await admin.from("player_items").insert({ user_id: user.id, item_key: it.item_key, quantity: it.quantity });
    }

    await admin.from("room_loot").delete().in("id", (piles as any[]).map(p => p.id));

    const itemSummary = items.length ? `, ${items.map(i => `${i.item_key}×${i.quantity}`).join(", ")}` : "";
    await admin.from("messages").insert({
      room, author_name: "—", kind: "ambient",
      content: `*${profile.username} pockets the find.* (+${goldTotal}g${itemSummary})`,
      user_id: null,
    });

    return new Response(JSON.stringify({ ok: true, taken: piles.length, gold: goldTotal, items }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
