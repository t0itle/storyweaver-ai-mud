import { useEffect, useRef, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Backpack, Flame, HelpCircle, Loader2, LogOut, ScrollText, Sparkles } from "lucide-react";
import { CombatHUD, InventoryPanel, RunesPanel, type InvItem, type KnownRune } from "./Panels";
import { ChronicleModal } from "./ChronicleModal";
import { CharacterSheet } from "./CharacterSheet";
import { RuneHub } from "./RuneHub";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import HallOfChoice from "./HallOfChoice";

interface Profile {
  id: string;
  username: string;
  current_room: string;
  hp: number; max_hp: number;
  level: number; xp: number; gold: number;
  race: string | null;
  portrait_url: string | null;
  char_description: string | null;
  in_combat_id: string | null;
  max_weight: number;
  aether: string | null;
  faction: string | null;
  corruption: number;
  merit: number;
  hall_refusals: number;
  chaos_pressure: number;
  non_serviam_at: string | null;
  companion_npc_id: string | null;
}
interface Room {
  slug: string; name: string; description: string;
  ambience: string | null;
  exits: Record<string, string>;
  kind?: string; label?: string;
}
interface Npc { id: string; room: string; name: string; title: string | null; greeting: string | null; current_activity?: string | null; }
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
  ["go to <place>", "fast-travel to a known or rumored place"],
  ["say <text>", "speak aloud"],
  ["emote <text>", "perform an action: *bows*"],
  ["ask <npc> <text>", "speak to an AI NPC"],
  ["examine <thing>", "study — may reveal lore"],
  ["read / open / touch / smell / listen …", "interact with the world"],
  ["inventory / i", "what you carry"],
  ["equip / use / drop <item>", "manage gear"],
  ["runes", "runes you know"],
  ["learn <rune>", "from a teacher in this room"],
  ["weave <rune> into <item>", "set a rune"],
  ["attack <name>", "begin a fight"],
  ["join", "enter a fight in this room"],
  ["defend / cast <rune> / flee", "in combat"],
  ["lore", "open your codex"],
  ["who", "list players in this room"],
  ["follow <npc>", "ask an NPC to travel with you"],
  ["dismiss", "part ways with your companion"],
  ["help", "show this list"],
];

const INTERACT_VERBS = new Set([
  "read","open","close","touch","feel","smell","sniff","listen","taste","lick",
  "push","pull","press","turn","twist","light","extinguish","sit","stand","kneel","pray",
  "break","smash","cut","tear","burn","wash","drink","eat","sip","knock","wave",
  "climb","dig","search","kiss","hug","bow","salute","pick","wear","remove","throw",
  "shake","rub","scratch","poke","hold","lift","carry","drop","place","write","sing","whistle","dance","sleep","rest","meditate",
]);

