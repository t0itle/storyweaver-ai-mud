// Kanji compound caster: trace each component kanji in sequence.
// Hybrid: exact-match recipes give full effect; novel sequences resolve as weakened
// improvisation that may unlock a new recipe (if it turns out to match an unknown one).

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
function pathLength(p: Pt[]) { let d = 0; for (let i=1;i<p.length;i++) d += dist(p[i-1],p[i]); return d; }
function resample(points: Pt[], n: number): Pt[] {
  if (points.length < 2) return points.slice();
  const I = pathLength(points)/(n-1); let D = 0;
  const out: Pt[] = [points[0]]; const pts = points.slice();
  for (let i=1;i<pts.length;i++) {
    const d = dist(pts[i-1],pts[i]);
    if (D+d>=I) {
      const qx = pts[i-1][0]+((I-D)/d)*(pts[i][0]-pts[i-1][0]);
      const qy = pts[i-1][1]+((I-D)/d)*(pts[i][1]-pts[i-1][1]);
      const q: Pt = [qx,qy]; out.push(q); pts.splice(i,0,q); D = 0;
    } else D += d;
  }
  while (out.length<n) out.push(pts[pts.length-1]);
  return out;
}
function centroid(p: Pt[]): Pt { let x=0,y=0; for (const q of p){x+=q[0];y+=q[1];} return [x/p.length,y/p.length]; }
function indicativeAngle(p: Pt[]) { const c=centroid(p); return Math.atan2(c[1]-p[0][1], c[0]-p[0][0]); }
function rotateBy(p: Pt[], r: number): Pt[] {
  const c=centroid(p); const cs=Math.cos(r), sn=Math.sin(r);
  return p.map(q=>[(q[0]-c[0])*cs-(q[1]-c[1])*sn+c[0], (q[0]-c[0])*sn+(q[1]-c[1])*cs+c[1]] as Pt);
}
function scaleTo(p: Pt[], s: number): Pt[] {
  let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity;
  for (const q of p){if(q[0]<mnX)mnX=q[0];if(q[0]>mxX)mxX=q[0];if(q[1]<mnY)mnY=q[1];if(q[1]>mxY)mxY=q[1];}
  const w=mxX-mnX||1, h=mxY-mnY||1;
  return p.map(q=>[(q[0]-mnX)*(s/w),(q[1]-mnY)*(s/h)] as Pt);
}
function translateTo(p: Pt[], t: Pt): Pt[] { const c=centroid(p); return p.map(q=>[q[0]+t[0]-c[0], q[1]+t[1]-c[1]] as Pt); }
function pathDistance(a: Pt[], b: Pt[]) { let d=0; const n=Math.min(a.length,b.length); for (let i=0;i<n;i++) d+=dist(a[i],b[i]); return d/n; }
function distanceAtAngle(p: Pt[], t: Pt[], r: number) { return pathDistance(rotateBy(p,r), t); }
function distanceAtBestAngle(p: Pt[], t: Pt[]) {
  let a=-ANGLE_RANGE, b=ANGLE_RANGE;
  let x1=PHI*a+(1-PHI)*b; let f1=distanceAtAngle(p,t,x1);
  let x2=(1-PHI)*a+PHI*b; let f2=distanceAtAngle(p,t,x2);
  while (Math.abs(b-a)>ANGLE_PRECISION) {
    if (f1<f2) { b=x2; x2=x1; f2=f1; x1=PHI*a+(1-PHI)*b; f1=distanceAtAngle(p,t,x1); }
    else { a=x1; x1=x2; f1=f2; x2=(1-PHI)*a+PHI*b; f2=distanceAtAngle(p,t,x2); }
  }
  return Math.min(f1,f2);
}
function preprocess(p: Pt[]): Pt[] { let r=resample(p,N); r=rotateBy(r,-indicativeAngle(r)); r=scaleTo(r,1); r=translateTo(r,[0,0]); return r; }
function scoreAgainst(d: Pt[], t: Pt[]): number {
  if (d.length<4||t.length<2) return 0;
  return Math.max(0, 1 - distanceAtBestAngle(preprocess(d), preprocess(t))/HALF_DIAGONAL);
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
    const sequence: { kanji_key: string; stroke: Pt[] }[] = Array.isArray(body.sequence) ? body.sequence : [];
    const targetName: string | null = body.target_name ? String(body.target_name).slice(0, 64) : null;

    if (sequence.length < 2 || sequence.length > 4) {
      return new Response(JSON.stringify({ error: "A compound must weave 2 to 4 kanji." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    for (const s of sequence) {
      if (!s.kanji_key || !Array.isArray(s.stroke) || s.stroke.length < 6) {
        return new Response(JSON.stringify({ error: "Each kanji needs a complete trace." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const keys = sequence.map(s => s.kanji_key);
    const { data: kanjiRows } = await admin.from("kanji_runes").select("*").in("key", keys);
    const kanjiMap = Object.fromEntries((kanjiRows ?? []).map((k: any) => [k.key, k]));
    for (const k of keys) if (!kanjiMap[k]) {
      return new Response(JSON.stringify({ error: `Unknown kanji: ${k}` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Knowledge gate: must know stroke for every component
    const { data: know } = await admin.from("player_kanji_knowledge")
      .select("kanji_key,knows_stroke,knows_meaning").eq("user_id", user.id).in("kanji_key", keys);
    const knowMap = Object.fromEntries((know ?? []).map((k: any) => [k.kanji_key, k]));
    const missing = keys.filter(k => !knowMap[k]?.knows_stroke);
    if (missing.length) {
      return new Response(JSON.stringify({
        error: `You have not yet learned the stroke of: ${missing.map(k => kanjiMap[k].kanji + ' ' + kanjiMap[k].romaji).join(", ")}. Practice each kanji alone first.`
      }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Score each trace
    const scores: number[] = [];
    for (const s of sequence) {
      scores.push(scoreAgainst(s.stroke, kanjiMap[s.kanji_key].template as Pt[]));
    }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const minScore = Math.min(...scores);
    const allPassed = scores.every(s => s >= 0.5);

    // Match recipe (ordered)
    const { data: compoundRows } = await admin.from("kanji_compounds").select("*");
    const arrEq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    const matched = (compoundRows ?? []).find((c: any) => arrEq(c.components as string[], keys)) as any;

    const { data: profile } = await admin.from("profiles").select("username,current_room,hp,max_hp,corruption,merit").eq("id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "profile missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const compNames = keys.map(k => kanjiMap[k].kanji).join(" + ");
    let outcome: "perfect" | "weakened" | "novel" | "fizzle" | "backfire" = "fizzle";
    let narrative = "";
    let damage = 0, heal = 0, hpDelta = 0, corruptionDelta = 0;
    let discovered = false;

    if (!allPassed || avg < 0.45) {
      // backfire: at least one stroke fell apart
      outcome = "backfire";
      hpDelta = -Math.max(3, Math.round(sequence.length * 2.5));
      corruptionDelta = 1;
      narrative = `${profile.username} tries to bind ${compNames} — but a stroke betrays the weave. The compound shatters and lashes back.`;
    } else if (matched) {
      const eff = (matched.effect ?? {}) as Record<string, any>;
      const power = Number(eff.power ?? sequence.length * 3);
      if (avg >= 0.8) {
        outcome = "perfect";
        damage = eff.type === "damage" ? Math.round(power * 1.0) : 0;
        heal = eff.type === "heal" ? Math.round(power * 1.0) : 0;
        narrative = `${profile.username} weaves ${compNames} — the compound **${matched.name}** answers, whole and luminous.`;
      } else {
        outcome = "weakened";
        damage = eff.type === "damage" ? Math.max(1, Math.round(power * 0.55)) : 0;
        heal = eff.type === "heal" ? Math.max(1, Math.round(power * 0.55)) : 0;
        narrative = `${profile.username} weaves ${compNames} — **${matched.name}** flickers half-formed but holds.`;
      }
      // Discovery on first successful cast
      const { data: existingDisc } = await admin.from("player_kanji_compound_discoveries")
        .select("compound_key").eq("user_id", user.id).eq("compound_key", matched.key).maybeSingle();
      if (!existingDisc) {
        discovered = true;
        await admin.from("player_kanji_compound_discoveries").insert({
          user_id: user.id, compound_key: matched.key, source: "experimentation",
        });
        await admin.from("world_events").insert({
          room: profile.current_room, kind: "compound_discovered",
          actor_name: profile.username, actor_id: user.id,
          details: { compound: matched.name, components: compNames },
          decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
        });
      }
    } else {
      // Novel improvisation: weak generic effect inferred from elements
      outcome = "novel";
      const elements = keys.map(k => (kanjiMap[k].element ?? "neutral"));
      const damaging = elements.some(e => ["fire","lightning","metal","shadow"].includes(e));
      const healing = elements.some(e => ["water","spirit","light","nature"].includes(e));
      if (damaging) damage = Math.max(1, Math.round(sequence.length * 1.5));
      if (healing) heal = Math.max(1, Math.round(sequence.length * 1.2));
      narrative = `${profile.username} improvises ${compNames} — the weave catches, fragile but real. No name comes to it.`;
    }

    if (hpDelta || corruptionDelta) {
      const newHp = Math.max(0, Math.min(profile.max_hp, profile.hp + hpDelta));
      await admin.from("profiles").update({ hp: newHp, corruption: Math.max(0, (profile.corruption ?? 0) + corruptionDelta) }).eq("id", user.id);
    }

    // Update mastery for each component
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]; const sc = scores[i];
      const { data: m } = await admin.from("player_kanji_mastery").select("best_score,cast_count,backfire_count").eq("user_id", user.id).eq("kanji_key", k).maybeSingle();
      await admin.from("player_kanji_mastery").upsert({
        user_id: user.id, kanji_key: k,
        best_score: Math.max(Number(m?.best_score ?? 0), sc),
        cast_count: (m?.cast_count ?? 0) + 1,
        backfire_count: (m?.backfire_count ?? 0) + (outcome === "backfire" ? 1 : 0),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,kanji_key" });
    }

    // Public emote (skip backfire so the spectacle isn't broadcast as success)
    const fullText = `${narrative}${damage ? ` (${damage} damage${targetName ? ` to ${targetName}` : ""})` : ""}${heal ? ` (heals ${heal})` : ""}`;
    await admin.from("messages").insert({
      room: profile.current_room, user_id: user.id, author_name: profile.username,
      kind: "emote", content: fullText,
    });

    // World event for adaptive storytelling
    await admin.from("world_events").insert({
      room: profile.current_room,
      kind: outcome === "backfire" ? "compound_backfire" : "compound_cast",
      actor_name: profile.username, actor_id: user.id,
      target_name: targetName,
      details: {
        compound: matched?.name ?? "improvised weave",
        components: compNames,
        outcome,
        score: Math.round(avg * 100),
      },
      decay_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    });

    return new Response(JSON.stringify({
      ok: true,
      outcome,
      narrative,
      scores: scores.map(s => Math.round(s * 100)),
      avg_score: Math.round(avg * 100),
      min_score: Math.round(minScore * 100),
      damage, heal,
      compound: matched ? { key: matched.key, name: matched.name, english: matched.english_meaning } : null,
      discovered,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
