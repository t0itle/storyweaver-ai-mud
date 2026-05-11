// Spend a talent point on a skill node — validates gating + balance.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const nodeKey = String(body?.node_key ?? "").trim();
    if (!nodeKey) return new Response(JSON.stringify({ error: "node_key required" }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: node }, { data: profile }, { data: owned }] = await Promise.all([
      admin.from("skill_nodes").select("key, branch, tier").eq("key", nodeKey).maybeSingle(),
      admin.from("profiles").select("talent_points, username").eq("id", user.id).maybeSingle(),
      admin.from("player_skills").select("node_key").eq("user_id", user.id),
    ]);

    if (!node) return new Response(JSON.stringify({ error: "unknown node" }), { status: 400, headers: corsHeaders });
    if (!profile) return new Response(JSON.stringify({ error: "no profile" }), { status: 400, headers: corsHeaders });

    const ownedKeys = new Set((owned ?? []).map((r: any) => r.node_key));
    if (ownedKeys.has(nodeKey)) {
      return new Response(JSON.stringify({ error: "already taken" }), { status: 400, headers: corsHeaders });
    }
    if ((profile.talent_points ?? 0) < 1) {
      return new Response(JSON.stringify({ error: "no talent points" }), { status: 400, headers: corsHeaders });
    }

    // Gating: how many points already in this branch?
    const { data: branchNodes } = await admin
      .from("skill_nodes").select("key, tier").eq("branch", node.branch);
    const inBranch = (branchNodes ?? []).filter((n: any) => ownedKeys.has(n.key));
    const inBranchCount = inBranch.length;
    const inLowerTiers = inBranch.filter((n: any) => n.tier < node.tier).length;

    let needLower = 0;
    if (node.tier === 2) needLower = 1;
    else if (node.tier === 3) needLower = 2;
    else if (node.tier === 4) needLower = 5;

    if (node.tier === 4) {
      if (inBranchCount < 5) {
        return new Response(JSON.stringify({ error: `requires 5 talents in this branch (${inBranchCount}/5)` }), { status: 400, headers: corsHeaders });
      }
    } else if (inLowerTiers < needLower) {
      return new Response(JSON.stringify({ error: `requires ${needLower} talent(s) in earlier tiers of this branch` }), { status: 400, headers: corsHeaders });
    }

    // Spend
    const { error: insErr } = await admin.from("player_skills").insert({ user_id: user.id, node_key: nodeKey });
    if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: corsHeaders });

    const { error: updErr } = await admin.from("profiles")
      .update({ talent_points: (profile.talent_points ?? 0) - 1 })
      .eq("id", user.id);
    if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: corsHeaders });

    return new Response(JSON.stringify({ ok: true, node_key: nodeKey, talent_points: (profile.talent_points ?? 0) - 1 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
