import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return j({ error: "Unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);

    const { action, artifact_key } = await req.json().catch(() => ({}));
    const { data: profile } = await admin.from("profiles")
      .select("id, username, current_room, gold, merit").eq("id", user.id).maybeSingle();
    if (!profile) return j({ error: "no profile" }, 404);

    if (action === "list") {
      const [{ data: catalog }, { data: owned }] = await Promise.all([
        admin.from("speaker_artifacts").select("*").order("name"),
        admin.from("player_speaker_artifacts").select("*").eq("user_id", user.id),
      ]);
      return j({ ok: true, catalog: catalog ?? [], owned: owned ?? [], current_room: profile.current_room });
    }

    if (!artifact_key) return j({ error: "artifact_key required" }, 400);
    const { data: art } = await admin.from("speaker_artifacts").select("*").eq("key", artifact_key).maybeSingle();
    if (!art) return j({ error: "unknown artifact" }, 404);

    const { data: existing } = await admin.from("player_speaker_artifacts")
      .select("*").eq("user_id", user.id).eq("artifact_key", artifact_key).maybeSingle();

    // ---------- CLAIM (wild) ----------
    if (action === "claim") {
      if (existing) return j({ error: "Already in your keeping." }, 400);
      if (art.holder_kind !== "wild") return j({ error: "This artifact is held — you must steal or earn it." }, 400);
      if (profile.current_room !== art.home_room) return j({ error: "Not here." }, 400);
      await admin.from("player_speaker_artifacts").insert({
        user_id: user.id, artifact_key, source: "found", charges_remaining: art.charges_max,
      });
      await admin.from("messages").insert({
        room: profile.current_room, author_name: "—", kind: "ambient", user_id: null,
        content: `*${profile.username} lifts **${art.name}** from where it lay. The room seems to hold its breath.*`,
      });
      await admin.from("world_events").insert({
        kind: "artifact_found", room: profile.current_room,
        actor_id: user.id, actor_name: profile.username,
        target_kind: "artifact", target_name: art.name,
        details: { artifact: art.key, source: "found" },
      });
      return j({ ok: true, action: "claim" });
    }

    // ---------- STEAL ----------
    if (action === "steal") {
      if (existing) return j({ error: "Already yours." }, 400);
      if (art.holder_kind === "wild") return j({ error: "Nothing to steal — just claim it." }, 400);
      if (profile.current_room !== art.home_room) return j({ error: "Not where the holder keeps it." }, 400);
      await admin.from("player_speaker_artifacts").insert({
        user_id: user.id, artifact_key, source: "stolen", charges_remaining: art.charges_max,
      });
      // big rep hit on every town if stealing from Veiled (they speak for the Speaker), or on the aether's town if aether
      if (art.holder_kind === "veiled") {
        const { data: towns } = await admin.from("towns").select("key");
        for (const t of towns ?? []) {
          await admin.from("player_town_rep").upsert({
            user_id: user.id, town_key: t.key, score: -art.rep_penalty_steal, updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,town_key" });
        }
      } else if (art.holder_kind === "aether") {
        const { data: town } = await admin.from("towns").select("key").eq("aether_key", art.holder_ref).maybeSingle();
        if (town) {
          await admin.from("player_town_rep").upsert({
            user_id: user.id, town_key: town.key, score: -art.rep_penalty_steal * 2, updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,town_key" });
        }
      }
      await admin.from("messages").insert({
        room: profile.current_room, author_name: "—", kind: "ambient", user_id: null,
        content: `*Alarm: ${profile.username} has taken **${art.name}**. Word will travel.*`,
      });
      await admin.from("world_events").insert({
        kind: "artifact_stolen", room: profile.current_room,
        actor_id: user.id, actor_name: profile.username,
        target_kind: "artifact", target_name: art.name,
        details: { artifact: art.key, holder_kind: art.holder_kind, holder_ref: art.holder_ref },
      });
      return j({ ok: true, action: "steal" });
    }

    // ---------- EARN ----------
    if (action === "earn") {
      if (existing) return j({ error: "Already yours." }, 400);
      if (art.holder_kind === "wild") return j({ error: "There is no holder to earn this from." }, 400);
      if (profile.current_room !== art.home_room) return j({ error: "Not where the holder is." }, 400);
      if ((profile.merit ?? 0) < art.merit_required_earn) {
        return j({ error: `Your renown is too small. You need Merit ${art.merit_required_earn}.` }, 400);
      }
      await admin.from("player_speaker_artifacts").insert({
        user_id: user.id, artifact_key, source: "gifted", charges_remaining: art.charges_max,
      });
      await admin.from("messages").insert({
        room: profile.current_room, author_name: "—", kind: "ambient", user_id: null,
        content: `*${profile.username} is given **${art.name}** with both hands. The gift is witnessed.*`,
      });
      await admin.from("world_events").insert({
        kind: "artifact_gifted", room: profile.current_room,
        actor_id: user.id, actor_name: profile.username,
        target_kind: "artifact", target_name: art.name,
        details: { artifact: art.key },
      });
      return j({ ok: true, action: "earn" });
    }

    // ---------- USE CHARGE ----------
    if (action === "use") {
      if (!existing) return j({ error: "You do not carry this." }, 400);
      if ((existing.charges_remaining ?? 0) <= 0) return j({ error: "Its word has already been spoken." }, 400);
      await admin.from("player_speaker_artifacts").update({
        charges_remaining: existing.charges_remaining - 1,
      }).eq("user_id", user.id).eq("artifact_key", artifact_key);
      await admin.from("messages").insert({
        room: profile.current_room, author_name: profile.username, kind: "emote", user_id: user.id,
        content: `speaks the word of **${art.name}** — *${art.active_blurb}*`,
      });
      await admin.from("world_events").insert({
        kind: "artifact_spoken", room: profile.current_room,
        actor_id: user.id, actor_name: profile.username,
        target_kind: "artifact", target_name: art.name,
        details: { artifact: art.key, active: art.active_name },
      });
      return j({ ok: true, action: "use" });
    }

    return j({ error: "unknown action" }, 400);
  } catch (e) {
    return j({ error: String(e?.message ?? e) }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
