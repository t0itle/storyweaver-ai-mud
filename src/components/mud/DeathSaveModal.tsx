import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Pt } from "@/lib/dollarOne";
import { toast } from "sonner";

interface Props { open: boolean; onResolved: (saved: boolean) => void; }
const SIZE = 280;
const TIME_LIMIT_MS = 12_000;
const RUNE_KEY = "sana";

export function DeathSaveModal({ open, onResolved }: Props) {
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(TIME_LIMIT_MS);
  const [knows, setKnows] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedAt = useRef<number>(0);
  const submittedRef = useRef(false);

  // Check rune knowledge whenever the modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setKnows(false); return; }
      const { data } = await supabase
        .from("player_lesser_rune_knowledge")
        .select("knows_word, knows_symbol")
        .eq("user_id", user.id).eq("rune_key", RUNE_KEY).maybeSingle();
      if (!cancelled) setKnows(!!(data?.knows_word && data?.knows_symbol));
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Timer (only when they actually have a chance — they know the rune)
  useEffect(() => {
    if (!open || knows !== true) return;
    submittedRef.current = false;
    setStroke([]);
    setRemaining(TIME_LIMIT_MS);
    startedAt.current = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, TIME_LIMIT_MS - (Date.now() - startedAt.current));
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        submittedRef.current = true;
        window.clearInterval(tick);
        submit(true);
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [open, knows]);

  // Draw stroke
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "rgba(20, 0, 0, 0.6)"; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = "rgba(220, 60, 60, 0.4)"; ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, SIZE - 16, SIZE - 16);
    if (stroke.length > 1) {
      ctx.strokeStyle = "#ff4444"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(stroke[0][0], stroke[0][1]);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i][0], stroke[i][1]);
      ctx.stroke();
    }
  }, [stroke]);

  const ptFromEvent = (e: React.PointerEvent): Pt => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
  };

  const submit = async (timeout = false) => {
    if (submittedRef.current && !timeout) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("combat-action", {
        body: { action: "death_save", stroke, rune_key: RUNE_KEY },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      onResolved(!!data?.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The dark takes you.");
      onResolved(false);
    } finally { setSubmitting(false); }
  };

  const seconds = (remaining / 1000).toFixed(1);

  return (
    <Dialog open={open} onOpenChange={() => { /* cannot dismiss */ }}>
      <DialogContent className="bg-black border-red-900 text-red-100 max-w-md [&>button]:hidden">
        {knows === null ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-red-300 text-xl tracking-wider">⌛ Your blood pools</DialogTitle>
              <DialogDescription className="text-red-200/70">Searching your memory for any rune of life…</DialogDescription>
            </DialogHeader>
          </>
        ) : knows === false ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-red-300 text-xl tracking-wider">✚ No rune of life</DialogTitle>
              <DialogDescription className="text-red-200/70">
                You never learned the Last Breath rune — <strong className="text-red-300">✚ Sana</strong>.
                Without its word <em>and</em> shape in your hand, there is no sigil to trace.
                The breath leaves you. This is <strong className="text-red-400">permanent death</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <p className="text-xs text-red-200/50 italic">
                Seek scholars, healers, and shrines of ✚ Sana. Learn the word, then the symbol — and you will have a chance next time.
              </p>
              <Button className="w-full bg-red-900 hover:bg-red-800 text-red-50"
                onClick={() => submit(false)} disabled={submitting}>
                {submitting ? "…" : "Slip into the dark"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-red-300 text-xl tracking-wider">⌛ Your blood pools</DialogTitle>
              <DialogDescription className="text-red-200/70">
                Trace <strong className="text-red-300">✚ Sana</strong> — the Last Breath rune — before your breath runs out.
                Fail and it is <strong className="text-red-400">permanent death</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center justify-between font-mono text-sm">
                <span className={remaining < 4000 ? "text-red-400 animate-pulse" : "text-red-200"}>{seconds}s</span>
                <span className="text-red-200/60">{stroke.length} pts</span>
              </div>
              <div className="rounded border border-red-900/60 overflow-hidden touch-none">
                <canvas
                  ref={canvasRef} width={SIZE} height={SIZE}
                  className="w-full bg-black cursor-crosshair"
                  onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrawing(true); setStroke([ptFromEvent(e)]); }}
                  onPointerMove={(e) => { if (!drawing) return; setStroke((s) => [...s, ptFromEvent(e)]); }}
                  onPointerUp={() => setDrawing(false)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-red-800 text-red-200 hover:bg-red-950"
                  onClick={() => setStroke([])} disabled={submitting}>Clear</Button>
                <Button className="flex-1 bg-red-700 hover:bg-red-600 text-red-50"
                  onClick={() => submit(false)} disabled={submitting || stroke.length < 6}>
                  {submitting ? "…" : "Trace ✚ Sana"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
