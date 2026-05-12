// Town board: Quests | Bounties.
// (Bank is now a physical room — see BankModal, which only opens when standing in a bank.)
// Renders only when the player is in a room with a town_key.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Coins, ScrollText, Skull, Plus } from "lucide-react";

interface Town { key: string; name: string; blurb: string }
interface PostedQuest {
  id: string; town_key: string; author_user_id: string | null; author_name: string;
  title: string; description: string; objective: string;
  reward_gold: number; reward_xp: number; status: string; created_at: string;
}
interface Bounty {
  id: string; town_key: string; posted_by: string | null; posted_by_name: string;
  target_user_id: string; target_name: string; reason: string;
  reward_gold: number; alive_bonus_gold: number; status: string; created_at: string;
}
interface ListResponse {
  ok: true;
  town: Town;
  town_rep: number; merit: number; gold: number;
  bank: { balance: number; opened_at: string } | null;
  bank_unlocked: boolean;
  merit_bar: number; rep_bar: number;
  quests: PostedQuest[]; bounties: Bounty[];
  bounties_on_me: Bounty[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  onProfileChange?: () => void;
}

export function BoardModal({ open, onClose, userId, onProfileChange }: Props) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setBusy(true);
    try {
      const { data: d, error } = await supabase.functions.invoke("town-board", { body: { action: "list" } });
      if (error || d?.error) throw new Error(d?.error ?? error?.message);
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the board");
      onClose();
    } finally { setBusy(false); }
  };

  useEffect(() => { if (open) reload(); }, [open]);

  const call = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      const { data: d, error } = await supabase.functions.invoke("town-board", { body });
      if (error || d?.error) throw new Error(d?.error ?? error?.message);
      if (ok) toast.success(ok);
      onProfileChange?.();
      await reload();
      return d;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refused");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-bone border-ash">
        <DialogHeader>
          <DialogTitle className="font-display text-ink">{data?.town.name ?? "Town Board"}</DialogTitle>
          <DialogDescription className="text-ash text-xs">
            {data ? <>Town rep: <span className="text-ink">{data.town_rep}</span> · Merit: <span className="text-ink">{data.merit}</span> · Purse: <span className="text-ink">{data.gold}g</span></> : "Reading the boards…"}
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="flex items-center justify-center py-10 text-ash"><Loader2 className="animate-spin mr-2" /> opening the ledger…</div>
        ) : (
          <Tabs defaultValue="quests">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="quests"><ScrollText className="w-4 h-4 mr-1" /> Quests</TabsTrigger>
              <TabsTrigger value="bounties"><Skull className="w-4 h-4 mr-1" /> Bounties</TabsTrigger>
              <TabsTrigger value="bank"><Landmark className="w-4 h-4 mr-1" /> Bank</TabsTrigger>
            </TabsList>

            <TabsContent value="quests">
              <QuestsTab data={data} busy={busy} call={call} userId={userId} />
            </TabsContent>
            <TabsContent value="bounties">
              <BountiesTab data={data} busy={busy} call={call} userId={userId} />
            </TabsContent>
            <TabsContent value="bank">
              <BankTab data={data} busy={busy} call={call} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuestsTab({ data, busy, call, userId }: { data: ListResponse; busy: boolean; call: (b: Record<string, unknown>, ok?: string) => Promise<unknown>; userId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [obj, setObj] = useState(""); const [reward, setReward] = useState(20);
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {!showForm ? (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="w-3 h-3 mr-1" /> Post a quest (20g fee + reward)
        </Button>
      ) : (
        <div className="border border-ash p-3 space-y-2 bg-bone">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          <Textarea placeholder="Why do you need this done?" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={600} />
          <Input placeholder="Objective (e.g. 'Reach the High Sanctum')" value={obj} onChange={(e) => setObj(e.target.value)} maxLength={200} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-ash">Reward (gold)</span>
            <Input type="number" className="w-24" value={reward} min={5} onChange={(e) => setReward(parseInt(e.target.value) || 0)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={async () => {
              await call({ action: "post_quest", title, description: desc, objective: obj, reward_gold: reward }, "Posted.");
              setShowForm(false); setTitle(""); setDesc(""); setObj("");
            }}>Post</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {data.quests.length === 0 && <div className="text-ash text-sm italic">The board is bare. Post the first job.</div>}
      {data.quests.map(q => (
        <div key={q.id} className="border border-ash/60 p-3 bg-bone/60">
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="font-display text-ink">{q.title}</div>
              <div className="text-xs text-ash">posted by {q.author_name}</div>
            </div>
            <div className="text-right text-sm text-ink whitespace-nowrap">
              <Coins className="w-3 h-3 inline mr-1" />{q.reward_gold}g{q.reward_xp ? ` · +${q.reward_xp}xp` : ""}
            </div>
          </div>
          {q.description && <div className="text-sm text-ink/80 mt-1">{q.description}</div>}
          {q.objective && <div className="text-xs text-ash mt-1 italic">→ {q.objective}</div>}
          {q.author_user_id !== userId && (
            <Button size="sm" className="mt-2" disabled={busy}
              onClick={() => call({ action: "claim_quest", posted_quest_id: q.id }, "Quest accepted.")}>
              Take it on
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function BountiesTab({ data, busy, call, userId }: { data: ListResponse; busy: boolean; call: (b: Record<string, unknown>, ok?: string) => Promise<unknown>; userId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(""); const [reason, setReason] = useState("");
  const [reward, setReward] = useState(50); const [alive, setAlive] = useState(50);
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      {data.bounties_on_me.length > 0 && (
        <div className="border border-ember/60 p-3 bg-ember/10 text-sm">
          <div className="font-display text-ember mb-1">⚠ A price hangs on your head.</div>
          {data.bounties_on_me.map(b => (
            <div key={b.id} className="text-ink">
              {b.posted_by_name}: <span className="text-ember">{b.reward_gold}g (+{b.alive_bonus_gold} alive)</span> — {b.reason}
            </div>
          ))}
        </div>
      )}
      {!showForm ? (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="w-3 h-3 mr-1" /> Post a bounty (gold held until claimed)
        </Button>
      ) : (
        <div className="border border-ash p-3 space-y-2">
          <Input placeholder="Target's username" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea placeholder="Why do you want them?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-ash w-24">Dead reward</span>
            <Input type="number" className="w-24" value={reward} min={50} onChange={(e) => setReward(parseInt(e.target.value) || 50)} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ash w-24">Alive bonus</span>
            <Input type="number" className="w-24" value={alive} min={0} onChange={(e) => setAlive(parseInt(e.target.value) || 0)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={async () => {
              await call({ action: "post_bounty", target_username: name, reason, reward_gold: reward, alive_bonus: alive }, "Bounty posted.");
              setShowForm(false); setName(""); setReason("");
            }}>Post</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {data.bounties.length === 0 && <div className="text-ash text-sm italic">No marks today.</div>}
      {data.bounties.map(b => (
        <div key={b.id} className="border border-ash/60 p-3 bg-bone/60">
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="font-display text-ink">Wanted: {b.target_name}</div>
              <div className="text-xs text-ash">by {b.posted_by_name}</div>
            </div>
            <div className="text-right text-sm whitespace-nowrap">
              <div className="text-ink"><Coins className="w-3 h-3 inline mr-1" />{b.reward_gold}g dead</div>
              <div className="text-ember">+{b.alive_bonus_gold}g alive</div>
            </div>
          </div>
          {b.reason && <div className="text-sm text-ink/80 mt-1 italic">"{b.reason}"</div>}
          {b.target_user_id !== userId && (
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => call({ action: "claim_bounty", bounty_id: b.id, claim_kind: "dead" }, "Claim accepted.")}>
                Claim (dead)
              </Button>
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => call({ action: "claim_bounty", bounty_id: b.id, claim_kind: "alive" }, "Claim accepted.")}>
                Claim (alive)
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BankTab({ data, busy, call }: { data: ListResponse; busy: boolean; call: (b: Record<string, unknown>, ok?: string) => Promise<unknown> }) {
  const [amt, setAmt] = useState(10);
  if (!data.bank_unlocked && !data.bank) {
    return (
      <div className="text-ash text-sm space-y-2 p-2">
        <p>The teller looks you up and down and says nothing.</p>
        <p className="text-xs">Need <span className="text-ink">Merit ≥ {data.merit_bar}</span> (you have {data.merit}) <span className="italic">or</span> <span className="text-ink">town rep ≥ {data.rep_bar}</span> (you have {data.town_rep}) to open an account here.</p>
      </div>
    );
  }
  if (!data.bank) {
    return (
      <div className="space-y-2 p-2">
        <p className="text-sm text-ink">The teller nods. You qualify for an account in {data.town.name}.</p>
        <Button size="sm" disabled={busy} onClick={() => call({ action: "bank_open" }, "Account opened.")}>
          Open account
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-2">
      <div className="text-ink">
        Vault balance: <span className="font-display">{data.bank.balance}g</span>
      </div>
      <div className="text-xs text-ash">On you: {data.gold}g</div>
      <div className="flex items-center gap-2">
        <Input type="number" className="w-28" value={amt} min={1} onChange={(e) => setAmt(parseInt(e.target.value) || 1)} />
        <Button size="sm" disabled={busy} onClick={() => call({ action: "bank_deposit", amount: amt }, "Deposited.")}>Deposit</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => call({ action: "bank_withdraw", amount: amt }, "Withdrawn.")}>Withdraw</Button>
      </div>
    </div>
  );
}
