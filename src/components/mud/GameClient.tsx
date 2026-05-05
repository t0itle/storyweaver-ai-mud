import { useEffect, useRef, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BookOpen, Flame, Loader2, LogOut, Users, X } from "lucide-react";

interface Profile {
  id: string;
  username: string;
  current_room: string;
  hp: number; max_hp: number;
  level: number; xp: number; gold: number;
  race: string | null;
  portrait_url: string | null;
  char_description: string | null;
}
interface Room {
  slug: string; name: string; description: string;
  ambience: string | null;
  exits: Record<string, string>;
}
interface Npc { id: string; room: string; name: string; title: string | null; greeting: string | null; }
interface Message {
  id: string; room: string; author_name: string;
  kind: string; content: string; created_at: string;
  user_id: string | null; npc_id: string | null;
}
interface LoreEntry {
  slug: string; title: string; summary: string | null;
  content: string; keywords: string[]; source_url: string;
}
interface Discovery { lore_slug: string; source: string; discovered_at: string; }

const HELP = [
  ["look", "describe the room"],
  ["go <dir>", "n/s/e/w/up/down"],
  ["say <text>", "speak aloud (other players hear)"],
  ["emote <text>", "perform an action: *bows*"],
  ["ask <npc> <text>", "speak to an AI NPC"],
  ["examine <thing>", "study something — may reveal lore"],
  ["lore", "open your codex of discoveries"],
  ["who", "list players in this room"],
  ["help", "show this list"],
];

