import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, ScrollText } from "lucide-react";

interface JournalEntry {
  id: string; kind: string; title: string; body: string;
  room: string | null; created_at: string;
}
interface LoreEntry {
  slug: string; title: string; summary: string | null;
  content: string; keywords: string[]; source_url: string;
}
interface Discovery { lore_slug: string; source: string; discovered_at: string; }

export function ChronicleModal({
  open, onClose, lore, discoveries, openSlug, setOpenSlug, initialTab = "journal",
}: {
  open: boolean; onClose: () => void;
  lore: LoreEntry[]; discoveries: Discovery[];
  openSlug: string | null; setOpenSlug: (s: string | null) => void;
  initialTab?: "journal" | "codex";
}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"journal" | "codex">(initialTab);

  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

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

  const discMap = new Map(discoveries.map(d => [d.lore_slug, d]));
  const sortedLore = [...lore].sort((a, b) => a.title.localeCompare(b.title));
  const openEntry = openSlug ? lore.find(l => l.slug === openSlug) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-ember" /> Your Chronicle
          </DialogTitle>
          <DialogDescription>
            The deeds of your hand and the truths you've uncovered.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="journal" className="flex items-center gap-1.5">
              <ScrollText className="w-3.5 h-3.5" /> Journal
              <span className="font-mono text-[10px] text-ash">({entries.length})</span>
            </TabsTrigger>
            <TabsTrigger value="codex" className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Codex
              <span className="font-mono text-[10px] text-ash">({discoveries.length}/{lore.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="journal" className="overflow-y-auto mt-3 pr-1">
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
          </TabsContent>

          <TabsContent value="codex" className="overflow-y-auto mt-3 pr-1">
            {openEntry ? (
              <div>
                <button onClick={() => setOpenSlug(null)} className="font-mono text-xs text-ash hover:text-ember mb-3">← back to codex</button>
                <h3 className="font-display text-2xl text-ember mb-1">{openEntry.title}</h3>
                {openEntry.summary && <p className="text-whisper italic mb-4">{openEntry.summary}</p>}
                <div className="text-parchment whitespace-pre-line leading-relaxed font-body text-sm">{openEntry.content}</div>
                <p className="font-mono text-[10px] text-ash mt-6">
                  discovered via {discMap.get(openEntry.slug)?.source ?? "unknown"} ·{" "}
                  <a href={openEntry.source_url} target="_blank" rel="noreferrer" className="hover:text-ember underline">source</a>
                </p>
              </div>
            ) : (
              <div>
                {discoveries.length === 0 && (
                  <p className="text-ash italic p-6 text-center">You have uncovered no truths yet. Examine the world.</p>
                )}
                {sortedLore
                  .filter(l => discMap.has(l.slug))
                  .map((l) => (
                    <button
                      key={l.slug}
                      onClick={() => setOpenSlug(l.slug)}
                      className="w-full text-left px-4 py-3 border-l-2 border-ember/60 hover:bg-ember/5 hover:border-ember transition-colors"
                    >
                      <div className="font-display text-lg text-parchment">{l.title}</div>
                      <div className="font-body text-sm text-ash italic">{l.summary}</div>
                    </button>
                  ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
