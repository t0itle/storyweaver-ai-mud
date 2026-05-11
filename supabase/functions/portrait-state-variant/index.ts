// Renders a wound-state variant of the player's portrait, cached in profiles.portrait_variants
// Cache key: "{state}:{kind}" (e.g. "bloodied:fire", "wounded:physical")
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type State = "scratched" | "wounded" | "bloodied";
type Kind = "physical" | "fire" | "cold" | "arcane" | "shadow" | "holy" | "poison";

const STATE_PROMPT: Record<State, string> = {
  scratched: "Add light wear to the subject's face and visible skin: a fresh shallow cut on the cheek or brow with a thin trickle of blood, faint dirt smudges, slightly disheveled hair, tired eyes. Subtle and recent — not yet a serious wound.",
  wounded: "The subject is clearly hurt: a bandaged or bleeding gash across the brow or jaw, dried blood streaks down the cheek, split lip, dust and grime on the face and clothing, a rip in the visible garment, a hardened pained expression. Mid-fight wear.",
  bloodied: "The subject is gravely wounded and barely standing: heavy fresh blood across the face and neck, one eye swollen or shadowed, deep gashes, torn clothing, soot-stained skin, sweat-matted hair, hollow exhausted stare, clenched bloody teeth. They look near death but unbroken.",
};

const KIND_OVERLAY: Record<Kind, string> = {
  physical: "Wounds are cuts, bruises, and impact marks from blade and fist.",
  fire: "Add scorched skin, blackened soot streaks, blistered patches and singed hair edges. Faint ember glow where the burns are deepest.",
  cold: "Add frost-bitten patches on the skin, blue-grey lips and fingertips, ice crystals in the hair and on the eyelashes, breath fogging in cold air.",
  arcane: "Add faintly glowing rune-burns etched into the skin, pale violet cracks of light running across the wounds, hair lifted slightly as if by static.",
  shadow: "Add inky black veins creeping out from the wounds, smoke-like wisps clinging to the skin, eyes ringed with darkness as if something is feeding from within.",
  holy: "Add searing white burn-marks shaped like sigils on the wounds, golden afterglow around the cuts, hair faintly windblown as if struck by light.",
  poison: "Add sickly green-purple bruising spreading from the wounds, sweating skin with a yellowish cast, dark veins around the eyes and mouth.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as { state?: string; kind?: string; force?: boolean };
    const state = (body.state ?? "wounded") as State;
    if (!["scratched", "wounded", "bloodied"].includes(state)) {
      return json({ error: "Invalid state" }, 400);
    }

    const { data: profile } = await admin.from("profiles")
      .select("portrait_url, portrait_variants, last_damage_kind, race, char_description")
      .eq("id", user.id).maybeSingle();
    if (!profile?.portrait_url) return json({ error: "No base portrait" }, 400);

    const kind = (body.kind ?? profile.last_damage_kind ?? "physical") as Kind;
    const safeKind: Kind = (["physical", "fire", "cold", "arcane", "shadow", "holy", "poison"]
      .includes(kind) ? kind : "physical") as Kind;

    const cacheKey = `${state}:${safeKind}`;
    const variants = (profile.portrait_variants as Record<string, string>) ?? {};
    if (!body.force && variants[cacheKey]) {
      return json({ portrait_url: variants[cacheKey], cached: true, state, kind: safeKind });
    }

    const desc = (profile.char_description ?? "").trim().slice(0, 300);
    const prompt = `Repaint this exact character portrait to show their CURRENT physical condition after combat. Keep the same face, race, hair color, skin tone, body shape, age, framing, painterly oil-painted style, and existing clothing/armor — only add the wounds described below.

Subject self-description: ${desc || "a wanderer"}.

WOUND STATE (${state}):
${STATE_PROMPT[state]}

DAMAGE TYPE (${safeKind}):
${KIND_OVERLAY[safeKind]}

Do NOT change the gear, do NOT change the pose, do NOT change the background. Only the face, exposed skin, hair condition, and expression should reflect the injuries. Keep the parchment-and-ember palette, dramatic warm rim light. No text, no logo.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: profile.portrait_url } },
          ],
        }],
        modalities: ["image", "text"],
      }),
    });
    if (aiRes.status === 429) return json({ error: "Too busy. Try again in a moment.", fallback: true }, 200);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted.", fallback: true }, 200);
    if (!aiRes.ok) {
      console.error("AI error", aiRes.status, await aiRes.text());
      return json({ error: "Image generation failed", fallback: true }, 200);
    }
    const aiData = await aiRes.json();
    let dataUrl: string | undefined = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image/")) {
      console.warn("No image on first try, retrying once");
      const retry = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt + "\n\nReturn the repainted image only, no text." },
              { type: "image_url", image_url: { url: profile.portrait_url } },
            ],
          }],
          modalities: ["image", "text"],
        }),
      });
      if (retry.ok) {
        const rd = await retry.json();
        dataUrl = rd.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      }
    }
    if (!dataUrl?.startsWith("data:image/")) {
      return json({ error: "No image returned", fallback: true, portrait_url: profile.portrait_url }, 200);
    }

    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(image\/[a-z]+)/)?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1];
    const path = `${user.id}/portrait-${state}-${safeKind}-${Date.now()}.${ext}`;

    const up = await admin.storage.from("portraits").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw up.error;
    const { data: pub } = admin.storage.from("portraits").getPublicUrl(path);

    const newVariants = { ...variants, [cacheKey]: pub.publicUrl };
    await admin.from("profiles").update({ portrait_variants: newVariants }).eq("id", user.id);

    return json({ portrait_url: pub.publicUrl, cached: false, state, kind: safeKind });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