export default function GameClient({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [presence, setPresence] = useState<{ username: string }[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [lore, setLore] = useState<LoreEntry[]>([]);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [codexOpen, setCodexOpen] = useState(false);
  const [codexEntry, setCodexEntry] = useState<string | null>(null);
  const [sceneUrl, setSceneUrl] = useState<string | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load profile
  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => data && setProfile(data as Profile));
  }, [session.user.id]);

  // Load room + npcs + history when room changes
  useEffect(() => {
    if (!profile) return;
    const slug = profile.current_room;
    setSceneUrl(null);
    (async () => {
      const [{ data: r }, { data: n }, { data: m }] = await Promise.all([
        supabase.from("rooms").select("*").eq("slug", slug).maybeSingle(),
        supabase.from("npcs").select("*").eq("room", slug),
        supabase.from("messages").select("*").eq("room", slug).order("created_at", { ascending: false }).limit(40),
      ]);
      if (r) setRoom(r as Room);
      setNpcs((n ?? []) as Npc[]);
      setMessages(((m ?? []) as Message[]).reverse());
    })();
  }, [profile?.current_room]);

  // Generate / fetch scene image when room changes
  useEffect(() => {
    if (!profile || !room) return;
    const slug = profile.current_room;
    let cancelled = false;
    setSceneLoading(true);
    supabase.functions.invoke("scene-image", { body: { room: slug } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.warn("scene", error);
        else if (data?.image_url) setSceneUrl(data.image_url);
      })
      .finally(() => { if (!cancelled) setSceneLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.current_room, room?.slug]);

  // Realtime: messages in current room + presence
  useEffect(() => {
    if (!profile) return;
    const slug = profile.current_room;

    const ch = supabase.channel(`room:${slug}`, { config: { presence: { key: profile.id } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${slug}` },
        (p) => setMessages((prev) => [...prev, p.new as Message]))
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, { username: string }[]>;
        const users = Object.values(state).flat();
        setPresence(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await ch.track({ username: profile.username });
      });

    return () => { supabase.removeChannel(ch); };
  }, [profile?.current_room, profile?.id, profile?.username]);

  // autoscroll
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, room]);

  // Load lore catalog + player's discoveries; subscribe to new discoveries
  useEffect(() => {
    if (!profile) return;
    supabase.from("lore_entries").select("*").then(({ data }) => setLore((data ?? []) as LoreEntry[]));
    const loadDisc = () => supabase.from("player_lore_discoveries").select("lore_slug,source,discovered_at")
      .eq("user_id", profile.id).then(({ data }) => setDiscoveries((data ?? []) as Discovery[]));
    loadDisc();
    const ch = supabase.channel(`disc:${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "player_lore_discoveries", filter: `user_id=eq.${profile.id}` },
        (p) => {
          const row = p.new as Discovery;
          setDiscoveries((prev) => prev.some(d => d.lore_slug === row.lore_slug) ? prev : [...prev, row]);
          // surface a poetic notice
          setMessages((m) => [...m, {
            id: crypto.randomUUID(), room: profile.current_room, author_name: "—",
            kind: "local", created_at: new Date().toISOString(), user_id: null, npc_id: null,
            content: `✦ Knowledge stirs within you. A new entry has been added to your codex. (type "lore" to read)`,
          }]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  const discoveredSlugs = new Set(discoveries.map(d => d.lore_slug));

  const tryDiscover = async (text: string, source: string) => {
    if (!profile) return [] as string[];
    const lower = text.toLowerCase();
    const matched = lore.filter(l => {
      const kws = [l.slug, ...(l.keywords ?? [])].map(k => k.toLowerCase());
      return kws.some(k => k && lower.includes(k));
    }).map(l => l.slug).filter(s => !discoveredSlugs.has(s));
    if (matched.length) {
      await supabase.from("player_lore_discoveries").upsert(
        matched.map(slug => ({ user_id: profile.id, lore_slug: slug, source })),
        { onConflict: "user_id,lore_slug", ignoreDuplicates: true },
      );
    }
    return matched;
  };

  const post = async (kind: string, content: string, author?: string) => {
    if (!profile) return;
    await supabase.from("messages").insert({
      room: profile.current_room,
      user_id: profile.id,
      author_name: author ?? profile.username,
      kind,
      content,
    });
  };

  const moveTo = async (slug: string) => {
    if (!profile) return;
    await post("system", `${profile.username} departs.`, "—");
    const { error } = await supabase.from("profiles").update({ current_room: slug }).eq("id", profile.id);
    if (error) { toast.error(error.message); return; }
    setProfile({ ...profile, current_room: slug });
    setTimeout(() => post("system", `${profile.username} arrives.`, "—"), 300);
  };

  const handleCommand = async (raw: string) => {
    const text = raw.trim();
    if (!text || !profile || !room) return;
    setInput("");

    const [cmd, ...rest] = text.split(/\s+/);
    const args = rest.join(" ");
    const c = cmd.toLowerCase();

    if (c === "help" || c === "?") {
      setMessages((m) => [...m, localSys(HELP.map(([k, v]) => `  ${k.padEnd(20)} — ${v}`).join("\n"))]);
    } else if (c === "look" || c === "l") {
      setMessages((m) => [...m, localSys(formatRoom(room, npcs))]);
    } else if (c === "who") {
      setMessages((m) => [...m, localSys(`Here: ${presence.map(p => p.username).join(", ") || "(only you)"}`)]);
    } else if (c === "go" || c === "n" || c === "s" || c === "e" || c === "w" || c === "u" || c === "d") {
      const dirMap: Record<string, string> = { n: "north", s: "south", e: "east", w: "west", u: "up", d: "down" };
      const dir = dirMap[c] ?? args.toLowerCase();
      const target = (room.exits as Record<string, string>)[dir];
      if (!target) {
        setMessages((m) => [...m, localSys(`You cannot go ${dir} from here.`)]);
      } else {
        await moveTo(target);
      }
    } else if (c === "say" || c === "'") {
      if (!args) return;
      await post("say", args);
    } else if (c === "emote" || c === ":") {
      if (!args) return;
      await post("emote", args);
    } else if (c === "ask") {
      const m = args.match(/^(\S+)\s+(.+)$/);
      if (!m) { setMessages((mm) => [...mm, localSys("Usage: ask <npc> <what you say>")]); return; }
      const [, target, what] = m;
      const npc = npcs.find((n) => n.name.toLowerCase().startsWith(target.toLowerCase()));
      if (!npc) { setMessages((mm) => [...mm, localSys(`No one called "${target}" is here.`)]); return; }
      await post("say", `${what}  →  ${npc.name}`);
      setThinking(true);
      try {
        const { error } = await supabase.functions.invoke("npc-respond", {
          body: { npc_id: npc.id, room: profile.current_room, player_input: what, player_name: profile.username },
        });
        if (error) throw error;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "The NPC stays silent.");
      } finally { setThinking(false); }
    } else if (c === "lore" || c === "codex") {
      if (!args) {
        setCodexEntry(null); setCodexOpen(true);
      } else {
        // open a specific entry if discovered
        const entry = lore.find(l =>
          l.slug === args.toLowerCase() ||
          l.title.toLowerCase().includes(args.toLowerCase()),
        );
        if (entry && discoveredSlugs.has(entry.slug)) {
          setCodexEntry(entry.slug); setCodexOpen(true);
        } else {
          setMessages((m) => [...m, localSys(`You know nothing of "${args}". Yet.`)]);
        }
      }
    } else if (c === "examine" || c === "ex" || c === "study") {
      if (!args) { setMessages((m) => [...m, localSys("Examine what?")]); return; }
      // Build pool of text to scan: room desc, ambience, npc names/titles, plus the literal arg
      const pool = [args, room.description, room.ambience ?? "", ...npcs.map(n => `${n.name} ${n.title ?? ""}`)].join(" ");
      const matched = await tryDiscover(pool, `examine:${args}`);
      if (matched.length) {
        setMessages((m) => [...m, localSys(`You study the ${args} closely. Memory and meaning rise to meet you…`)]);
      } else {
        setMessages((m) => [...m, localSys(`You examine the ${args}, but glean nothing new.`)]);
      }
    } else {
      // default = say
      await post("say", text);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const localSys = (content: string): Message => ({
    id: crypto.randomUUID(), room: profile!.current_room, author_name: "—",
    kind: "local", content, created_at: new Date().toISOString(),
    user_id: null, npc_id: null,
  });

  const signOut = async () => { await supabase.auth.signOut(); };

  if (!profile || !room) return <div className="min-h-screen flex items-center justify-center text-ash">Walking the road…</div>;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-card/60 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Flame className="w-5 h-5 text-ember ember-flicker" />
          <div>
            <div className="font-display text-lg leading-none text-parchment">Ember-Hold</div>
            <div className="font-mono text-[10px] text-ash uppercase tracking-widest">{profile.username} · lvl {profile.level}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className="text-ember">♥ {profile.hp}/{profile.max_hp}</span>
          <span className="text-accent">✦ {profile.xp} xp</span>
          <span className="text-parchment">⚜ {profile.gold}g</span>
          <button
            onClick={() => { setCodexEntry(null); setCodexOpen(true); }}
            className="flex items-center gap-1 text-whisper hover:text-ember transition-colors"
            title="Codex of discoveries"
          >
            <BookOpen className="w-4 h-4" />
            <span>{discoveries.length}/{lore.length}</span>
          </button>
          <Button size="sm" variant="ghost" onClick={signOut} className="text-ash hover:text-parchment">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Main log */}
        <main className="flex-1 flex flex-col min-w-0">
          <div ref={logRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-6 space-y-3 font-body text-[17px] leading-relaxed">
            <RoomBlock room={room} npcs={npcs} sceneUrl={sceneUrl} sceneLoading={sceneLoading} />
            {messages.map((m) => <MessageLine key={m.id} m={m} you={profile.username} />)}
            {thinking && <div className="text-whisper italic typewriter">a voice gathers in the dark</div>}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleCommand(input); }}
            className="border-t border-border bg-card/70 px-4 py-3 flex items-center gap-2"
          >
            <span className="font-mono text-ember">›</span>
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='try "look", "go north", "ask Maeve about the tower"'
              className="flex-1 bg-transparent outline-none font-mono text-sm text-parchment placeholder:text-ash/50"
            />
            <span className="font-mono text-[10px] text-ash hidden sm:inline">enter ⏎</span>
          </form>
        </main>

        {/* Sidebar */}
        <aside className="md:w-72 border-t md:border-t-0 md:border-l border-border bg-card/40 p-4 space-y-5 text-sm">
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash mb-2">Exits</h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(room.exits).length === 0 && <span className="text-ash italic">none</span>}
              {Object.entries(room.exits).map(([dir]) => (
                <button key={dir} onClick={() => handleCommand(`go ${dir}`)}
                  className="font-mono text-xs px-2 py-1 border border-border hover:border-ember hover:text-ember transition-colors uppercase">
                  {dir}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash mb-2">Souls Here</h3>
            <div className="space-y-1">
              {npcs.map((n) => (
                <button key={n.id} onClick={() => { setInput(`ask ${n.name.split(" ")[0]} `); inputRef.current?.focus(); }}
                  className="block text-left w-full font-body text-parchment hover:text-ember transition-colors">
                  <span className="text-accent">●</span> {n.name}
                  {n.title && <span className="text-ash italic"> — {n.title}</span>}
                </button>
              ))}
              {presence.map((p) => (
                <div key={p.username} className="font-body text-moss">
                  <span>◆</span> {p.username}{p.username === profile.username && <span className="text-ash"> (you)</span>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-ash mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> Commands</h3>
            <ul className="space-y-1 font-mono text-[11px] text-ash">
              {HELP.map(([k, v]) => <li key={k}><span className="text-ember">{k}</span> <span className="text-ash/70">— {v}</span></li>)}
            </ul>
          </div>
        </aside>
      </div>

      {codexOpen && (
        <CodexModal
          lore={lore}
          discoveries={discoveries}
          openSlug={codexEntry}
          setOpenSlug={setCodexEntry}
          onClose={() => setCodexOpen(false)}
        />
      )}
    </div>
  );
}

function CodexModal({
  lore, discoveries, openSlug, setOpenSlug, onClose,
}: {
  lore: LoreEntry[]; discoveries: Discovery[];
  openSlug: string | null; setOpenSlug: (s: string | null) => void;
  onClose: () => void;
}) {
  const discMap = new Map(discoveries.map(d => [d.lore_slug, d]));
  const sorted = [...lore].sort((a, b) => a.title.localeCompare(b.title));
  const open = openSlug ? lore.find(l => l.slug === openSlug) : null;

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-ember" />
            <h2 className="font-display text-xl text-parchment">Codex of {discoveries.length} {discoveries.length === 1 ? "Truth" : "Truths"}</h2>
            <span className="font-mono text-[10px] text-ash uppercase tracking-widest">of {lore.length} known to the world</span>
          </div>
          <button onClick={onClose} className="text-ash hover:text-parchment"><X className="w-5 h-5" /></button>
        </div>

        {open ? (
          <div className="overflow-y-auto px-6 py-5">
            <button onClick={() => setOpenSlug(null)} className="font-mono text-xs text-ash hover:text-ember mb-3">← back to codex</button>
            <h3 className="font-display text-3xl text-ember mb-1">{open.title}</h3>
            {open.summary && <p className="text-whisper italic mb-4">{open.summary}</p>}
            <div className="text-parchment whitespace-pre-line leading-relaxed font-body">{open.content}</div>
            <p className="font-mono text-[10px] text-ash mt-6">
              discovered via {discMap.get(open.slug)?.source ?? "unknown"} ·{" "}
              <a href={open.source_url} target="_blank" rel="noreferrer" className="hover:text-ember underline">source</a>
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto px-3 py-3">
            {sorted.length === 0 && <p className="text-ash italic p-6 text-center">The world is wide and you know almost none of it.</p>}
            {sorted.map((l) => {
              const known = discMap.has(l.slug);
              return (
                <button
                  key={l.slug}
                  disabled={!known}
                  onClick={() => known && setOpenSlug(l.slug)}
                  className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                    known
                      ? "border-ember/60 hover:bg-ember/5 hover:border-ember"
                      : "border-border opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="font-display text-lg text-parchment">
                    {known ? l.title : "▓▓▓▓▓▓▓▓▓▓"}
                  </div>
                  <div className="font-body text-sm text-ash italic">
                    {known ? l.summary : "An untold thread of the world. Seek it out."}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
function RoomBlock({ room, npcs }: { room: Room; npcs: Npc[] }) {
  return (
    <div className="border-l-2 border-ember/60 pl-4 py-1 mb-4">
      <h2 className="font-display text-2xl text-ember mb-2">{room.name}</h2>
      <p className="text-parchment whitespace-pre-line">{room.description}</p>
      {room.ambience && <p className="text-ash italic mt-2">{room.ambience}</p>}
      {npcs.length > 0 && (
        <p className="text-whisper italic mt-2">
          {npcs.map((n) => `${n.name}${n.title ? `, ${n.title}` : ""}`).join("; ")} {npcs.length === 1 ? "is" : "are"} here.
        </p>
      )}
    </div>
  );
}

function MessageLine({ m, you }: { m: Message; you: string }) {
  const isYou = m.author_name === you;
  if (m.kind === "system" || m.kind === "local") {
    return <div className="text-ash italic font-mono text-xs whitespace-pre-wrap">{m.content}</div>;
  }
  if (m.kind === "emote") {
    return <div className="text-moss italic">* {m.author_name} {m.content}</div>;
  }
  if (m.kind === "npc") {
    return (
      <div className="border-l-2 border-whisper/60 pl-3">
        <span className="font-display text-whisper">{m.author_name}</span>
        <span className="text-ash text-xs"> says</span>
        <p className="text-parchment whitespace-pre-line italic">"{m.content}"</p>
      </div>
    );
  }
  // say
  return (
    <div>
      <span className={isYou ? "font-display text-ember" : "font-display text-accent"}>{m.author_name}</span>
      <span className="text-ash text-xs"> says,</span>{" "}
      <span className="text-parchment">"{m.content}"</span>
    </div>
  );
}

function formatRoom(room: Room, npcs: Npc[]) {
  const lines = [room.name.toUpperCase(), "", room.description];
  if (room.ambience) lines.push("", room.ambience);
  if (npcs.length) lines.push("", "Here: " + npcs.map(n => n.name).join(", "));
  lines.push("", "Exits: " + (Object.keys(room.exits).join(", ") || "none"));
  return lines.join("\n");
}
