import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ScrollText } from "lucide-react";

interface JournalEntry {
  id: string; kind: string; title: string; body: string;
  room: string | null; created_at: string;
}

export function JournalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.from("player_journal_entries")
      .select("*").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { setEntries((data ?? []) as any); setLoading(false); });
  }, [open]);

  const fmtDate = (s: string) => new Date(s).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const renderBody = (b: string) =>
    b.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i} className="text-ember">{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-ember" /> Your Journal
          </DialogTitle>
          <DialogDescription>
            A record of your deeds, woven from your own hand as the world turns around you.
          </DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-ash italic">turning the pages…</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-ash italic">The pages are still blank. Go and live a story worth writing.</p>
        )}
        <div className="space-y-4">
          {entries.map((e) => (
            <article key={e.id} className="border-l-2 border-ember/40 pl-3 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="font-display text-base text-parchment">{e.title}</h4>
                <span className="text-[10px] font-mono text-ash whitespace-nowrap">{fmtDate(e.created_at)}</span>
              </div>
              <p className="text-sm text-whisper leading-relaxed">{renderBody(e.body)}</p>
              {e.room && <span className="text-[10px] font-mono text-ash/70 uppercase tracking-widest">— at {e.room}</span>}
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
