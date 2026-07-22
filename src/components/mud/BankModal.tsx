// Physical bank modal — opens only when the player is standing inside a town's
// bank room (rooms.kind = 'bank'). Handles gold AND item deposits/withdrawals.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Landmark, ArrowDown, ArrowUp } from "lucide-react";

interface VaultItem {
  id: string;
  item_key: string;
  quantity: number;
  stolen: boolean;
  deposited_at: string;
  items?: { name: string; slot: string; value_gold: number | null } | null;
}

interface CarriedItem {
  id: string;
  item_key: string;
  quantity: number;
  equipped_slot: string | null;
  stolen: boolean;
  items?: { name: string; slot: string } | null;
}

interface BankData {
  ok: true;
  town: { key: string; name: string };
  town_rep: number;
  merit: number;
  gold: number;
  bank: { balance: number; opened_at: string } | null;
  bank_unlocked: boolean;
  merit_bar: number;
  rep_bar: number;
  vault_items?: VaultItem[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onProfileChange?: () => void;
}

export function BankModal({ open, onClose, onProfileChange }: Props) {
  const [data, setData] = useState<BankData | null>(null);
  const [carried, setCarried] = useState<CarriedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [amt, setAmt] = useState(10);
  const [tab, setTab] = useState<"gold" | "items">("gold");

  const reload = async () => {
    setBusy(true);
    try {
      const { data: d, error } = await supabase.functions.invoke("town-board", { body: { action: "list" } });
      if (error || d?.error) throw new Error(d?.error ?? error?.message);
      setData(d as BankData);
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: pi } = await supabase.from("player_items")
          .select("id, item_key, quantity, equipped_slot, stolen, items(name, slot)")
          .eq("user_id", u.user.id).is("container_id", null).is("equipped_slot", null)
          .order("created_at", { ascending: false });
        setCarried((pi as any) ?? []);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The teller turns away.");
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refused");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-bone border-ash max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-ink flex items-center gap-2">
            <Landmark className="w-4 h-4" /> {data?.town.name ? `${data.town.name} — Bank` : "Bank"}
          </DialogTitle>
          <DialogDescription className="text-ash text-xs">
            {data ? <>Town rep: <span className="text-ink">{data.town_rep}</span> · Merit: <span className="text-ink">{data.merit}</span> · Purse: <span className="text-ink">{data.gold}g</span></> : "The teller looks up…"}
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="flex items-center justify-center py-10 text-ash"><Loader2 className="animate-spin mr-2" /> opening the ledger…</div>
        ) : !data.bank_unlocked && !data.bank ? (
          <div className="text-ash text-sm space-y-2 p-2">
            <p>The teller looks you up and down and says nothing.</p>
            <p className="text-xs">Need <span className="text-ink">Merit ≥ {data.merit_bar}</span> (you have {data.merit}) <span className="italic">or</span> <span className="text-ink">town rep ≥ {data.rep_bar}</span> (you have {data.town_rep}) to open an account here.</p>
          </div>
        ) : !data.bank ? (
          <div className="space-y-2 p-2">
            <p className="text-sm text-ink">The teller nods. You qualify for an account in {data.town.name}.</p>
            <Button size="sm" disabled={busy} onClick={() => call({ action: "bank_open" }, "Account opened.")}>
              Open account
            </Button>
          </div>
        ) : (
          <div className="space-y-3 p-2">
            <div className="flex gap-1 border-b border-ash/40">
              <button className={`px-3 py-1 text-xs ${tab === "gold" ? "border-b-2 border-ember text-ink" : "text-ash"}`} onClick={() => setTab("gold")}>Gold</button>
              <button className={`px-3 py-1 text-xs ${tab === "items" ? "border-b-2 border-ember text-ink" : "text-ash"}`} onClick={() => setTab("items")}>Goods</button>
            </div>

            {tab === "gold" && (
              <>
                <div className="text-ink">Vault balance: <span className="font-display">{data.bank.balance}g</span></div>
                <div className="text-xs text-ash">On you: {data.gold}g</div>
                <div className="flex items-center gap-2">
                  <Input type="number" className="w-28" value={amt} min={1} onChange={(e) => setAmt(parseInt(e.target.value) || 1)} />
                  <Button size="sm" disabled={busy} onClick={() => call({ action: "bank_deposit", amount: amt }, "Deposited.")}>Deposit</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => call({ action: "bank_withdraw", amount: amt }, "Withdrawn.")}>Withdraw</Button>
                </div>
              </>
            )}

            {tab === "items" && (
              <div className="space-y-4">
                <section>
                  <h4 className="text-xs uppercase tracking-widest text-ash mb-1">In the vault</h4>
                  {(data.vault_items ?? []).length === 0 ? (
                    <p className="text-xs text-ash italic">Empty.</p>
                  ) : (
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {(data.vault_items ?? []).map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 text-xs border border-ash/30 rounded px-2 py-1">
                          <div className="min-w-0 flex-1">
                            <span className="text-ink">{v.items?.name ?? v.item_key}</span>
                            {v.quantity > 1 && <span className="text-ash"> ×{v.quantity}</span>}
                            {v.stolen && <span className="ml-1 text-rose-600">(stolen)</span>}
                          </div>
                          <Button size="sm" variant="outline" className="h-6 px-2" disabled={busy}
                            onClick={() => call({ action: "bank_withdraw_item", vault_id: v.id }, `Withdrew ${v.items?.name ?? v.item_key}.`)}>
                            <ArrowUp className="w-3 h-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h4 className="text-xs uppercase tracking-widest text-ash mb-1">On you</h4>
                  {carried.length === 0 ? (
                    <p className="text-xs text-ash italic">Nothing to lodge.</p>
                  ) : (
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {carried.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-xs border border-ash/30 rounded px-2 py-1">
                          <div className="min-w-0 flex-1">
                            <span className="text-ink">{p.items?.name ?? p.item_key}</span>
                            {p.quantity > 1 && <span className="text-ash"> ×{p.quantity}</span>}
                            {p.stolen && <span className="ml-1 text-rose-600">(stolen)</span>}
                          </div>
                          <Button size="sm" className="h-6 px-2" disabled={busy}
                            onClick={() => call({ action: "bank_deposit_item", player_item_id: p.id }, `Lodged ${p.items?.name ?? p.item_key}.`)}>
                            <ArrowDown className="w-3 h-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
