// Scrapes worldforge-collective lore pages and upserts into lore_entries.
// Hardcoded URL list — extend as new entries are published.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LORE_URLS: { slug: string; url: string }[] = [
  { slug: "solastin", url: "https://worldforge-collective.lovable.app/" },
  // add more as published, e.g.:
  // { slug: "umbros", url: "https://worldforge-collective.lovable.app/umbros" },
];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string, fallback: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(h1[1]);
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  return t ? stripHtml(t[1]) : fallback;
}

function deriveKeywords(title: string, content: string): string[] {
  const words = new Set<string>();
  words.add(title.toLowerCase().split(/[,\s]+/)[0]);
  // Extract Capitalized Proper Nouns from content
  const matches = content.match(/\b[A-Z][a-z]{3,}\b/g) ?? [];
  for (const m of matches.slice(0, 50)) words.add(m.toLowerCase());
  return [...words].filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: Array<{ slug: string; ok: boolean; title?: string; error?: string }> = [];

    for (const { slug, url } of LORE_URLS) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": "EmberHold-Loremaster/1.0" } });
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        const html = await r.text();
        const title = extractTitle(html, slug);
        const text = stripHtml(html);
        // Trim Vite/Lovable shell noise: keep meaningful chunk
        const content = text.length > 400 ? text : text;
        const summary = content.split(/.\s/).slice(0, 2).join(". ").slice(0, 280);
        const keywords = deriveKeywords(title, content);

        const { error } = await supabase.from("lore_entries").upsert({
          slug, title, source_url: url, summary, content, keywords,
          updated_at: new Date().toISOString(),
        }, { onConflict: "slug" });
        if (error) throw error;
        results.push({ slug, ok: true, title });
      } catch (e) {
        results.push({ slug, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ synced: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
