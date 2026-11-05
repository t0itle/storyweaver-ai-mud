// One place to call the AI gateway for background "brains" (the Seven today; others later).
// Swapping the provider or pointing a job at a self-hosted small model is a change here only.
// (Player-facing functions such as npc-respond still call the gateway directly.)
export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const DIRECTOR_MODEL = "google/gemini-2.5-flash";

/** Returns the model's text reply, or throws with the HTTP status on failure. */
export async function chat(system: string, user: string, model = DIRECTOR_MODEL): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}
