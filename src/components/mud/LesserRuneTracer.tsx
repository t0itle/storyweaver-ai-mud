import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { scoreAgainstTemplate, type Pt } from "@/lib/dollarOne";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface LesserRune {
  key: string;
  latin_name: string;
  english_meaning: string;
  glyph: string;
  description: string;
  template: Pt[];
  difficulty: number;
  effect: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCast?: (result: { outcome: string; score: number; narrative: string }) => void;
}

const SIZE = 280;

export function LesserRuneTracer({ open, onClose, onCast }: Props) {
  const [runes, setRunes] = useState<LesserRune[]>([]);
  const [selected, setSelected] = useState<LesserRune | null>(null);
  const [target, setTarget] = useState("");
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [casting, setCasting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    supabase.from("lesser_runes").select("*").order("difficulty").then(({ data }) => {
      if (data) setRunes(data as any);
    });
  }, [open]);

  // Draw template ghost + current stroke
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    if (selected) {
      // ghost template
      ctx.strokeStyle = "hsl(var(--muted-foreground) / 0.25)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      selected.template.forEach((p, i) => {
        const x = p[0] * SIZE, y = p[1] * SIZE;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (stroke.length > 1) {
      ctx.strokeStyle = liveScore !== null && liveScore < 0.35
        ? "hsl(var(--destructive))"
        : "hsl(var(--primary))";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
      ctx.stroke();
    }
  }, [stroke, selected, liveScore]);

  const getPt = (e: React.PointerEvent): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * SIZE,
      ((e.clientY - rect.top) / rect.height) * SIZE,
    ];
  };

  const onDown = (e: React.PointerEvent) => {
    if (!selected) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(true);
    setLiveScore(null);
    setStroke([getPt(e)]);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    setStroke(s => [...s, getPt(e)]);
  };
  const onUp = () => {
    setDrawing(false);
    if (selected && stroke.length > 4) {
      const normalized: Pt[] = stroke.map(p => [p[0] / SIZE, p[1] / SIZE]);
      const s = scoreAgainstTemplate(normalized, selected.template);
      setLiveScore(s);
    }
  };

  const cast = async () => {
    if (!selected || stroke.length < 6) return;
    setCasting(true);
    const normalized: Pt[] = stroke.map(p => [p[0] / SIZE, p[1] / SIZE]);
    const { data, error } = await supabase.functions.invoke("lesser-rune-cast", {
      body: { rune_key: selected.key, stroke: normalized, target_name: target || null },
    });
    setCasting(false);
    if (error || !data?.ok) {
      toast.error(data?.error || error?.message || "The weave fails");
      return;
    }
    const tone = data.outcome === "perfect" ? "success" : data.outcome === "backfire" ? "error" : "info";
    (toast as any)[tone === "success" ? "success" : tone === "error" ? "error" : "message"](
      `${selected.glyph} ${selected.latin_name} — ${data.outcome} (${data.score}%)`,
      { description: data.narrative.replace(/\*/g, "") }
    );
    onCast?.(data);
    setStroke([]); setLiveScore(null); setTarget("");
    onClose();
  };

  const clear = () => { setStroke([]); setLiveScore(null); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Trace a Lesser Rune</DialogTitle>
          <DialogDescription>
            Pick a glyph, then trace it on the slate. A clean stroke holds the weave; a sloppy one bites back.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {runes.map(r => (
            <button
              key={r.key}
              onClick={() => { setSelected(r); clear(); }}
              className={`px-2.5 py-1 rounded-md border text-xs transition ${
                selected?.key === r.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50"
              }`}
              title={`${r.english_meaning} — ${r.description}`}
            >
              <span className="mr-1">{r.glyph}</span>{r.latin_name}
            </button>
          ))}
        </div>

        {selected && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground italic">{selected.description}</p>
            <div className="flex items-center justify-between">
              <Badge variant="outline">Difficulty {selected.difficulty}</Badge>
              {liveScore !== null && (
                <Badge variant={liveScore >= 0.85 ? "default" : liveScore >= 0.6 ? "secondary" : "destructive"}>
                  {Math.round(liveScore * 100)}% match
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="rounded-lg border-2 border-border bg-muted/30 touch-none"
            style={{ width: SIZE, height: SIZE }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>

        {selected && (selected.effect?.type === "damage" || selected.effect?.type === "debuff") && (
          <Input
            placeholder="Target (optional NPC name)"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={clear} className="flex-1" disabled={casting}>Clear</Button>
          <Button onClick={cast} disabled={!selected || stroke.length < 6 || casting} className="flex-1">
            {casting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cast"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
