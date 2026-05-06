// Validates a single kanji trace and grants the player the stroke knowledge.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Pt = [number, number];
const N = 64; const HD = 0.5*Math.SQRT2; const AR = 45*Math.PI/180; const AP = 2*Math.PI/180; const PHI = 0.5*(-1+Math.sqrt(5));
const dist = (a: Pt, b: Pt) => Math.hypot(a[0]-b[0], a[1]-b[1]);
function pl(p: Pt[]){let d=0;for(let i=1;i<p.length;i++)d+=dist(p[i-1],p[i]);return d;}
function rs(p: Pt[], n: number): Pt[]{ if(p.length<2)return p.slice(); const I=pl(p)/(n-1);let D=0;const o:Pt[]=[p[0]];const q=p.slice();
  for(let i=1;i<q.length;i++){const d=dist(q[i-1],q[i]); if(D+d>=I){const x=q[i-1][0]+((I-D)/d)*(q[i][0]-q[i-1][0]);const y=q[i-1][1]+((I-D)/d)*(q[i][1]-q[i-1][1]);const r:Pt=[x,y];o.push(r);q.splice(i,0,r);D=0;}else D+=d;}
  while(o.length<n)o.push(q[q.length-1]); return o; }
function ce(p: Pt[]):Pt{let x=0,y=0;for(const q of p){x+=q[0];y+=q[1];}return[x/p.length,y/p.length];}
function ia(p:Pt[]){const c=ce(p);return Math.atan2(c[1]-p[0][1], c[0]-p[0][0]);}
function rb(p:Pt[],r:number):Pt[]{const c=ce(p);const cs=Math.cos(r),sn=Math.sin(r);return p.map(q=>[(q[0]-c[0])*cs-(q[1]-c[1])*sn+c[0],(q[0]-c[0])*sn+(q[1]-c[1])*cs+c[1]] as Pt);}
function st(p:Pt[],s:number):Pt[]{let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity;for(const q of p){if(q[0]<mnX)mnX=q[0];if(q[0]>mxX)mxX=q[0];if(q[1]<mnY)mnY=q[1];if(q[1]>mxY)mxY=q[1];}const w=mxX-mnX||1,h=mxY-mnY||1;return p.map(q=>[(q[0]-mnX)*(s/w),(q[1]-mnY)*(s/h)] as Pt);}
function tt(p:Pt[],t:Pt):Pt[]{const c=ce(p);return p.map(q=>[q[0]+t[0]-c[0],q[1]+t[1]-c[1]] as Pt);}
function pd(a:Pt[],b:Pt[]){let d=0;const n=Math.min(a.length,b.length);for(let i=0;i<n;i++)d+=dist(a[i],b[i]);return d/n;}
function da(p:Pt[],t:Pt[],r:number){return pd(rb(p,r),t);}
function dba(p:Pt[],t:Pt[]){let a=-AR,b=AR;let x1=PHI*a+(1-PHI)*b;let f1=da(p,t,x1);let x2=(1-PHI)*a+PHI*b;let f2=da(p,t,x2);while(Math.abs(b-a)>AP){if(f1<f2){b=x2;x2=x1;f2=f1;x1=PHI*a+(1-PHI)*b;f1=da(p,t,x1);}else{a=x1;x1=x2;f1=f2;x2=(1-PHI)*a+PHI*b;f2=da(p,t,x2);}}return Math.min(f1,f2);}
function pre(p:Pt[]):Pt[]{let r=rs(p,N);r=rb(r,-ia(r));r=st(r,1);r=tt(r,[0,0]);return r;}
function score(d:Pt[],t:Pt[]){if(d.length<4||t.length<2)return 0;return Math.max(0,1-dba(pre(d),pre(t))/HD);}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const kanjiKey: string = String(body.kanji_key || "").trim();
    const stroke: Pt[] = Array.isArray(body.stroke) ? body.stroke.filter((p:any) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
    if (!kanjiKey) return new Response(JSON.stringify({ error: "kanji_key required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (stroke.length < 6) return new Response(JSON.stringify({ error: "Trace too short" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: kj } = await admin.from("kanji_runes").select("*").eq("key", kanjiKey).maybeSingle();
    if (!kj) return new Response(JSON.stringify({ error: "Unknown kanji" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: kn } = await admin.from("player_kanji_knowledge").select("knows_meaning,knows_stroke").eq("user_id", user.id).eq("kanji_key", kanjiKey).maybeSingle();
    if (!kn?.knows_meaning) return new Response(JSON.stringify({ error: `You do not yet know the meaning of ${kj.kanji} (${kj.romaji}). Seek a teacher or scholar.` }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sc = score(stroke, kj.template as Pt[]);
    const pct = Math.round(sc*100);
    if (sc < 0.55) {
      return new Response(JSON.stringify({ ok: true, score: pct, learned: false, message: `Your hand wavers (${pct}%). The shape eludes you still.` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const justLearned = !kn.knows_stroke;
    await admin.from("player_kanji_knowledge").upsert({
      user_id: user.id, kanji_key: kanjiKey,
      knows_meaning: true, knows_stroke: true,
      learned_stroke_at: justLearned ? new Date().toISOString() : undefined,
    } as any, { onConflict: "user_id,kanji_key" });

    if (justLearned) {
      const { data: profile } = await admin.from("profiles").select("username,current_room").eq("id", user.id).maybeSingle();
      await admin.from("world_events").insert({
        room: profile?.current_room ?? "crescent-shore",
        kind: "kanji_stroke_learned",
        actor_name: profile?.username ?? "Someone",
        actor_id: user.id,
        details: { kanji: kj.kanji, romaji: kj.romaji, key: kanjiKey, score: pct },
        decay_at: new Date(Date.now() + 1000*60*60*24*14).toISOString(),
      });
    }

    return new Response(JSON.stringify({ ok: true, score: pct, learned: justLearned, message: justLearned ? `${kj.kanji} (${kj.romaji}) — your hand remembers.` : `Refined: ${pct}%.` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
