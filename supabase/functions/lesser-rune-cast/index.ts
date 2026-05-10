// Edge function: validates a traced lesser rune cast.
// Re-runs the $1 unistroke recognizer server-side to prevent client tampering.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Pt = [number, number];

const N = 64;
const HALF_DIAGONAL = 0.5 * Math.SQRT2;
const ANGLE_RANGE = (45 * Math.PI) / 180;
const ANGLE_PRECISION = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5));
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pathLength(pts: Pt[]) { let d = 0; for (let i = 1; i < pts.length; i++) d += dist(pts[i-1], pts[i]); return d; }
function resample(points: Pt[], n: number): Pt[] {
  if (points.length < 2) return points.slice();
  const I = pathLength(points) / (n - 1); let D = 0;
  const out: Pt[] = [points[0]]; const pts = points.slice();
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i-1], pts[i]);
    if (D + d >= I) {
      const qx = pts[i-1][0] + ((I-D)/d) * (pts[i][0] - pts[i-1][0]);
      const qy = pts[i-1][1] + ((I-D)/d) * (pts[i][1] - pts[i-1][1]);
      const q: Pt = [qx, qy]; out.push(q); pts.splice(i, 0, q); D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}
function centroid(pts: Pt[]): Pt { let x=0,y=0; for (const p of pts){x+=p[0];y+=p[1];} return [x/pts.length, y/pts.length]; }
function indicativeAngle(pts: Pt[]) { const c = centroid(pts); return Math.atan2(c[1]-pts[0][1], c[0]-pts[0][0]); }
function rotateBy(pts: Pt[], r: number): Pt[] {
  const c = centroid(pts); const cos = Math.cos(r), sin = Math.sin(r);
  return pts.map(p => [(p[0]-c[0])*cos - (p[1]-c[1])*sin + c[0], (p[0]-c[0])*sin + (p[1]-c[1])*cos + c[1]] as Pt);
}
function scaleTo(pts: Pt[], size: number): Pt[] {
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for (const p of pts) { if (p[0]<minX) minX=p[0]; if (p[0]>maxX) maxX=p[0]; if (p[1]<minY) minY=p[1]; if (p[1]>maxY) maxY=p[1]; }
  const w = maxX-minX||1, h = maxY-minY||1;
  return pts.map(p => [(p[0]-minX)*(size/w), (p[1]-minY)*(size/h)] as Pt);
}
function translateTo(pts: Pt[], t: Pt): Pt[] { const c = centroid(pts); return pts.map(p => [p[0]+t[0]-c[0], p[1]+t[1]-c[1]] as Pt); }
function pathDistance(a: Pt[], b: Pt[]) { let d = 0; const n = Math.min(a.length, b.length); for (let i=0;i<n;i++) d+=dist(a[i],b[i]); return d/n; }
function distanceAtAngle(p: Pt[], t: Pt[], r: number) { return pathDistance(rotateBy(p, r), t); }
function distanceAtBestAngle(p: Pt[], t: Pt[]) {
  let a = -ANGLE_RANGE, b = ANGLE_RANGE;
  let x1 = PHI*a + (1-PHI)*b; let f1 = distanceAtAngle(p, t, x1);
  let x2 = (1-PHI)*a + PHI*b; let f2 = distanceAtAngle(p, t, x2);
  while (Math.abs(b-a) > ANGLE_PRECISION) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = PHI*a + (1-PHI)*b; f1 = distanceAtAngle(p, t, x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = (1-PHI)*a + PHI*b; f2 = distanceAtAngle(p, t, x2); }
  }
  return Math.min(f1, f2);
}
function preprocess(raw: Pt[]): Pt[] { let pts = resample(raw, N); pts = rotateBy(pts, -indicativeAngle(pts)); pts = scaleTo(pts, 1); pts = translateTo(pts, [0,0]); return pts; }
function scoreAgainst(drawn: Pt[], template: Pt[]): number {
  if (drawn.length < 4 || template.length < 2) return 0;
  return Math.max(0, 1 - distanceAtBestAngle(preprocess(drawn), preprocess(template)) / HALF_DIAGONAL);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const runeKey: string = String(body.rune_key || "").toLowerCase().trim();
    const stroke: Pt[] = Array.isArray(body.stroke) ? body.stroke.filter((p: any) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
    const targetName: string | null = body.target_name ? String(body.target_name).slice(0, 64) : null;
    if (!runeKey) return new Response(JSON.stringify({ error: "rune_key required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (stroke.length < 6) return new Response(JSON.stringify({ error: "Trace was too short — let your hand flow." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rune } = await admin.from("lesser_runes").select("*").eq("key", runeKey).maybeSingle();
    if (!rune) return new Response(JSON.stringify({ error: "No such lesser rune." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Gate: must know the WORD before tracing
    const { data: knowledge } = await admin.from("player_lesser_rune_knowledge")
      .select("knows_word, knows_symbol").eq("user_id", user.id).eq("rune_key", runeKey).maybeSingle();
    if (!knowledge?.knows_word) {
      return new Response(JSON.stringify({ error: `You do not yet know the word **${rune.latin_name}**. Seek a teacher or a tome.` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const knewSymbol = !!knowledge?.knows_symbol;

    const tpl = rune.template as Pt[];
    const tplRev = [...tpl].reverse();
    const score = Math.max(scoreAgainst(stroke, tpl), scoreAgainst(stroke, tplRev));
    const pct = Math.round(score * 100);

    const { data: profile } = await admin.from("profiles").select("username,current_room,hp,max_hp,corruption").eq("id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "profile missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const eff = (rune.effect ?? {}) as Record<string, any>;
    let outcome: "perfect" | "weakened" | "fizzle" | "backfire" | "practice" = "fizzle";
    let narrative = "";
    let damage = 0, heal = 0, hpDelta = 0, corruptionDelta = 0;

    if (!knewSymbol) {
      // Practice mode: player is still learning the symbol. No damage, no public emote, no backfire.
      if (score >= 0.6) {
        outcome = "practice";
        narrative = `${profile.username}'s hand finds the shape of **${rune.latin_name}** for the first time. The sigil burns into memory.`;
      } else {
        outcome = "practice";
        narrative = `Your hand wavers — the shape of **${rune.latin_name}** still eludes you. Try again.`;
      }
    } else if (score >= 0.85) {
      outcome = "perfect";
      damage = eff.type === "damage" ? Math.round((eff.power ?? 1) * 1.0) : 0;
      heal = eff.type === "heal" ? Math.round((eff.power ?? 1) * 1.0) : 0;
      narrative = `${profile.username} traces ${rune.glyph} **${rune.latin_name}** in the air — the sigil holds, glowing true.`;
    } else if (score >= 0.6) {
      outcome = "weakened";
      damage = eff.type === "damage" ? Math.max(1, Math.round((eff.power ?? 1) * 0.5)) : 0;
      heal = eff.type === "heal" ? Math.max(1, Math.round((eff.power ?? 1) * 0.5)) : 0;
      narrative = `${profile.username} sketches **${rune.latin_name}** — the glyph wavers, but a flicker of its power answers.`;
    } else if (score >= 0.35) {
      outcome = "fizzle";
      narrative = `${profile.username}'s **${rune.latin_name}** hangs broken in the air, then unravels into smoke.`;
    } else {
      outcome = "backfire";
      hpDelta = -Math.max(2, Math.round((eff.power ?? 1) * 1.5));
      corruptionDelta = 1;
      narrative = `${profile.username}'s twisted **${rune.latin_name}** lashes back — the unspoken thing in the air bites at them.`;
    }

    if (knewSymbol && eff.corruption) corruptionDelta += Number(eff.corruption);

    const newHp = Math.max(0, Math.min(profile.max_hp, profile.hp + hpDelta));
    if (hpDelta !== 0 || corruptionDelta !== 0) {
      await admin.from("profiles").update({
        hp: newHp,
        corruption: Math.max(0, (profile.corruption ?? 0) + corruptionDelta),
      }).eq("id", user.id);
    }

    // Mastery (only count real casts, not practice)
    if (knewSymbol) {
      const { data: existing } = await admin.from("player_lesser_runes")
        .select("best_score,cast_count,backfire_count").eq("user_id", user.id).eq("rune_key", runeKey).maybeSingle();
      const best = Math.max(Number(existing?.best_score ?? 0), score);
      await admin.from("player_lesser_runes").upsert({
        user_id: user.id, rune_key: runeKey,
        best_score: best,
        cast_count: (existing?.cast_count ?? 0) + 1,
        backfire_count: (existing?.backfire_count ?? 0) + (outcome === "backfire" ? 1 : 0),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,rune_key" });

      // Public room message
      const fullText = targetName
        ? `${narrative}${damage ? ` (${damage} damage to ${targetName})` : ""}${heal ? ` (heals ${heal})` : ""}`
        : `${narrative}${damage ? ` (${damage} damage)` : ""}${heal ? ` (heals ${heal})` : ""}`;
      await admin.from("messages").insert({
        room: profile.current_room, user_id: user.id, author_name: profile.username,
        kind: "emote", content: fullText,
      });
    }

    // Reveal the SYMBOL on the first ≥60% trace.
    let symbolJustLearned = false;
    if (!knewSymbol && score >= 0.6) {
      symbolJustLearned = true;
      await admin.from("player_lesser_rune_knowledge").upsert({
        user_id: user.id, rune_key: runeKey,
        knows_word: true, knows_symbol: true,
        learned_symbol_at: new Date().toISOString(),
      }, { onConflict: "user_id,rune_key" });
      await admin.from("world_events").insert({
        room: profile.current_room, kind: "rune_symbol_learned",
        actor_name: profile.username, actor_id: user.id,
        details: { rune: rune.latin_name, key: runeKey },
        decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      });
    }

    // World event for adaptive storytelling — only if symbol was already known
    // (otherwise the room shouldn't see a public cast for a still-unknown sigil).
    if (knewSymbol) {
      await admin.from("world_events").insert({
        room: profile.current_room, kind: outcome === "backfire" ? "rune_backfire" : "rune_cast",
        actor_name: profile.username, actor_id: user.id,
        target_name: targetName, details: { rune: runeKey, score: pct, outcome },
        decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
      });
    }

    // === Rune utility puzzles ===
    // On a successful cast (knows the symbol, score >= 0.6), check for matching
    // env-tag or scripted effects in the current room. One-time per player per room.
    const utility: any = { applied: false };
    if (knewSymbol && score >= 0.6) {
      // Tags on this room
      const { data: tagRows } = await admin
        .from("room_env_tags").select("tag").eq("room", profile.current_room);
      const tags = (tagRows ?? []).map((t: any) => t.tag);

      // Find candidate effects: scripted (room scope) OR matching tag scope
      const orParts: string[] = [`and(scope.eq.room,match_key.eq.${profile.current_room})`];
      if (tags.length) {
        orParts.push(`and(scope.eq.tag,match_key.in.(${tags.join(",")}))`);
      }
      const { data: effects } = await admin
        .from("rune_utility_effects").select("*")
        .eq("rune_key", runeKey)
        .or(orParts.join(","));

      const candidates = (effects ?? []) as any[];
      if (candidates.length) {
        // Filter out one-time effects already solved in this room by this player
        const ids = candidates.map((e) => e.id);
        const { data: solved } = await admin
          .from("player_rune_solves").select("effect_id")
          .eq("user_id", user.id).eq("room", profile.current_room).in("effect_id", ids);
        const solvedIds = new Set((solved ?? []).map((s: any) => s.effect_id));

        // Pick the first unsolved (scripted preferred over tag — sort scope=room first)
        const pick = candidates
          .filter((e) => !(e.one_time && solvedIds.has(e.id)))
          .sort((a, b) => (a.scope === "room" ? -1 : 1) - (b.scope === "room" ? -1 : 1))[0];

        if (pick) {
          let goldGained = 0, xpGained = 0, meritGained = 0, itemGained: string | null = null;
          let exitGained: { dir: string; to: string; label: string | null } | null = null;

          if (pick.reward_gold > 0) goldGained = pick.reward_gold;
          if (pick.reward_xp > 0) xpGained = pick.reward_xp;
          if (pick.reward_merit > 0) meritGained = pick.reward_merit;

          if (pick.reward_kind === "access" && pick.reward_exit_dir && pick.reward_exit_to) {
            await admin.from("player_room_extra_exits").upsert({
              user_id: user.id, room: profile.current_room,
              dir: pick.reward_exit_dir, to_room: pick.reward_exit_to,
              label: pick.reward_exit_label ?? null,
            }, { onConflict: "user_id,room,dir" });
            exitGained = { dir: pick.reward_exit_dir, to: pick.reward_exit_to, label: pick.reward_exit_label ?? null };
          }

          if (pick.reward_kind === "cache" && pick.reward_item_key) {
            await admin.from("player_items").insert({
              user_id: user.id, item_key: pick.reward_item_key, quantity: 1,
            });
            itemGained = pick.reward_item_key;
          }

          if (pick.reward_kind === "lore" && pick.reward_lore_slug) {
            await admin.from("player_lore_discoveries").insert({
              user_id: user.id, lore_slug: pick.reward_lore_slug, source: `rune:${runeKey}`,
            }).then(() => null, () => null); // ignore dup
          }

          // Apply gold/xp/merit
          if (goldGained || xpGained || meritGained) {
            const { data: pp } = await admin.from("profiles")
              .select("gold,xp,merit").eq("id", user.id).maybeSingle();
            await admin.from("profiles").update({
              gold: (pp?.gold ?? 0) + goldGained,
              xp:   (pp?.xp ?? 0)   + xpGained,
              merit:(pp?.merit ?? 0) + meritGained,
            }).eq("id", user.id);
          }

          // Mark solved (one-time only; for repeatable, skip)
          if (pick.one_time) {
            await admin.from("player_rune_solves").insert({
              user_id: user.id, effect_id: pick.id, room: profile.current_room,
            }).then(() => null, () => null);
          }

          // Public emote so others see something happened
          const rewardBits: string[] = [];
          if (goldGained) rewardBits.push(`+${goldGained}g`);
          if (xpGained) rewardBits.push(`+${xpGained}xp`);
          if (meritGained) rewardBits.push(`+${meritGained} merit`);
          if (exitGained) rewardBits.push(`a way ${exitGained.dir} opens`);
          await admin.from("messages").insert({
            room: profile.current_room, user_id: null, author_name: "—", kind: "ambient",
            content: pick.flavor_solve + (rewardBits.length ? `  *(${rewardBits.join(", ")})*` : ""),
          });

          utility.applied = true;
          utility.flavor = pick.flavor_solve;
          utility.reward = { gold: goldGained, xp: xpGained, merit: meritGained, item: itemGained, exit: exitGained };
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true, score: pct, outcome, narrative, damage, heal,
      hp: newHp, corruption_delta: corruptionDelta,
      symbol_just_learned: symbolJustLearned,
      utility,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
