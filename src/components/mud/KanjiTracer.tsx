import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { scoreAgainstTemplate, type Pt } from "@/lib/dollarOne";
import { toast } from "sonner";
import { Loader2, Lock, X, Check } from "lucide-react";

interface Kanji {
  key: string; kanji: string; romaji: string; english_meaning: string;
  element: string; description: string; difficulty: number; rarity: string;
  template: Pt[];
}
interface Knowledge { kanji_key: string; knows_meaning: boolean; knows_stroke: boolean; }
interface Compound {
  key: string; name: string; english_meaning: string;
  components: string[]; rarity: string; description: string; lore_hint: string | null;
}
interface Discovery { compound_key: string; }

interface Props { open: boolean; onClose: () => void; onCast?: (r: any) => void; inline?: boolean; }
const SIZE = 240;

export function KanjiTracer({ open, onClose, onCast, inline }: Props) {
  const [kanji, setKanji] = useState<Kanji[]>([]);
  const [knowledge, setKnowledge] = useState<Record<string, Knowledge>>({});
  const [compounds, setCompounds] = useState<Compound[]>([]);
  const [discoveries, setDiscoveries] = useState<Set<string>>(new Set());

  const [sequence, setSequence] = useState<string[]>([]); // selected kanji keys to cast in order
  const [strokes, setStrokes] = useState<Record<number, Pt[]>>({}); // index -> stroke
  const [activeIdx, setActiveIdx] = useState(0);
  const [target, setTarget] = useState("");
  const [casting, setCasting] = useState(false);
  const [tab, setTab] = useState("weave");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [, force] = useState(0);

  const reload = async () => {
    const [k, pk, c, d] = await Promise.all([
      supabase.from("kanji_runes").select("*").order("difficulty"),
      supabase.from("player_kanji_knowledge").select("kanji_key,knows_meaning,knows_stroke"),
      supabase.from("kanji_compounds").select("*"),
      supabase.from("player_kanji_compound_discoveries").select("compound_key"),
    ]);
    if (k.data) setKanji(k.data as any);
    if (pk.data) setKnowledge(Object.fromEntries((pk.data as Knowledge[]).map(x => [x.kanji_key, x])));
    if (c.data) setCompounds(c.data as any);
    if (d.data) setDiscoveries(new Set((d.data as Discovery[]).map(x => x.compound_key)));
  };
  useEffect(() => { if (open) reload(); }, [open]);

  const knowsMeaning = (k: string) => !!knowledge[k]?.knows_meaning;
  const knowsStroke = (k: string) => !!knowledge[k]?.knows_stroke;
  const byKey = Object.fromEntries(kanji.map(k => [k.key, k]));

  const activeKey = sequence[activeIdx];
  const activeKanji = activeKey ? byKey[activeKey] : null;

  // redraw canvas
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (activeKanji) {
      // ghost the kanji glyph BIG behind
      ctx.fillStyle = "hsl(var(--muted-foreground) / 0.08)";
      ctx.font = "bold 200px serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(activeKanji.kanji, SIZE/2, SIZE/2);
      // dashed template
      if (knowsStroke(activeKanji.key)) {
        ctx.strokeStyle = "hsl(var(--muted-foreground) / 0.3)";
        ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath();
        activeKanji.template.forEach((p, i) => {
          const x = p[0]*SIZE, y = p[1]*SIZE;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    const s = strokes[activeIdx];
    if (s && s.length > 1) {
      ctx.strokeStyle = "hsl(var(--primary))";
      ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      s.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
      ctx.stroke();
    }
  });

  const getPt = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left)/r.width)*SIZE, ((e.clientY - r.top)/r.height)*SIZE];
  };
  const onDown = (e: React.PointerEvent) => {
    if (!activeKanji) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setStrokes(s => ({ ...s, [activeIdx]: [getPt(e)] }));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    setStrokes(s => ({ ...s, [activeIdx]: [...(s[activeIdx] ?? []), getPt(e)] }));
  };
  const onUp = () => { drawingRef.current = false; force(n => n+1); };

  const liveScore = (() => {
    if (!activeKanji) return null;
    const s = strokes[activeIdx]; if (!s || s.length < 4) return null;
    const n: Pt[] = s.map(p => [p[0]/SIZE, p[1]/SIZE]);
    return scoreAgainstTemplate(n, activeKanji.template);
  })();

  const addToSequence = (key: string) => {
    if (sequence.length >= 4) { toast.error("A compound can hold at most 4 kanji."); return; }
    setSequence(seq => { const next = [...seq, key]; setActiveIdx(next.length - 1); return next; });
  };
  const removeFromSequence = (idx: number) => {
    setSequence(seq => seq.filter((_, i) => i !== idx));
    setStrokes(s => { const n: Record<number, Pt[]> = {}; Object.entries(s).forEach(([k, v]) => { const ki = Number(k); if (ki < idx) n[ki] = v; else if (ki > idx) n[ki-1] = v; }); return n; });
    setActiveIdx(i => Math.max(0, Math.min(i, sequence.length - 2)));
  };
  const clearStroke = () => setStrokes(s => ({ ...s, [activeIdx]: [] }));
  const reset = () => { setSequence([]); setStrokes({}); setActiveIdx(0); setTarget(""); };

  const cast = async () => {
    if (sequence.length < 2) { toast.error("Weave at least 2 kanji."); return; }
    const payload = sequence.map((k, i) => ({
      kanji_key: k,
      stroke: (strokes[i] ?? []).map(p => [p[0]/SIZE, p[1]/SIZE] as Pt),
    }));
    if (payload.some(p => p.stroke.length < 6)) { toast.error("Trace every kanji before casting."); return; }
    setCasting(true);
    const { data, error } = await supabase.functions.invoke("kanji-cast", {
      body: { sequence: payload, target_name: target || null },
    });
    setCasting(false);
    if (error || !data?.ok) { toast.error((data as any)?.error || error?.message || "The weave fails"); return; }
    if (data.discovered) toast.success(`✦ Discovered: ${data.compound.name} (${data.compound.english})`);
    else toast.message(`Compound — ${data.outcome} (${data.avg_score}%)`, { description: data.narrative.replace(/\*/g, "") });
    onCast?.(data); reset(); await reload();
    if (data.outcome !== "novel" || data.discovered) onClose();
  };

  // Practice tab: pick a single kanji you know meaning of, trace it to learn stroke.
  const [practiceKey, setPracticeKey] = useState<string | null>(null);
  const [practiceStroke, setPracticeStroke] = useState<Pt[]>([]);
  const practiceCanvasRef = useRef<HTMLCanvasElement>(null);
  const practiceDrawingRef = useRef(false);
  const practiceKanji = practiceKey ? byKey[practiceKey] : null;
  useEffect(() => {
    const c = practiceCanvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0,0,SIZE,SIZE);
    if (practiceKanji) {
      ctx.fillStyle = "hsl(var(--muted-foreground) / 0.12)";
      ctx.font = "bold 200px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(practiceKanji.kanji, SIZE/2, SIZE/2);
    }
    if (practiceStroke.length > 1) {
      ctx.strokeStyle = "hsl(var(--primary))"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      practiceStroke.forEach((p,i) => i===0 ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]));
      ctx.stroke();
    }
  });
  const ptP = (e: React.PointerEvent): Pt => {
    const r = practiceCanvasRef.current!.getBoundingClientRect();
    return [((e.clientX-r.left)/r.width)*SIZE, ((e.clientY-r.top)/r.height)*SIZE];
  };
  const practiceScore = (() => {
    if (!practiceKanji || practiceStroke.length < 4) return null;
    const n: Pt[] = practiceStroke.map(p => [p[0]/SIZE, p[1]/SIZE]);
    return scoreAgainstTemplate(n, practiceKanji.template);
  })();
  const submitPractice = async () => {
    if (!practiceKanji || practiceStroke.length < 6) return;
    const n: Pt[] = practiceStroke.map(p => [p[0]/SIZE, p[1]/SIZE]);
    const { data, error } = await supabase.functions.invoke("kanji-practice", {
      body: { kanji_key: practiceKanji.key, stroke: n },
    });
    if (error || !data?.ok) { toast.error((data as any)?.error || error?.message || "The shape resists you."); return; }
    if (data.learned) toast.success(data.message);
    else toast.message(data.message);
    setPracticeStroke([]); await reload();
  };

  // Recipe book: show known recipes (discovered) + locked ones (silhouette of components).
  const recipeRows = compounds.map(c => {
    const learned = discoveries.has(c.key);
    const allKnown = c.components.every(k => knowsStroke(k));
    return { c, learned, allKnown };
  });

  const tabs = (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid grid-cols-3">
        <TabsTrigger value="weave">Weave</TabsTrigger>
            <TabsTrigger value="practice">Practice</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
          </TabsList>

          {/* WEAVE: build sequence + trace each */}
          <TabsContent value="weave" className="space-y-3">
            <div className="flex gap-1.5 flex-wrap min-h-[40px] p-2 rounded border border-dashed border-border">
              {sequence.length === 0 && <span className="text-xs text-muted-foreground italic self-center">Tap kanji below to add to your weave →</span>}
              {sequence.map((k, i) => {
                const kj = byKey[k]; const done = (strokes[i]?.length ?? 0) >= 6;
                return (
                  <button key={i} onClick={() => setActiveIdx(i)}
                    className={`relative px-2 py-1 rounded border text-lg ${
                      i === activeIdx ? "border-primary bg-primary/10" : "border-border"
                    }`}>
                    {kj?.kanji}
                    {done && <Check className="w-3 h-3 absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5" />}
                    <X className="w-3 h-3 absolute -bottom-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                       onClick={(e) => { e.stopPropagation(); removeFromSequence(i); }} />
                  </button>
                );
              })}
            </div>

            <div className="flex justify-center">
              <canvas ref={canvasRef} width={SIZE} height={SIZE}
                className="rounded-lg border-2 border-border bg-muted/30 touch-none"
                style={{ width: SIZE, height: SIZE }}
                onPointerDown={onDown} onPointerMove={onMove}
                onPointerUp={onUp} onPointerCancel={onUp} />
            </div>
            {activeKanji && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{activeKanji.kanji} <em>{activeKanji.romaji}</em> — {activeKanji.english_meaning}</span>
                {liveScore !== null && (
                  <Badge variant={liveScore >= 0.8 ? "default" : liveScore >= 0.5 ? "secondary" : "destructive"}>
                    {Math.round(liveScore*100)}%
                  </Badge>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {kanji.map(k => {
                const meaning = knowsMeaning(k.key); const stroke = knowsStroke(k.key);
                return (
                  <button key={k.key} disabled={!stroke}
                    onClick={() => addToSequence(k.key)}
                    title={stroke ? `${k.kanji} ${k.romaji} — ${k.english_meaning}` : meaning ? "Practice the stroke first" : "Unknown kanji"}
                    className={`px-2 py-1 rounded border text-base transition ${
                      !stroke ? "border-border/40 text-ash/40" :
                      "border-border hover:border-primary/60"
                    }`}>
                    {stroke ? k.kanji : meaning ? <span className="text-xs italic">{k.romaji}</span> : <Lock className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>

            <Input placeholder="Target (optional NPC name)" value={target} onChange={e => setTarget(e.target.value)} />

            <div className="flex gap-2">
              <Button variant="outline" onClick={clearStroke} disabled={casting} className="flex-1">Clear stroke</Button>
              <Button variant="outline" onClick={reset} disabled={casting} className="flex-1">Reset</Button>
              <Button onClick={cast} disabled={casting || sequence.length < 2} className="flex-1">
                {casting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Weave"}
              </Button>
            </div>
          </TabsContent>

          {/* PRACTICE: learn the stroke for a single kanji you know the meaning of */}
          <TabsContent value="practice" className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {kanji.map(k => {
                const meaning = knowsMeaning(k.key); const stroke = knowsStroke(k.key);
                if (!meaning && !stroke) return (
                  <span key={k.key} className="px-2 py-1 rounded border border-border/40 text-ash/40" title="Unknown — learn from NPCs/lore first">
                    <Lock className="w-3 h-3" />
                  </span>
                );
                return (
                  <button key={k.key}
                    onClick={() => { setPracticeKey(k.key); setPracticeStroke([]); }}
                    className={`px-2 py-1 rounded border text-base transition ${
                      practiceKey === k.key ? "border-primary bg-primary/10" :
                      stroke ? "border-emerald-700/50" : "border-border hover:border-primary/60"
                    }`}
                    title={`${k.kanji} ${k.romaji} — ${k.english_meaning}${stroke ? " (mastered)" : ""}`}>
                    {stroke ? k.kanji : <span className="text-xs italic">{k.romaji}</span>}
                  </button>
                );
              })}
            </div>
            {practiceKanji && (
              <>
                <p className="text-xs text-muted-foreground italic">
                  {practiceKanji.kanji} <strong>{practiceKanji.romaji}</strong> — {practiceKanji.english_meaning}
                  {knowsStroke(practiceKanji.key) && <span className="ml-2 text-emerald-500">✓ stroke mastered</span>}
                </p>
                <div className="flex justify-center">
                  <canvas ref={practiceCanvasRef} width={SIZE} height={SIZE}
                    className="rounded-lg border-2 border-border bg-muted/30 touch-none"
                    style={{ width: SIZE, height: SIZE }}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); practiceDrawingRef.current = true; setPracticeStroke([ptP(e)]); }}
                    onPointerMove={(e) => { if (practiceDrawingRef.current) setPracticeStroke(s => [...s, ptP(e)]); }}
                    onPointerUp={() => { practiceDrawingRef.current = false; force(n=>n+1); }}
                    onPointerCancel={() => { practiceDrawingRef.current = false; }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Match the ghost glyph</span>
                  {practiceScore !== null && (
                    <Badge variant={practiceScore >= 0.55 ? "default" : "destructive"}>
                      {Math.round(practiceScore*100)}%
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPracticeStroke([])} className="flex-1">Clear</Button>
                  <Button onClick={submitPractice} disabled={practiceStroke.length < 6} className="flex-1">
                    {knowsStroke(practiceKanji.key) ? "Refine" : "Learn stroke"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* CODEX: only compounds the player has discovered through experimentation */}
          <TabsContent value="codex" className="space-y-2">
            {(() => {
              const learnedRows = recipeRows.filter(r => r.learned);
              if (learnedRows.length === 0) {
                return (
                  <p className="text-xs text-muted-foreground italic">
                    No compounds discovered yet. Weave kanji together to uncover their names.
                  </p>
                );
              }
              return learnedRows.map(({ c }) => (
                <div key={c.key} className="p-2 rounded border border-primary/40 bg-primary/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-base">
                      {c.components.map((k, i) => (
                        <span key={i}>
                          {byKey[k]?.kanji}
                          {i < c.components.length - 1 && <span className="text-xs mx-1 text-muted-foreground">+</span>}
                        </span>
                      ))}
                    </div>
                    <Badge variant="default" className="text-[10px]">{c.name}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{c.english_meaning} — {c.description}</p>
                </div>
              ));
            })()}
      </TabsContent>
    </Tabs>
  );

  if (inline) return tabs;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Greater Runes — Kanji</DialogTitle>
          <DialogDescription className="text-xs">
            Combine 2–4 kanji into a compound. Practice each kanji alone first, then weave.
          </DialogDescription>
        </DialogHeader>
        {tabs}
      </DialogContent>
    </Dialog>
  );
}
