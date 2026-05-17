import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, UserPlus, Send, Check, Trash2, Users } from "lucide-react";

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
};

type Profile = { id: string; username: string; portrait_url: string | null };

type PrivateMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

type PartyMember = {
  id: string;
  name: string;
  title: string | null;
  room: string | null;
};

export function KinPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [activeFriend, setActiveFriend] = useState<string | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [searchName, setSearchName] = useState("");
  const [sending, setSending] = useState(false);
  const [party, setParty] = useState<PartyMember[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const loadParty = async () => {
    const { data: prof } = await supabase
      .from("profiles").select("companion_npc_id").eq("id", userId).maybeSingle();
    const cid = (prof as any)?.companion_npc_id;
    if (!cid) { setParty([]); return; }
    const { data: npc } = await supabase
      .from("npcs").select("id, name, title, room").eq("id", cid).maybeSingle();
    if (!npc) { setParty([]); return; }
    setParty([{ id: npc.id, name: npc.name, title: npc.title ?? null, room: npc.room ?? null }]);
  };

  const dismissCompanion = async (npcName: string) => {
    const { error } = await supabase.from("profiles").update({ companion_npc_id: null }).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    toast(`${npcName} parts ways with you.`);
    loadParty();
  };

  // Load friendships + the related profiles
  const loadFriendships = async () => {
    const { data } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    const fs = (data ?? []) as Friendship[];
    setFriendships(fs);

    const otherIds = Array.from(new Set(fs.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id)));
    if (otherIds.length) {
      const { data: ps } = await supabase.from("profiles").select("id, username, portrait_url").in("id", otherIds);
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach(p => { map[p.id] = p as Profile; });
      setProfiles(map);
    }
  };

  useEffect(() => {
    loadFriendships();
    loadParty();
    const ch = supabase
      .channel(`kin-friendships:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadFriendships())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, () => loadParty())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "npcs" }, () => loadParty())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Load conversation with active friend
  useEffect(() => {
    if (!activeFriend) { setMessages([]); return; }
    const load = async () => {
      const { data } = await supabase
        .from("private_messages")
        .select("*")
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${activeFriend}),and(sender_id.eq.${activeFriend},recipient_id.eq.${userId})`)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages((data ?? []) as PrivateMessage[]);
      // mark mine-as-recipient as read
      await supabase.from("private_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", activeFriend).eq("recipient_id", userId).is("read_at", null);
    };
    load();
    const ch = supabase
      .channel(`kin-pm:${userId}:${activeFriend}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages" }, (payload) => {
        const m = payload.new as PrivateMessage;
        if ((m.sender_id === userId && m.recipient_id === activeFriend) ||
            (m.sender_id === activeFriend && m.recipient_id === userId)) {
          setMessages(prev => [...prev, m]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, activeFriend]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const sendRequest = async () => {
    const name = searchName.trim();
    if (!name) return;
    const { data: p } = await supabase.from("profiles").select("id, username").eq("username", name).maybeSingle();
    if (!p) { toast.error("No walker by that name."); return; }
    if (p.id === userId) { toast.error("You cannot send kin spirit to yourself."); return; }
    const { error } = await supabase.from("friendships").insert({
      requester_id: userId, addressee_id: p.id, status: "pending",
    });
    if (error) {
      if (error.code === "23505") toast.error("A thread already binds you two.");
      else toast.error(error.message);
      return;
    }
    toast.success(`A kin-spirit thread reaches toward ${p.username}.`);
    setSearchName("");
    loadFriendships();
  };

  const respond = async (id: string, accept: boolean) => {
    if (accept) {
      const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
      if (error) toast.error(error.message); else toast.success("The thread is bound.");
    } else {
      const { error } = await supabase.from("friendships").delete().eq("id", id);
      if (error) toast.error(error.message); else toast("The thread frays.");
    }
    loadFriendships();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("friendships").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast("The thread is cut."); setActiveFriend(null); loadFriendships(); }
  };

  const send = async () => {
    if (!activeFriend || !draft.trim()) return;
    setSending(true);
    const text = draft.trim().slice(0, 2000);
    const { error } = await supabase.from("private_messages").insert({
      sender_id: userId, recipient_id: activeFriend, content: text,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setDraft("");
  };

  const accepted = friendships.filter(f => f.status === "accepted");
  const incoming = friendships.filter(f => f.status === "pending" && f.addressee_id === userId);
  const outgoing = friendships.filter(f => f.status === "pending" && f.requester_id === userId);

  const otherOf = (f: Friendship) => f.requester_id === userId ? f.addressee_id : f.requester_id;

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-ember" />
            <h2 className="font-display text-xl text-parchment">Kin Spirits</h2>
            <span className="font-mono text-[10px] text-ash uppercase tracking-widest">{accepted.length} bound</span>
          </div>
          <button onClick={onClose} className="text-ash hover:text-parchment"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-0">
          {/* Left: friends list + add */}
          <aside className="border-r border-border overflow-y-auto p-3 space-y-4">
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-ash">Reach for a name</label>
              <div className="flex gap-1">
                <input
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="exact walker name"
                  className="flex-1 bg-background/60 border border-border focus:border-ember outline-none px-2 py-1 text-sm font-body text-parchment placeholder:text-ash/40"
                  onKeyDown={(e) => { if (e.key === "Enter") sendRequest(); }}
                />
                <button onClick={sendRequest} className="px-2 border border-ember/50 text-ember hover:bg-ember/10" title="Send kin-spirit thread">
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {incoming.length > 0 && (
              <div className="space-y-1">
                <div className="font-mono text-[10px] uppercase tracking-widest text-ash">Threads reaching for you</div>
                {incoming.map(f => {
                  const p = profiles[otherOf(f)];
                  return (
                    <div key={f.id} className="flex items-center justify-between gap-2 p-2 border border-border bg-background/40">
                      <span className="text-sm text-parchment truncate">{p?.username ?? "…"}</span>
                      <div className="flex gap-1">
                        <button onClick={() => respond(f.id, true)} className="p-1 border border-ember/50 text-ember hover:bg-ember/10" title="Bind"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => respond(f.id, false)} className="p-1 border border-border text-ash hover:text-parchment" title="Refuse"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {outgoing.length > 0 && (
              <div className="space-y-1">
                <div className="font-mono text-[10px] uppercase tracking-widest text-ash">Threads you cast</div>
                {outgoing.map(f => {
                  const p = profiles[otherOf(f)];
                  return (
                    <div key={f.id} className="flex items-center justify-between gap-2 p-2 border border-border bg-background/40 opacity-70">
                      <span className="text-sm text-parchment truncate italic">{p?.username ?? "…"}</span>
                      <span className="font-mono text-[10px] text-whisper">unbound</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ash">Bound kin</div>
              {accepted.length === 0 && <p className="text-ash italic text-xs">No threads bound yet.</p>}
              {accepted.map(f => {
                const other = otherOf(f);
                const p = profiles[other];
                const isActive = activeFriend === other;
                return (
                  <button key={f.id} onClick={() => setActiveFriend(other)}
                    className={`w-full text-left flex items-center gap-2 p-2 border-l-2 transition-colors ${
                      isActive ? "border-ember bg-ember/10" : "border-border bg-background/30 hover:border-ember/50"
                    }`}>
                    {p?.portrait_url
                      ? <img src={p.portrait_url} alt="" className="w-7 h-7 object-cover border border-border" />
                      : <div className="w-7 h-7 bg-background/60 border border-border" />}
                    <span className={`flex-1 text-sm ${isActive ? "text-ember" : "text-parchment"}`}>{p?.username ?? "…"}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right: conversation */}
          <section className="flex flex-col min-h-0">
            {!activeFriend && (
              <div className="flex-1 flex items-center justify-center text-ash italic text-sm p-6 text-center">
                Choose a kin spirit. Their words will reach you across the dunes.
              </div>
            )}
            {activeFriend && (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <div className="font-display text-parchment">{profiles[activeFriend]?.username ?? "…"}</div>
                  <button onClick={() => {
                    const f = accepted.find(f => otherOf(f) === activeFriend);
                    if (f) remove(f.id);
                  }} className="text-ash hover:text-ember" title="Cut the thread">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div ref={logRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                  {messages.length === 0 && <p className="text-ash italic text-xs text-center">No words have crossed yet.</p>}
                  {messages.map(m => {
                    const mine = m.sender_id === userId;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] px-3 py-1.5 text-sm font-body whitespace-pre-wrap ${
                          mine
                            ? "bg-ember/15 border border-ember/40 text-parchment"
                            : "bg-background/60 border border-border text-parchment"
                        }`}>
                          {m.content}
                          <div className="font-mono text-[9px] text-ash/60 mt-0.5">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form
                  onSubmit={(e) => { e.preventDefault(); send(); }}
                  className="border-t border-border px-3 py-2 flex items-center gap-2"
                >
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="speak across the sand…"
                    maxLength={2000}
                    className="flex-1 bg-background/60 border border-border focus:border-ember outline-none px-2 py-1.5 font-body text-parchment placeholder:text-ash/40 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 border border-ember/50 text-ember hover:bg-ember/10 disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="font-mono text-xs uppercase tracking-wider">send</span>
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
