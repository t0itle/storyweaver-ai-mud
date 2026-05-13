import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Coins, Shield, Scale, Sparkles, Lock, Check } from "lucide-react";

type Stock = {
  id: string; kind: "lesser_rune" | "kanji_rune" | "item"; ref_key: string;
  price_gold: number; rank_required: number; blurb: string;
  display: string; owned: boolean; locked: boolean;
};
type QuestTpl = { id: string; title: string; objective: string; rank_required: number; reward_gold: number; reward_xp: number; };
type ListResp = {
  ok: true;
  guild: { key: string; name: string; blurb: string; glyph: string; specialty: string };
  chapter: { hall_room: string; flavor_blurb: string };
  guildmaster: { id: string; name: string; title: string };
  membership: { status: "prospect" | "initiating" | "member"; rank: number; rank_name: string; quests_completed: number; next_threshold: number };
  gold: number;
  stock: Stock[];
  quests: QuestTpl[];
  active_guild_quests: { id: string; title: string; status: string }[];
};

interface Props { open: boolean; onClose: () => void; guildmasterId: string | null; onChanged: () => void; }

const guildIcon = (k: string) =>
  k === "warriors" ? <Shield className="w-4 h-4" /> :
  k === "traders"  ? <Scale  className="w-4 h-4" /> :
                     <Sparkles className="w-4 h-4" />;

export function GuildModal({ open, onClose, guildmasterId, onChanged }: Props) {
  const [data, setData] = useState<ListResp | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!guildmasterId) return;
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke("guild-action", {
      body: { action: "list", guildmaster_id: guildmasterId },
    });
    setBusy(false);
    if (error || !(res as any)?.ok) { toast.error((res as any)?.error ?? error?.message ?? "failed"); return; }
    setData(res as ListResp);
  }
  useEffect(() => { if (open && guildmasterId) load(); }, [open, guildmasterId]);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    if (!guildmasterId) return;
    setBusy(true);
    const { data: res, error } = await supabase.functions.invoke("guild-action", {
      body: { action, guildmaster_id: guildmasterId, ...extra },
    });
    setBusy(false);
    const r = res as any;
    if (error || !r?.ok) { toast.error(r?.error ?? error?.message ?? "failed"); return; }
    if (r.message) toast.success(r.message);
    else if (action === "accept_quest") toast.success("Task taken up.");
    else if (action === "learn_rune") toast.success("The rune is yours.");
    else if (action === "buy_item") toast.success("Stock claimed.");
    onChanged();
    load();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {data && guildIcon(data.guild.key)}
            <span>{data?.guildmaster.name ?? "Guildmaster"}</span>
            {data && <span className="text-ash text-sm font-normal italic">— {data.guild.name}</span>}
          </DialogTitle>
          <DialogDescription>
            {data ? data.chapter.flavor_blurb : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-ash">
              <span className="flex items-center gap-2">
                <Coins className="w-3 h-3" /> {data.gold}g
                <Badge variant="outline" className="ml-1">{data.membership.rank_name}</Badge>
                <span className="text-[10px]">
                  {data.membership.status === "member"
                    ? `${data.membership.quests_completed} / ${data.membership.next_threshold} guild tasks`
                    : data.membership.status === "initiating" ? "initiation in progress"
                    : "not a member"}
                </span>
              </span>
              <span className="italic">{data.guild.specialty}</span>
            </div>

            {data.membership.status === "prospect" && (
              <div className="rounded border border-ember/40 bg-ember/5 p-3 space-y-2">
                <div className="text-sm font-display text-ember">An initiation awaits.</div>
                <div className="text-xs text-parchment">
                  Before this chapter will trade with you or set you tasks, walk the {data.guild.name}'s short rite.
                </div>
                <Button size="sm" disabled={busy} onClick={() => call("initiate")}>Begin initiation</Button>
              </div>
            )}

            {data.membership.status === "initiating" && (
              <div className="rounded border border-accent/40 bg-accent/5 p-3 text-xs text-parchment">
                Your initiation quest is active. Walk the chapter's circuit and return to {data.guildmaster.name}.
              </div>
            )}

            <Tabs defaultValue="quests">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="quests">Tasks</TabsTrigger>
                <TabsTrigger value="stock">Stock</TabsTrigger>
              </TabsList>

              <TabsContent value="quests" className="space-y-1.5 mt-3">
                {data.active_guild_quests.length > 0 && (
                  <div className="text-[10px] uppercase tracking-widest text-ash mb-1">Already on your hands</div>
                )}
                {data.active_guild_quests.map((q) => (
                  <div key={q.id} className="text-xs text-moss border-b border-border/40 py-1.5">
                    ◆ {q.title} <span className="text-ash italic">— {q.status}</span>
                  </div>
                ))}
                {data.quests.length === 0 && data.membership.status === "member" && (
                  <div className="text-ash italic text-xs">No new tasks for your rank today.</div>
                )}
                {data.quests.length === 0 && data.membership.status !== "member" && (
                  <div className="text-ash italic text-xs">Members only.</div>
                )}
                {data.quests.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs border-b border-border/40 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-parchment truncate">{t.title}</div>
                      <div className="text-ash text-[10px]">{t.objective}</div>
                    </div>
                    <div className="text-ember font-mono whitespace-nowrap text-[10px]">
                      {t.reward_gold}g · {t.reward_xp}xp
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || data.membership.status !== "member"}
                      onClick={() => call("accept_quest", { template_id: t.id })}
                    >
                      Accept
                    </Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="stock" className="space-y-1.5 mt-3">
                {data.stock.length === 0 && <div className="text-ash italic text-xs">No stock today.</div>}
                {data.stock.map((s) => {
                  const action = s.kind === "item" ? "buy_item" : "learn_rune";
                  const verb = s.kind === "item" ? "Buy" : "Learn";
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-xs border-b border-border/40 py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-parchment truncate">{s.display}</div>
                        <div className="text-ash text-[10px]">
                          {s.kind === "item" ? "item" : s.kind === "lesser_rune" ? "lesser rune" : "kanji rune"}
                          {s.rank_required > 0 && <> · rank ≥ {s.rank_required}</>}
                          {s.owned && <> · already known</>}
                        </div>
                      </div>
                      <div className="text-ember font-mono whitespace-nowrap">{s.price_gold}g</div>
                      {s.owned ? (
                        <span className="text-moss text-[11px] flex items-center gap-1"><Check className="w-3 h-3" /> known</span>
                      ) : s.locked ? (
                        <span className="text-ash text-[11px] flex items-center gap-1"><Lock className="w-3 h-3" /> rank</span>
                      ) : (
                        <Button size="sm" disabled={busy || data.gold < s.price_gold}
                          onClick={() => call(action, { stock_id: s.id })}>{verb}</Button>
                      )}
                    </div>
                  );
                })}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
