import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const newName = String(body?.name ?? "").trim().slice(0, 32);

  if (newName.length < 2) {
    return new Response(JSON.stringify({ error: "A name needs at least two letters." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check uniqueness
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", newName)
    .neq("id", user.id)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ error: "That name is already claimed by another walker." }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ username: newName, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, name: newName }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
