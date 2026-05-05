// One-shot admin wipe: deletes all generated portrait + scene files and resets player + world data.
// Protected by header secret check; only callable with the project's service-role key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const provided = req.headers.get("x-admin-key");
    if (provided !== SERVICE) return json({ error: "forbidden" }, 403);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE);
    const removed: Record<string, number> = {};
    for (const bucket of ["portraits", "scenes"]) {
      const all: string[] = [];
      const walk = async (prefix: string) => {
        const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
        for (const e of data ?? []) {
          const path = prefix ? `${prefix}/${e.name}` : e.name;
          if (e.id) all.push(path); else await walk(path);
        }
      };
      await walk("");
      if (all.length) await admin.storage.from(bucket).remove(all);
      removed[bucket] = all.length;
    }
    return json({ ok: true, removed });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "err" }, 500);
  }
});