export default function GameClient({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [dragons, setDragons] = useState<{ name: string; epithet: string; personality: string }[]>([]);
  const [amityByNpc, setAmityByNpc] = useState<Record<string, number>>({});
  const [roomEvents, setRoomEvents] = useState<{ kind: string; actor_name: string; target_name: string | null; details: any; created_at: string }[]>([]);
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
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [knownRunes, setKnownRunes] = useState<KnownRune[]>([]);
  const [invOpen, setInvOpen] = useState(false);
  const [runesOpen, setRunesOpen] = useState(false);
  const [tracerOpen, setTracerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [chronicleTab, setChronicleTab] = useState<"journal" | "codex">("journal");
  const [hallOpen, setHallOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reloadInventory = async () => {
    const { data } = await supabase.from("player_items")
      .select("*, items(*), item_runes(*, runes(*))")
      .eq("user_id", session.user.id);
    setInventory((data ?? []) as InvItem[]);
  };
  const reloadRunes = async () => {
    const { data } = await supabase.from("player_runes").select("rune_key, runes(*)").eq("user_id", session.user.id);
    setKnownRunes((data ?? []) as KnownRune[]);
  };
  const reloadProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (data) setProfile(data as Profile);
  };

  useEffect(() => { reloadInventory(); reloadRunes(); }, [session.user.id]);

  // Profile realtime: catches in_combat_id, hp, gold updates
  useEffect(() => {
    const ch = supabase.channel(`profile:${session.user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${session.user.id}` },
        (p) => setProfile((prev) => prev ? { ...prev, ...(p.new as Profile) } : (p.new as Profile)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session.user.id]);

  // Inventory + runes realtime
  useEffect(() => {
    const ch = supabase.channel(`inv:${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "player_items", filter: `user_id=eq.${session.user.id}` }, () => reloadInventory())
      .on("postgres_changes", { event: "*", schema: "public", table: "item_runes" }, () => reloadInventory())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_runes", filter: `user_id=eq.${session.user.id}` }, () => reloadRunes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session.user.id]);


  // Load profile
  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[profile load]", error);
        if (!data) console.warn("[profile load] no profile row for", session.user.id);
        if (data) setProfile(data as Profile);
      });
  }, [session.user.id]);

  useEffect(() => {
    if (profile) {
      setProfileLoadFailed(false);
      return;
    }

    const timeout = window.setTimeout(() => setProfileLoadFailed(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [profile]);

  // Load room + npcs + history when room changes
  useEffect(() => {
    if (!profile) return;
    const slug = profile.current_room;
    setSceneUrl(null);
    (async () => {
      const nowIso = new Date().toISOString();
      // Only show conversations from the moment the player arrived in this room.
      const [{ data: r }, { data: n }, { data: m }, { data: ev }, { data: dr }] = await Promise.all([
        supabase.from("rooms").select("*").eq("slug", slug).maybeSingle(),
        supabase.from("npcs").select("*").eq("room", slug)
          .or(`dead_until.is.null,dead_until.lte.${nowIso}`),
        supabase.from("messages").select("*").eq("room", slug)
          .gte("created_at", nowIso)
          .or(`addressed_to.is.null,addressed_to.eq.${profile.id}`)
          .order("created_at", { ascending: false }).limit(40),
        supabase.from("world_events").select("kind,actor_name,target_name,details,created_at")
          .eq("room", slug)
          .or(`decay_at.is.null,decay_at.gte.${nowIso}`)
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("dragons").select("name, epithet, personality").eq("current_room", slug),
      ]);
      if (r) setRoom(r as Room);
      setNpcs((n ?? []) as Npc[]);
      setDragons((dr ?? []) as any);
      setRoomEvents((ev ?? []) as any);
      setMessages(((m ?? []) as Message[]).reverse());

      // Load amity scores for the NPCs in this room
      const npcIds = (n ?? []).map((x: any) => x.id);
      if (npcIds.length) {
        const { data: am } = await supabase.from("npc_amity")
          .select("npc_id,score").eq("user_id", profile.id).in("npc_id", npcIds);
        const map: Record<string, number> = {};
        for (const row of am ?? []) map[(row as any).npc_id] = (row as any).score;
        setAmityByNpc(map);
      } else { setAmityByNpc({}); }

      // If no living NPCs are here and the place isn't a hand-built solo space, top it up.
      if ((!n || n.length === 0) && r && (r as any).kind !== "loft") {
        supabase.functions.invoke("populate-npcs", { body: { room: slug } })
          .then(({ data }) => {
            if (data?.added > 0) {
              // refetch npcs after a short beat so they appear
              setTimeout(async () => {
                const { data: n2 } = await supabase.from("npcs").select("*").eq("room", slug)
                  .or(`dead_until.is.null,dead_until.lte.${new Date().toISOString()}`);
                setNpcs((n2 ?? []) as Npc[]);
              }, 400);
            }
          })
          .catch(() => { /* silent */ });
      }
    })();
  }, [profile?.current_room]);

  // Generate / fetch scene image when room changes (events-aware so the world reflects what's been done)
  useEffect(() => {
    if (!profile || !room) return;
    const slug = profile.current_room;
    let cancelled = false;
    setSceneLoading(true);
    // Only events that visibly scar the world should trigger scene regeneration.
    const SCENE_AFFECTING = new Set(["npc_killed", "died", "rune_backfire", "compound_backfire"]);
    const sceneEvents = roomEvents.filter(e => SCENE_AFFECTING.has(e.kind));
    const eventSummary = sceneEvents.length
      ? sceneEvents.map(e => describeEvent(e)).join(" ")
      : "";
    supabase.functions.invoke("scene-image", { body: { room: slug, context_extra: eventSummary } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.warn("scene", error);
        else if (data?.image_url) setSceneUrl(data.image_url);
      })
      .finally(() => { if (!cancelled) setSceneLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.current_room, room?.slug, roomEvents.length]);

  // Auto-open Hall of the Seven when player enters it (only if not yet sworn)
  useEffect(() => {
    if (profile?.current_room === "hall-of-the-seven" && !profile.aether) setHallOpen(true);
  }, [profile?.current_room, profile?.aether]);

  // The Shadow whispers in unspoken places — and follows refusers everywhere.
  // The more times a player walks out of the Hall without choosing, the harder Chaos pulls.
  useEffect(() => {
    if (!profile) return;
    if (profile.aether || profile.faction) return; // already chosen a side
    const slug = profile.current_room;
    const wild = slug === "crescent-shore" || slug === "red-haze-road" || slug === "sand-bloom-hollow"
      || slug?.startsWith("wilderness") || slug?.startsWith("deep-wilds")
      || slug?.startsWith("desert") || slug?.startsWith("bone-dunes") || slug === "caravan-road";
    const pressure = profile.chaos_pressure ?? 0;
    // No pressure and not in the wilds → silence.
    if (!wild && pressure < 20) return;
    // Interval shrinks as pressure grows: 90s at 0, 20s at 100.
    const interval = Math.max(20_000, 90_000 - pressure * 700);
    const tick = async () => {
      try {
        const { data } = await supabase.functions.invoke("shadow-tempt", { body: { kind: "whisper" } });
        if (data?.whisper) {
          const prefix = pressure >= 60 ? "Chaos" : "the Shadow";
          setMessages((m) => [...m, {
            id: crypto.randomUUID(), room: slug, author_name: prefix,
            kind: "shadow", content: data.whisper, created_at: new Date().toISOString(),
            user_id: null, npc_id: null,
          }]);
        }
      } catch { /* silence is also a whisper */ }
    };
    const t = setInterval(tick, interval);
    return () => clearInterval(t);
  }, [profile?.current_room, profile?.id, profile?.aether, profile?.faction, profile?.chaos_pressure]);

  // Listen for shadow choices made via inline buttons
  useEffect(() => {
    const handler = async (ev: Event) => {
      const kind = (ev as CustomEvent<string>).detail;
      try {
        const { data } = await supabase.functions.invoke("shadow-tempt", { body: { kind } });
        if (data?.ok) {
          setMessages((m) => [...m, {
            id: crypto.randomUUID(), room: profile?.current_room ?? "", author_name: "—",
            kind: "local", content: kind === "submit"
              ? `you let it in. (corruption ${data.corruption}/100)`
              : `you push it back. (corruption ${data.corruption}/100)`,
            created_at: new Date().toISOString(), user_id: null, npc_id: null,
          }]);
          reloadProfile();
        }
      } catch { /* */ }
    };
    window.addEventListener("shadow-act", handler);
    return () => window.removeEventListener("shadow-act", handler);
  }, [profile?.current_room]);

  // Realtime: messages in current room + presence
  useEffect(() => {
    if (!profile) return;
    const slug = profile.current_room;

    const ch = supabase.channel(`room:${slug}`, { config: { presence: { key: profile.id } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${slug}` },
        (p) => {
          const msg = p.new as Message & { addressed_to?: string | null };
          // Show: anything not addressed to a specific player, OR addressed to me.
          // Hides only NPC replies meant for someone else.
          if (!msg.addressed_to || msg.addressed_to === profile.id) {
            setMessages((prev) => [...prev, msg]);
          }
        })
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
      // Each new piece of lore earns 1 merit — fame for understanding the world.
      const meritGain = matched.length;
      await supabase.from("profiles")
        .update({ merit: (profile.merit ?? 0) + meritGain })
        .eq("id", profile.id);
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
    // Faction-locked enclaves: only those who belong may cross the threshold.
    const { data: targetRoom } = await supabase.from("rooms")
      .select("requires_faction, name").eq("slug", slug).maybeSingle();
    if (targetRoom?.requires_faction) {
      const playerFaction = profile.non_serviam_at ? "chaos" : profile.faction;
      if (targetRoom.requires_faction !== playerFaction) {
        setMessages((m) => [...m, localSys(`The way to ${targetRoom.name ?? "that place"} closes against you. You were not invited.`)]);
        return;
      }
    }
    await post("system", `${profile.username} departs.`, "—");

    // Companion follows along
    let companionName: string | null = null;
    if (profile.companion_npc_id) {
      const { data: comp } = await supabase.from("npcs")
        .select("name").eq("id", profile.companion_npc_id).maybeSingle();
      if (comp) {
        companionName = comp.name;
        await supabase.from("npcs").update({ room: slug }).eq("id", profile.companion_npc_id);
        await supabase.from("messages").insert({
          room: profile.current_room, author_name: "—", kind: "ambient",
          content: `*${comp.name} follows ${profile.username} out.*`, user_id: null,
        });
      }
    }

    const { error } = await supabase.from("profiles").update({ current_room: slug }).eq("id", profile.id);
    if (error) { toast.error(error.message); return; }
    setProfile({ ...profile, current_room: slug });
    setTimeout(() => {
      post("system", `${profile.username} arrives.`, "—");
      if (companionName) {
        supabase.from("messages").insert({
          room: slug, author_name: "—", kind: "ambient",
          content: `*${companionName} arrives alongside ${profile.username}.*`, user_id: null,
        });
      }
    }, 300);
  };

  const followNpc = async (targetName: string) => {
    if (!profile) return;
    const npc = npcs.find((n) => n.name.toLowerCase().startsWith(targetName.toLowerCase()));
    if (!npc) { setMessages((m) => [...m, localSys(`No one called "${targetName}" is here.`)]); return; }
    if (profile.companion_npc_id === npc.id) {
      setMessages((m) => [...m, localSys(`${npc.name} already walks with you.`)]); return;
    }
    if (profile.companion_npc_id) {
      setMessages((m) => [...m, localSys(`Dismiss your current companion first.`)]); return;
    }
    // Amity gate: NPC must be at least Friendly (+20) to travel with you.
    const { data: amity } = await supabase.from("npc_amity")
      .select("score").eq("npc_id", npc.id).eq("user_id", profile.id).maybeSingle();
    if ((amity?.score ?? 0) < 20) {
      setMessages((m) => [...m, localSys(`*${npc.name} regards you, but does not yet trust you enough to travel at your side.*`)]);
      return;
    }
    await supabase.from("profiles").update({ companion_npc_id: npc.id }).eq("id", profile.id);
    setProfile({ ...profile, companion_npc_id: npc.id });
    await supabase.from("messages").insert({
      room: profile.current_room, author_name: "—", kind: "ambient",
      content: `*${npc.name} sets aside their work and falls in beside ${profile.username}.*`, user_id: null,
    });
  };

  const dismissCompanion = async () => {
    if (!profile?.companion_npc_id) {
      setMessages((m) => [...m, localSys(`No one travels with you.`)]); return;
    }
    const { data: comp } = await supabase.from("npcs")
      .select("name, home_room").eq("id", profile.companion_npc_id).maybeSingle();
    await supabase.from("profiles").update({ companion_npc_id: null }).eq("id", profile.id);
    setProfile({ ...profile, companion_npc_id: null });
    if (comp) {
      await supabase.from("messages").insert({
        room: profile.current_room, author_name: "—", kind: "ambient",
        content: `*${comp.name} nods, parting ways with ${profile.username}.*`, user_id: null,
      });
    }
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
      setMessages((m) => [...m, localSys(formatRoom(room, npcs, roomEvents))]);
    } else if (c === "who") {
      setMessages((m) => [...m, localSys(`Here: ${presence.map(p => p.username).join(", ") || "(only you)"}`)]);
    } else if (c === "follow") {
      if (!args) { setMessages((m) => [...m, localSys("Follow whom? Try: follow <npc name>")]); return; }
      await followNpc(args.trim());
    } else if (c === "dismiss" || c === "unfollow" || c === "partways") {
      await dismissCompanion();
    } else if (c === "go" || c === "n" || c === "s" || c === "e" || c === "w" || c === "u" || c === "d" || c === "travel" || c === "goto") {
      const dirMap: Record<string, string> = { n: "north", s: "south", e: "east", w: "west", u: "up", d: "down" };
      let dir = dirMap[c] ?? args.toLowerCase().trim();
      // Strip "to " prefix: "go to the archive" -> "the archive"
      if (c === "travel" || c === "goto") dir = args.toLowerCase().replace(/^to\s+/, "").trim();
      else if (c === "go") dir = dir.replace(/^to\s+/, "").trim();

      const compassWords = ["north","south","east","west","up","down"];
      if (compassWords.includes(dir)) {
        const target = (room.exits as Record<string, string>)[dir];
        if (!target) {
          setMessages((m) => [...m, localSys(`You cannot go ${dir} from here.`)]);
        } else {
          await moveTo(target);
        }
      } else if (dir) {
        // Fast-travel by name. Try existing rooms first, then offer to discover.
        const placeName = dir.replace(/^the\s+/, "").trim();
        const { data: matches } = await supabase.from("rooms").select("slug,name").ilike("name", `%${placeName}%`).limit(2);
        if (matches && matches.length === 1) {
          setMessages((m) => [...m, localSys(`You set out for ${matches[0].name}…`)]);
          await moveTo(matches[0].slug);
        } else if (matches && matches.length > 1) {
          setMessages((m) => [...m, localSys(`Be more specific — could be: ${matches.map(r => r.name).join(", ")}.`)]);
        } else {
          setMessages((m) => [...m, localSys(`You search your memory for "${dir}"… the world is shaping it now.`)]);
          try {
            const { data, error } = await supabase.functions.invoke("discover-location", {
              body: { name: dir, from_room: profile.current_room },
            });
            if (error || data?.error) throw new Error(data?.error ?? error?.message);
            setMessages((m) => [...m, localSys(`✦ ${data.name} ${data.created ? "takes shape on the map" : "is already known to you"}. You set out…`)]);
            await moveTo(data.slug);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "The path refuses to form.");
          }
        }
      } else {
        setMessages((m) => [...m, localSys(`Go where? Try a direction or "go to <place>".`)]);
      }
    } else if (c === "say" || c === "'") {
      if (!args) return;
      // Forsaking the seven — a one-shot, world-rippling declaration.
      const normalized = args.toLowerCase().replace(/[^a-z]/g, "");
      if (normalized === "nonserviam" || normalized === "nonservium") {
        try {
          const { data, error } = await supabase.functions.invoke("declare-non-serviam");
          if (error || data?.error) throw new Error(data?.error ?? error?.message);
          await reloadProfile();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "the words die in your throat");
        }
        return;
      }
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
        const { data, error } = await supabase.functions.invoke("npc-respond", {
          body: { npc_id: npc.id, room: profile.current_room, player_input: what, player_name: profile.username },
        });
        if (error) throw error;
        if (data?.amity?.score !== undefined) {
          setAmityByNpc((prev) => ({ ...prev, [npc.id]: data.amity.score }));
        }
        if (data?.quest_offer) {
          const q = data.quest_offer;
          setMessages((mm) => [...mm, localSys(`✦ ${npc.name} offers you a quest: **${q.title}** (${q.severity}). Type "accept ${q.title}" or "decline ${q.title}".`)]);
        }
        if (data?.quest_resolution?.outcome === "complete") {
          const r = data.quest_resolution;
          toast.success(`✦ Quest complete: ${r.title} — +${r.gold ?? 0}g, +${r.xp ?? 0}xp`);
          reloadProfile();
        } else if (data?.quest_resolution?.outcome === "fail") {
          toast.error(`Quest failed: ${data.quest_resolution.title}`);
        }
        // Auto-discover any places the NPC named, so "go to <place>" works immediately.
        const places: string[] = data?.mentioned_places ?? [];
        if (places.length) {
          (async () => {
            const learned: string[] = [];
            for (const p of places.slice(0, 4)) {
              try {
                const { data: d } = await supabase.functions.invoke("discover-location", {
                  body: { name: p, hint: what, from_room: profile.current_room },
                });
                if (d?.created && d?.name) learned.push(d.name);
              } catch { /* ignore */ }
            }
            if (learned.length) {
              setMessages((mm) => [...mm, localSys(`✦ New places stir on the map: ${learned.join(", ")}. (try "go to ${learned[0]}")`)]);
            }
          })();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "The NPC stays silent.");
      } finally { setThinking(false); }
    } else if (c === "lore" || c === "codex") {
      if (!args) {
        setCodexEntry(null); setChronicleTab("codex"); setCodexOpen(true);
      } else {
        const entry = lore.find(l =>
          l.slug === args.toLowerCase() ||
          l.title.toLowerCase().includes(args.toLowerCase()),
        );
        if (entry && discoveredSlugs.has(entry.slug)) {
          setCodexEntry(entry.slug); setChronicleTab("codex"); setCodexOpen(true);
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
    } else if (c === "inventory" || c === "inv" || c === "i") {
      setInvOpen(true);
    } else if (c === "runes" || c === "spells") {
      setRunesOpen(true);
    } else if (c === "equip" || c === "wield" || c === "wear" || c === "use" || c === "drop" || c === "unequip") {
      const target = args.toLowerCase().trim();
      if (!target) { setMessages((m) => [...m, localSys(`${c} what?`)]); return; }
      const it = inventory.find(i => i.items.name.toLowerCase().includes(target) || i.item_key.includes(target));
      if (!it) { setMessages((m) => [...m, localSys(`You carry no "${target}".`)]); return; }
      const action = c === "wield" || c === "wear" ? "equip" : c;
      try {
        const { data, error } = await supabase.functions.invoke("inventory-action", {
          body: { action, player_item_id: it.id, slot: it.items.slot },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        setMessages((m) => [...m, localSys(data.message)]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "learn") {
      if (!args) { setMessages((m) => [...m, localSys("Learn which rune?")]); return; }
      try {
        const { data, error } = await supabase.functions.invoke("rune-action", {
          body: { action: "learn", rune_key: args.toLowerCase().trim() },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        setMessages((m) => [...m, localSys(data.message)]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "weave") {
      // syntax: weave <rune> into <item>
      const m = args.match(/^(.+?)\s+into\s+(.+)$/i);
      if (!m) { setMessages((mm) => [...mm, localSys("Usage: weave <rune> into <item>")]); return; }
      const [, runeName, itemName] = m;
      const rune = knownRunes.find(r => r.runes.name.toLowerCase().includes(runeName.toLowerCase()) || r.rune_key.includes(runeName.toLowerCase()));
      const item = inventory.find(i => i.items.name.toLowerCase().includes(itemName.toLowerCase()));
      if (!rune) { setMessages((mm) => [...mm, localSys(`You know no rune called "${runeName}".`)]); return; }
      if (!item) { setMessages((mm) => [...mm, localSys(`You carry no "${itemName}".`)]); return; }
      try {
        const { data, error } = await supabase.functions.invoke("rune-action", {
          body: { action: "weave", rune_key: rune.rune_key, player_item_id: item.id },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        setMessages((mm) => [...mm, localSys(data.message)]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "attack" || c === "kill" || c === "fight") {
      if (!args) { setMessages((m) => [...m, localSys("Attack whom?")]); return; }
      try {
        const { data, error } = await supabase.functions.invoke("combat-action", {
          body: { action: "start", target_name: args.trim() },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "join" && !args) {
      try {
        const { data, error } = await supabase.functions.invoke("combat-action", { body: { action: "join" } });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "defend" || c === "flee") {
      try {
        const { data, error } = await supabase.functions.invoke("combat-action", { body: { action: c } });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "cast") {
      const m = args.match(/^(.+?)(?:\s+at\s+(.+))?$/i);
      if (!m) { setMessages((mm) => [...mm, localSys("Cast which rune?")]); return; }
      const [, runeName, target] = m;
      const rune = knownRunes.find(r => r.runes.name.toLowerCase().includes(runeName.toLowerCase()) || r.rune_key.includes(runeName.toLowerCase()));
      if (!rune) { setMessages((mm) => [...mm, localSys(`You know no rune called "${runeName}".`)]); return; }
      try {
        const { data, error } = await supabase.functions.invoke("combat-action", {
          body: { action: "cast", rune_key: rune.rune_key, target_name: target },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "align" || c === "kneel") {
      if (profile.current_room !== "hall-of-the-seven") {
        setMessages((m) => [...m, localSys("There is no basin here. Seek the Hall of the Seven in the First City.")]);
      } else {
        setHallOpen(true);
      }
    } else if (INTERACT_VERBS.has(c)) {
      // Natural-world interactions: read, open, touch, smell, listen, taste, push, pull,
      // light, sit, kneel, pray, feel, break, smash, climb, dig, search, drink, eat, knock, …
      let targetText = args.replace(/^(the|a|an)\s+/i, "").trim();
      // "it" / empty → auto-pick a sensible inventory item for the verb.
      if (!targetText || targetText === "it") {
        const readableHints = ["scroll","book","tome","letter","note","map","sign","tablet","page","journal","codex"];
        const drinkHints = ["water","wine","ale","potion","draught","tonic","cup","flask","skin","brew"];
        const eatHints = ["bread","fruit","meat","ration","fig","date","cheese","root","berry"];
        const pickFor = (hints: string[]) =>
          inventory.find(i => hints.some(h => i.items.name.toLowerCase().includes(h) || i.item_key.includes(h)));
        const guess =
          c === "read" ? pickFor(readableHints) :
          c === "drink" || c === "sip" ? pickFor(drinkHints) :
          c === "eat" ? pickFor(eatHints) : null;
        if (guess) targetText = guess.items.name;
      }
      setThinking(true);
      try {
        const { data, error } = await supabase.functions.invoke("interact", {
          body: { verb: c, target: targetText, room: profile.current_room, player_name: profile.username },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        // Post as an emote-like ambient line so others in the room can witness it.
        await post("emote", `${c}s ${targetText || "the surroundings"} — ${data.content}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "the world does not respond");
      } finally { setThinking(false); }
    } else {
      // default = say
      await post("say", text);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const combatAct = async (kind: string, args: Record<string, unknown> = {}) => {
    try {
      const { data, error } = await supabase.functions.invoke("combat-action", { body: { action: kind, ...args } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
    } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
  };

  const localSys = (content: string): Message => ({
    id: crypto.randomUUID(), room: profile!.current_room, author_name: "—",
    kind: "local", content, created_at: new Date().toISOString(),
    user_id: null, npc_id: null,
  });

  const signOut = async () => { await supabase.auth.signOut(); };

  if (!profile && !profileLoadFailed) return <div className="min-h-screen flex items-center justify-center text-ash">Walking the road…</div>;
  if (!profile) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-ash p-6 text-center">
      <p>Your footsteps vanished before the road could remember you.</p>
      <p className="text-xs text-whisper max-w-xs">Your character was submitted, but your player record did not finish loading.</p>
      <button onClick={() => window.location.reload()} className="text-ember underline underline-offset-4">Try again</button>
    </div>
  );
  if (!room) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-ash p-6 text-center">
      <p>The road forgot its name.</p>
      <p className="text-xs text-whisper">Could not find room "{profile.current_room}".</p>
      <button onClick={() => window.location.reload()} className="text-ember underline underline-offset-4">Try again</button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-card/60 backdrop-blur px-3 sm:px-4 py-2 sm:py-3 flex flex-col gap-2">
        {/* Row 1: identity + sign-out */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 text-left group"
            title="Open character sheet"
          >
            {profile.portrait_url ? (
              <img src={profile.portrait_url} alt={profile.username}
                className="w-8 h-8 sm:w-10 sm:h-10 object-cover border border-ember/60 rounded-sm shrink-0 group-hover:border-ember transition-colors" />
            ) : (
              <Flame className="w-5 h-5 text-ember ember-flicker shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-display text-base sm:text-lg leading-tight text-parchment truncate group-hover:text-ember transition-colors">{profile.username}</div>
              <div className="font-mono text-[9px] sm:text-[10px] text-ash uppercase tracking-widest truncate">
                {profile.race ?? "wanderer"} · lvl {profile.level}
                {profile.aether && <> · <span className="text-ember/80">{profile.aether}</span></>}
              </div>
            </div>
          </button>
          <Button size="sm" variant="ghost" onClick={signOut} className="text-ash hover:text-parchment shrink-0 h-8 w-8 p-0">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Row 2: stats — wraps on mobile */}
        <div className="flex items-center gap-x-3 gap-y-1 font-mono text-[11px] sm:text-xs flex-wrap">
          <span className="text-ember">♥ {profile.hp}/{profile.max_hp}</span>
          <span className="text-accent">✦ {profile.xp}xp</span>
          <span className="text-parchment">⚜ {profile.gold}g</span>
          <span title={`Merit: ${profile.merit ?? 0}`} className="text-moss">❖ {profile.merit ?? 0}</span>
          <span title={`Shadow corruption: ${profile.corruption}/100`} className="flex items-center gap-1.5">
            <span className="text-ash">◐</span>
            <span className="w-12 sm:w-16 h-1.5 bg-border relative overflow-hidden">
              <span
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-whisper to-ember"
                style={{ width: `${Math.min(100, profile.corruption ?? 0)}%` }}
              />
            </span>
          </span>
        </div>

        {/* Row 3: action toolbar — icon-only on mobile, label on desktop */}
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          <button onClick={() => setInvOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs" title="Inventory">
            <Backpack className="w-4 h-4" /><span>{inventory.length}</span>
          </button>
          <button onClick={() => setTracerOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs" title="Weave runes (Lesser & Greater)">
            <Flame className="w-4 h-4" /><span className="hidden sm:inline">runes</span>
          </button>
          <button
            onClick={() => { setCodexEntry(null); setChronicleTab("journal"); setJournalOpen(true); }}
            className="flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs"
            title="Your chronicle (journal & codex of truths)"
          >
            <ScrollText className="w-4 h-4" />
            <span className="hidden sm:inline">chronicle</span>
            <span className="font-mono text-[10px] text-ash">{discoveries.length}/{lore.length}</span>
          </button>
          <button onClick={() => setHelpOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs ml-auto" title="Commands">
            <HelpCircle className="w-4 h-4" /><span className="hidden sm:inline">help</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Main log */}
        <main className="flex-1 flex flex-col min-w-0">
          <div ref={logRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-6 space-y-3 font-body text-[17px] leading-relaxed">
            <RoomBlock room={room} npcs={npcs} dragons={dragons} sceneUrl={sceneUrl} sceneLoading={sceneLoading} events={roomEvents} />
            {profile.gold >= 500 && (
              <div className="border border-ember/40 bg-ember/5 px-3 py-2 text-xs text-ember italic font-mono">
                ⚠ Your hoard glints too brightly. Carrying {profile.gold}g may catch a dragon's eye.
              </div>
            )}
            {profile.in_combat_id && (
              <CombatHUD combatId={profile.in_combat_id} userId={profile.id} onAct={combatAct} />
            )}
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
              {npcs.map((n) => {
                const score = amityByNpc[n.id];
                const word = score === undefined ? null
                  : score <= -60 ? "hostile" : score <= -20 ? "wary"
                  : score < 20 ? null : score < 60 ? "friendly" : "devoted";
                const tone = score === undefined ? "" :
                  score <= -20 ? "text-ember" : score >= 60 ? "text-moss" : score >= 20 ? "text-accent" : "";
                return (
                  <button key={n.id} onClick={() => { setInput(`ask ${n.name.split(" ")[0]} `); inputRef.current?.focus(); }}
                    className="block text-left w-full font-body text-parchment hover:text-ember transition-colors">
                    <span className="text-accent">●</span> {n.name}
                    {n.title && <span className="text-ash italic"> — {n.title}</span>}
                    {word && <span className={`text-[10px] italic ml-1 ${tone}`}> ({word})</span>}
                  </button>
                );
              })}
              {presence.map((p) => (
                <div key={p.username} className="font-body text-moss">
                  <span>◆</span> {p.username}{p.username === profile.username && <span className="text-ash"> (you)</span>}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setHelpOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 font-mono text-[11px] text-ash hover:text-ember border border-border hover:border-ember rounded px-2 py-1.5 transition-colors"
          >
            <HelpCircle className="w-3 h-3" /> Commands & Help
          </button>
        </aside>
      </div>

      <ChronicleModal
        open={journalOpen || codexOpen}
        onClose={() => { setJournalOpen(false); setCodexOpen(false); setCodexEntry(null); }}
        lore={lore}
        discoveries={discoveries}
        openSlug={codexEntry}
        setOpenSlug={(s) => { setCodexEntry(s); if (s) setChronicleTab("codex"); }}
        initialTab={codexOpen ? "codex" : chronicleTab}
      />
      {invOpen && (
        <InventoryPanel
          items={inventory}
          totalWeight={inventory.reduce((s, i) => s + (i.items.weight ?? 0) * i.quantity, 0)}
          maxWeight={profile.max_weight ?? 50}
          onClose={() => setInvOpen(false)}
          onChanged={() => { reloadInventory(); reloadProfile(); }}
        />
      )}
      {runesOpen && (
        <RunesPanel
          known={knownRunes}
          items={inventory}
          onClose={() => setRunesOpen(false)}
          onChanged={() => { reloadRunes(); reloadInventory(); }}
        />
      )}
      <RuneHub open={tracerOpen} onClose={() => setTracerOpen(false)} onCast={() => reloadProfile()} />
      <CharacterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} profile={profile} inventory={inventory} onPortraitUpdated={(url) => setProfile((p: any) => p ? { ...p, portrait_url: url } : p)} />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Commands</DialogTitle>
            <DialogDescription>Type any of these in the prompt below.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 font-mono text-xs">
            {HELP.map(([k, v]) => (
              <li key={k} className="leading-snug">
                <div className="text-ember">{k}</div>
                <div className="text-ash/80 pl-2">— {v}</div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {hallOpen && (
        <HallOfChoice
          currentAether={profile.aether}
          onClose={() => setHallOpen(false)}
          onAligned={reloadProfile}
        />
      )}
    </div>
  );
}

function RoomBlock({ room, npcs, dragons, sceneUrl, sceneLoading, events }: {
  room: Room; npcs: Npc[]; dragons: { name: string; epithet: string; personality: string }[];
  sceneUrl: string | null; sceneLoading: boolean;
  events: { kind: string; actor_name: string; target_name: string | null; details: any; created_at: string }[];
}) {
  return (
    <div className="border-l-2 border-ember/60 pl-4 py-1 mb-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ash mb-1">{room.label ?? "Place"}</div>
      <h2 className="font-display text-2xl text-ember mb-2">{room.name}</h2>
      <div className="mb-3 aspect-[16/9] bg-card/50 border border-border overflow-hidden relative">
        {sceneUrl ? (
          <img src={sceneUrl} alt={room.name} className="w-full h-full object-cover animate-in fade-in duration-700" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {sceneLoading ? (
              <div className="flex items-center gap-2 text-whisper text-xs font-mono italic">
                <Loader2 className="w-3 h-3 animate-spin" /> the world is being painted…
              </div>
            ) : (
              <span className="text-ash text-xs italic">…</span>
            )}
          </div>
        )}
      </div>
      <p className="text-parchment whitespace-pre-line">
        {room.description}
        {events.filter(e => VISIBLE_EVENT_KINDS.has(e.kind)).length > 0 && (
          <>
            {" "}
            <span className="text-whisper italic">{events.filter(e => VISIBLE_EVENT_KINDS.has(e.kind)).map(e => describeEvent(e)).join(" ")}</span>
          </>
        )}
      </p>
      {room.ambience && <p className="text-ash italic mt-2">{room.ambience}</p>}
      {dragons.length > 0 && (
        <div className="mt-3 border border-ember/60 bg-ember/10 px-3 py-2">
          {dragons.map((d) => (
            <p key={d.name} className="text-ember">
              <span className="font-display text-lg">✦ {d.name}</span>
              <span className="italic">, {d.epithet}</span>
              <span className="block text-whisper text-sm italic mt-1">{d.personality}</span>
            </p>
          ))}
        </div>
      )}
      {npcs.length > 0 && (
        <div className="text-whisper italic mt-2 space-y-0.5">
          {npcs.map((n) => (
            <p key={n.id}>
              <span className="text-parchment">{n.name}</span>
              {n.title ? <span>, {n.title}</span> : null}
              {n.current_activity ? <span className="text-ash"> — {n.current_activity}</span> : null}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// Only world-altering events should bleed into the room narration.
// Everyday chatter (npc_activity, npc_moved, location_discovered, rune_cast, rune_word_learned, etc.)
// is tracked in the background for NPC awareness but is not shown in the scene description.
const VISIBLE_EVENT_KINDS = new Set(["npc_killed", "died", "rune_backfire", "compound_backfire"]);

function describeEvent(e: { kind: string; actor_name: string; target_name: string | null; details: any }) {
  if (e.kind === "npc_killed") {
    return `${e.actor_name} slew ${e.target_name}${e.details?.npc_title ? `, ${e.details.npc_title}` : ""} on these stones. The mark lingers.`;
  }
  if (e.kind === "died") {
    return `${e.actor_name} fell here. The ground remembers.`;
  }
  if (e.kind === "rune_backfire" || e.kind === "compound_backfire") {
    return `${e.actor_name}'s weave bit back here — the air still tastes wrong.`;
  }
  return `${e.actor_name} did ${e.kind}${e.target_name ? ` to ${e.target_name}` : ""} here.`;
}

function MessageLine({ m, you }: { m: Message; you: string }) {
  const isYou = m.author_name === you;
  if (m.kind === "system" || m.kind === "local") {
    return <div className="text-ash italic font-mono text-xs whitespace-pre-wrap">{m.content}</div>;
  }
  if (m.kind === "emote") {
    return <div className="text-moss italic">* {m.author_name} {m.content}</div>;
  }
  if (m.kind === "ambient") {
    return <div className="text-whisper italic text-sm">{m.content}</div>;
  }
  if (m.kind === "shadow") {
    return (
      <div className="border-l-2 border-whisper/40 pl-3 my-1">
        <div className="font-mono text-[10px] text-ash uppercase tracking-[0.3em]">— a whisper from the unspoken —</div>
        <p className="text-whisper italic lowercase tracking-wide">{m.content}</p>
        <div className="mt-1 flex gap-2 font-mono text-[10px]">
          <button onClick={() => window.dispatchEvent(new CustomEvent("shadow-act", { detail: "submit" }))}
            className="text-ember/80 hover:text-ember underline underline-offset-2">listen</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent("shadow-act", { detail: "resist" }))}
            className="text-moss hover:text-parchment underline underline-offset-2">speak against it</button>
        </div>
      </div>
    );
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

function formatRoom(room: Room, npcs: Npc[], events: { kind: string; actor_name: string; target_name: string | null; details: any }[] = []) {
  const lines = [`${(room.label ?? "Place").toUpperCase()} — ${room.name.toUpperCase()}`, "", room.description];
  if (room.ambience) lines.push("", room.ambience);
  if (npcs.length) lines.push("", "Here: " + npcs.map(n => n.current_activity ? `${n.name} (${n.current_activity})` : n.name).join(", "));
  lines.push("", "Exits: " + (Object.keys(room.exits).join(", ") || "none"));
  const visible = events.filter(e => VISIBLE_EVENT_KINDS.has(e.kind));
  if (visible.length) {
    lines.push("", "— what happened here —");
    for (const e of visible) {
      if (e.kind === "npc_killed") lines.push(`  ${e.actor_name} slew ${e.target_name}${e.details?.npc_title ? `, ${e.details.npc_title}` : ""}.`);
      else lines.push(`  ${e.actor_name} ${e.kind}${e.target_name ? ` ${e.target_name}` : ""}.`);
    }
  }
  return lines.join("\n");
}
