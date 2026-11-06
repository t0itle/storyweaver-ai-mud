// RETIRED. The codex (lore_entries) is now generated from the EverBloom wiki pages in
// everbloom-lore/ by scripts/build-lore.mjs (→ drizzle/migrations/0009_lore_from_wiki.sql).
// This function used to scrape worldforge-collective.lovable.app, a client-rendered site whose
// HTML holds no lore, so it could only overwrite real entries with an empty shell. It now does nothing.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({
    retired: true,
    message: "Lore now comes from everbloom-lore/ via scripts/build-lore.mjs; nothing was synced.",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
