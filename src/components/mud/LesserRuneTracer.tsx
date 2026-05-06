import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { scoreAgainstTemplate, type Pt } from "@/lib/dollarOne";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";

interface LesserRune {
  key: string; latin_name: string; english_meaning: string; glyph: string;
  description: string; template: Pt[]; difficulty: number; effect: any;
}
interface Knowledge { rune_key: string; knows_word: boolean; knows_symbol: boolean; }

interface Props { open: boolean; onClose: () => void; onCast?: (r: any) => void; inline?: boolean; }
const SIZE = 280;

export function LesserRuneTracer({ open, onClose, onCast, inline }: Props) {
  const [runes, setRunes] = useState<LesserRune[]>([]);
  const [knowledge, setKnowledge] = useState<Record<string, Knowledge>>({});
  const [selected, setSelected] = useState<LesserRune | null>(null);
  const [target, setTarget] = useState("");
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [casting, setCasting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const reload = async () => {
    const [r, k] = await Promise.all([
      supabase.from("lesser_runes").select("*").order("difficulty"),
      supabase.from("player_lesser_rune_knowledge").select("rune_key,knows_word,knows_symbol"),
    ]);
    if (r.data) setRunes(r.data as any);
    if (k.data) setKnowledge(Object.fromEntries((k.data as Knowledge[]).map(x => [x.rune_key, x])));
  };
  useEffect(() => { if (open) reload(); }, [open]);

  const knowsWord = (k: string) => !!knowledge[k]?.knows_word;
  const knowsSymbol = (k: string) => !!knowledge[k]?.knows_symbol;

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (selected && knowsSymbol(selected.key)) {
      ctx.strokeStyle = "hsl(var(--muted-foreground) / 0.25)";
      ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      selected.template.forEach((p, i) => {
        const x = p[0] * SIZE, y = p[1] * SIZE;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (stroke.length > 1) {
      ctx.strokeStyle = liveScore !== null && liveScore < 0.35
        ? "hsl(var(--destructive))" : "hsl(var(--primary))";
      ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
      ctx.stroke();
    }
  }, [stroke, selected, liveScore, knowledge]);

  const getPt = (e: React.PointerEvent): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * SIZE, ((e.clientY - rect.top) / rect.height) * SIZE];
  };
  const onDown = (e: React.PointerEvent) => {
    if (!selected || !knowsWord(selected.key)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(true); setLiveScore(null); setStroke([getPt(e)]);
  };
  const onMove = (e: React.PointerEvent) => { if (drawing) setStroke(s => [...s, getPt(e)]); };
  const onUp = () => {
    setDrawing(false);
    if (selected && stroke.length > 4) {
      const n: Pt[] = stroke.map(p => [p[0] / SIZE, p[1] / SIZE]);
      setLiveScore(scoreAgainstTemplate(n, selected.template));
    }
  };

  const cast = async () => {
    if (!selected || stroke.length < 6) return;
    setCasting(true);
    const n: Pt[] = stroke.map(p => [p[0] / SIZE, p[1] / SIZE]);
    const { data, error } = await supabase.functions.invoke("lesser-rune-cast", {
      body: { rune_key: selected.key, stroke: n, target_name: target || null },
    });
    setCasting(false);
    if (error || !data?.ok) {
      toast.error((data as any)?.error || error?.message || "The weave fails");
      return;
    }
    if (data.symbol_just_learned) toast.success(`The shape of ${selected.latin_name} is yours.`);
    else toast.message(`${selected.glyph} ${selected.latin_name} — ${data.outcome} (${data.score}%)`,
      { description: data.narrative.replace(/\*/g, "") });
    onCast?.(data);
    setStroke([]); setLiveScore(null); setTarget("");
    await reload();
    if (data.outcome !== "practice") onClose();
  };

  const clear = () => { setStroke([]); setLiveScore(null); };

  const body = (
    <div className="space-y-3">
      {!inline && (
        <p className="text-sm text-muted-foreground">
          You can only trace runes whose <em>word</em> you've learned. Tracing reveals the <em>symbol</em>.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {runes.map(r => {
          const word = knowsWord(r.key);
          return (
            <button
              key={r.key}
              onClick={() => { if (word) { setSelected(r); clear(); } }}
              disabled={!word}
              className={`px-2.5 py-1 rounded-md border text-xs transition ${
                !word ? "border-border/40 text-ash/40 cursor-not-allowed"
                : selected?.key === r.key ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/50"
              }`}
              title={word ? `${r.english_meaning} — ${r.description}` : "Word unknown — seek a teacher"}
            >
              {!word ? <Lock className="w-3 h-3 inline mr-1" /> : <span className="mr-1">{r.glyph}</span>}
              {word ? r.latin_name : "???"}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground italic">{selected.description}</p>
          <div className="flex items-center justify-between">
            <Badge variant="outline">Difficulty {selected.difficulty}</Badge>
            {!knowsSymbol(selected.key) && <Badge variant="secondary">Symbol unknown — trace to learn</Badge>}
            {liveScore !== null && (
              <Badge variant={liveScore >= 0.85 ? "default" : liveScore >= 0.6 ? "secondary" : "destructive"}>
                {Math.round(liveScore * 100)}%
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <canvas ref={canvasRef} width={SIZE} height={SIZE}
          className="rounded-lg border-2 border-border bg-muted/30 touch-none"
          style={{ width: SIZE, height: SIZE }}
          onPointerDown={onDown} onPointerMove={onMove}
          onPointerUp={onUp} onPointerCancel={onUp} />
      </div>

      {selected && knowsSymbol(selected.key) && (selected.effect?.type === "damage" || selected.effect?.type === "debuff") && (
        <Input placeholder="Target (optional NPC name)" value={target} onChange={(e) => setTarget(e.target.value)} />
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={clear} className="flex-1" disabled={casting}>Clear</Button>
        <Button onClick={cast} disabled={!selected || stroke.length < 6 || casting} className="flex-1">
          {casting ? <Loader2 className="h-4 w-4 animate-spin" /> :
            selected && !knowsSymbol(selected.key) ? "Practice" : "Cast"}
        </Button>
      </div>
    </div>
  );

  if (inline) return body;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trace a Lesser Rune</DialogTitle>
          <DialogDescription>
            You can only trace runes whose <em>word</em> you've learned. Tracing reveals the <em>symbol</em>.
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
