import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Backpack, Sparkles, X, Sword, Shield, Gem, HardHat, Shirt, Footprints, Circle } from "lucide-react";

export interface InvItem {
  id: string;
  item_key: string;
  quantity: number;
  equipped_slot: string | null;
  container_id: string | null;
  items: {
    key: string; name: string; description: string; slot: string;
    weight: number; stackable: boolean; base_damage: number; base_armor: number;
    rune_slots: number; capacity_weight: number; heal_amount: number;
  };
  item_runes: { id: string; rune_key: string; charges: number; max_charges: number; runes: { name: string; glyph: string; kind: string; description: string; effect: any; } }[];
}
export interface KnownRune {
  rune_key: string;
  runes: { key: string; name: string; glyph: string; kind: string; description: string; max_charges: number; rarity: string; };
}

const EQUIP_SLOTS = ["head","neck","body","legs","feet","main_hand","off_hand","ring","focus"];
const SLOT_ICON: Record<string, any> = {
  main_hand: Sword, off_hand: Shield, body: Shirt, head: HardHat, feet: Footprints,
  neck: Circle, ring: Circle, legs: Shirt, focus: Gem,
};

export function InventoryPanel({
  items, onClose, onChanged, totalWeight, maxWeight,
}: {
  items: InvItem[]; onClose: () => void; onChanged: () => void;
  totalWeight: number; maxWeight: number;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (action: string, body: Record<string, unknown>) => {
    setBusyId(body.player_item_id as string);
    try {
      const { data, error } = await supabase.functions.invoke("inventory-action", {
        body: { action, ...body },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success(data.message ?? "Done.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "It will not budge.");
    } finally { setBusyId(null); }
  };

  const equipped = items.filter(i => i.equipped_slot);
  const carried = items.filter(i => !i.equipped_slot);

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Backpack className="w-4 h-4 text-ember" />
            <h2 className="font-display text-xl text-parchment">What You Carry</h2>
            <span className="font-mono text-[10px] text-ash uppercase tracking-widest">{totalWeight.toFixed(1)} / {maxWeight} weight</span>
          </div>
          <button onClick={onClose} className="text-ash hover:text-parchment"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-5">
          <Section title="Worn & Wielded">
            {equipped.length === 0 ? <Empty text="Nothing equipped." /> : equipped.map(it => (
              <ItemRow key={it.id} it={it} busy={busyId === it.id}
                actions={[
                  { label: "unequip", run: () => act("unequip", { player_item_id: it.id }) },
                ]} />
            ))}
          </Section>

          <Section title="In Your Pack">
            {carried.length === 0 ? <Empty text="Empty." /> : carried.map(it => {
              const actions: { label: string; run: () => void }[] = [];
              if (EQUIP_SLOTS.includes(it.items.slot)) actions.push({ label: "equip", run: () => act("equip", { player_item_id: it.id, slot: it.items.slot }) });
              if (it.items.slot === "consumable") actions.push({ label: it.items.heal_amount > 0 ? `use (+${it.items.heal_amount} hp)` : "use", run: () => act("use", { player_item_id: it.id }) });
              actions.push({ label: "drop", run: () => act("drop", { player_item_id: it.id }) });
              return <ItemRow key={it.id} it={it} busy={busyId === it.id} actions={actions} />;
            })}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="font-body text-ash italic text-sm">{text}</p>;
}

function ItemRow({ it, actions, busy }: { it: InvItem; actions: { label: string; run: () => void }[]; busy: boolean }) {
  const Icon = SLOT_ICON[it.items.slot];
  return (
    <div className="border-l-2 border-border pl-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-display text-parchment flex items-center gap-2">
            {Icon && <Icon className="w-3.5 h-3.5 text-ember" />}
            {it.items.name}
            {it.quantity > 1 && <span className="font-mono text-xs text-ash">×{it.quantity}</span>}
            {it.equipped_slot && <span className="font-mono text-[10px] text-moss uppercase">equipped: {it.equipped_slot}</span>}
          </div>
          <p className="text-ash italic text-sm">{it.items.description}</p>
          <div className="flex flex-wrap gap-3 mt-1 font-mono text-[10px] text-ash">
            {it.items.base_damage > 0 && <span>dmg {it.items.base_damage}</span>}
            {it.items.base_armor > 0 && <span>armor {it.items.base_armor}</span>}
            {it.items.rune_slots > 0 && <span>runes {it.item_runes.length}/{it.items.rune_slots}</span>}
            <span>{it.items.weight}w</span>
          </div>
          {it.item_runes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {it.item_runes.map(ir => (
                <span key={ir.id} className="font-mono text-[11px] text-ember border border-ember/40 px-1.5 py-0.5">
                  {ir.runes.glyph} {ir.runes.name}{ir.max_charges > 0 ? ` ${ir.charges}/${ir.max_charges}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {actions.map(a => (
            <button key={a.label} onClick={a.run} disabled={busy}
              className="font-mono text-[10px] uppercase tracking-wider text-ash hover:text-ember border border-border hover:border-ember px-2 py-1 transition-colors disabled:opacity-40">
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RunesPanel({
  known, items, onClose, onChanged,
}: {
  known: KnownRune[]; items: InvItem[]; onClose: () => void; onChanged: () => void;
}) {
  const [selectedRune, setSelectedRune] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const weave = async (rune_key: string, player_item_id: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("rune-action", {
        body: { action: "weave", rune_key, player_item_id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success(data.message);
      setSelectedRune(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The rune resists.");
    } finally { setBusy(false); }
  };

  const weavable = items.filter(i => i.items.rune_slots > 0 && i.item_runes.length < i.items.rune_slots);

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-ember" />
            <h2 className="font-display text-xl text-parchment">Runes You Know</h2>
            <span className="font-mono text-[10px] text-ash uppercase tracking-widest">{known.length} learned</span>
          </div>
          <button onClick={onClose} className="text-ash hover:text-parchment"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto px-4 py-4 space-y-3">
          {known.length === 0 && (
            <p className="text-ash italic text-sm">You know no runes yet. Seek a rune-scribe — or unearth knowledge in lore.</p>
          )}
          {known.map(({ runes: r }) => (
            <div key={r.key} className="border-l-2 border-ember/50 pl-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-display text-parchment text-lg">
                    <span className="text-ember mr-2">{r.glyph}</span>{r.name}
                    <span className="font-mono text-[10px] text-ash ml-2 uppercase">{r.kind}{r.kind === "active" ? ` · ${r.max_charges} charges` : ""}</span>
                  </div>
                  <p className="text-ash italic text-sm">{r.description}</p>
                </div>
                <button onClick={() => setSelectedRune(selectedRune === r.key ? null : r.key)}
                  className="font-mono text-[10px] uppercase tracking-wider text-ash hover:text-ember border border-border hover:border-ember px-2 py-1 transition-colors">
                  {selectedRune === r.key ? "cancel" : "weave"}
                </button>
              </div>
              {selectedRune === r.key && (
                <div className="mt-2 pl-2 border-l border-ember/30 space-y-1">
                  <p className="font-mono text-[10px] text-ash uppercase tracking-widest">Weave into…</p>
                  {weavable.length === 0 && <p className="text-ash italic text-xs">No item with free rune slots.</p>}
                  {weavable.map(it => (
                    <button key={it.id} disabled={busy} onClick={() => weave(r.key, it.id)}
                      className="block text-left w-full text-sm text-parchment hover:text-ember disabled:opacity-40">
                      → {it.items.name} <span className="text-ash text-xs">({it.item_runes.length}/{it.items.rune_slots} slots)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Combat HUD — shown when in_combat_id is set
export function CombatHUD({
  combatId, userId, onAct,
}: {
  combatId: string; userId: string; onAct: (kind: string, args?: Record<string, unknown>) => Promise<void>;
}) {
  const [combatants, setCombatants] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [combat, setCombat] = useState<any>(null);
  const [castOpen, setCastOpen] = useState(false);
  const [knownRunes, setKnownRunes] = useState<{ rune_key: string; runes: any }[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: c }, { data: cs }, { data: a }, { data: kr }] = await Promise.all([
        supabase.from("combats").select("*").eq("id", combatId).maybeSingle(),
        supabase.from("combatants").select("*").eq("combat_id", combatId).order("turn_order"),
        supabase.from("combat_actions").select("*").eq("combat_id", combatId).order("created_at", { ascending: true }).limit(20),
        supabase.from("player_runes").select("rune_key, runes(*)").eq("user_id", userId),
      ]);
      setCombat(c); setCombatants(cs ?? []); setActions(a ?? []); setKnownRunes((kr ?? []) as any);
    };
    load();
    const ch = supabase.channel(`combat:${combatId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "combats", filter: `id=eq.${combatId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "combatants", filter: `combat_id=eq.${combatId}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "combat_actions", filter: `combat_id=eq.${combatId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [combatId, userId]);

  if (!combat) return null;
  const me = combatants.find(c => c.user_id === userId);
  const myTurn = combat.current_combatant_id === me?.id && combat.status === "active";
  const sideA = combatants.filter(c => c.side === "a");
  const sideB = combatants.filter(c => c.side === "b");

  const activeRunes = knownRunes.filter(r => r.runes.kind === "active");

  return (
    <div className="border border-ember/60 bg-card/80 p-3 mb-3 shadow-[0_0_25px_-12px_hsl(var(--ember))]">
      <div className="flex items-center justify-between mb-2">
        <div className="font-display text-ember flex items-center gap-2">
          <Sword className="w-4 h-4" /> Combat — turn {combat.turn_number}
        </div>
        <span className="font-mono text-[10px] text-ash uppercase tracking-widest">{combat.status}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <SideColumn label="Allies (A)" list={sideA} currentId={combat.current_combatant_id} />
        <SideColumn label="Foes (B)" list={sideB} currentId={combat.current_combatant_id} />
      </div>

      {actions.length > 0 && (
        <div className="bg-background/40 border border-border p-2 mb-2 max-h-28 overflow-y-auto font-mono text-[11px] text-ash space-y-0.5">
          {actions.slice(-6).map(a => <div key={a.id}>⚔ {a.text}</div>)}
        </div>
      )}

      {combat.status === "active" && (
        <div className="flex flex-wrap gap-2">
          <CombatBtn label="attack" disabled={!myTurn} onClick={() => onAct("attack")} />
          <CombatBtn label="defend" disabled={!myTurn} onClick={() => onAct("defend")} />
          <CombatBtn label={castOpen ? "cancel cast" : "cast"} disabled={!myTurn || activeRunes.length === 0} onClick={() => setCastOpen(o => !o)} />
          <CombatBtn label="flee" disabled={!myTurn} onClick={() => onAct("flee")} />
          {!myTurn && <span className="font-mono text-[10px] text-ash self-center italic">…waiting your turn</span>}
        </div>
      )}

      {castOpen && myTurn && (
        <div className="mt-2 p-2 bg-background/40 border border-ember/30">
          <div className="font-mono text-[10px] text-ash uppercase tracking-widest mb-1">Cast which rune?</div>
          <div className="flex flex-wrap gap-1">
            {activeRunes.map(r => (
              <button key={r.rune_key} onClick={() => { setCastOpen(false); onAct("cast", { rune_key: r.rune_key }); }}
                className="font-mono text-xs text-ember border border-ember/40 hover:bg-ember/10 px-2 py-1">
                {r.runes.glyph} {r.runes.name}
              </button>
            ))}
            {activeRunes.length === 0 && <span className="text-ash italic text-xs">No active runes known.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function SideColumn({ label, list, currentId }: { label: string; list: any[]; currentId: string | null }) {
  return (
    <div>
      <div className="font-mono text-[10px] text-ash uppercase tracking-widest mb-1">{label}</div>
      <div className="space-y-1">
        {list.map(c => {
          const isTurn = c.id === currentId;
          const pct = Math.max(0, Math.min(100, (c.hp / c.max_hp) * 100));
          return (
            <div key={c.id} className={`px-2 py-1 border-l-2 ${c.defeated ? "opacity-40 border-border" : isTurn ? "border-ember bg-ember/5" : "border-border"}`}>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-display ${c.defeated ? "line-through text-ash" : "text-parchment"}`}>{c.name}</span>
                <span className="font-mono text-[10px] text-ember">{c.hp}/{c.max_hp}</span>
              </div>
              <div className="h-1 bg-background mt-1">
                <div className="h-full bg-ember/70" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CombatBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="font-mono text-xs uppercase tracking-wider px-3 py-1.5 border border-ember/50 text-ember hover:bg-ember/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      {label}
    </button>
  );
}
