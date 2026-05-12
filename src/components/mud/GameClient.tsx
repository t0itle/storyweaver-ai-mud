import { useEffect, useMemo, useRef, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Backpack, Flame, HelpCircle, Landmark, Loader2, LogOut, ScrollText, Sparkles, Users, Volume2, VolumeX } from "lucide-react";
import { useRoomAudio } from "./useRoomAudio";
import { CombatHUD, InventoryPanel, RunesPanel, type InvItem, type KnownRune } from "./Panels";
import { KinPanel } from "./KinPanel";
import { ChronicleModal } from "./ChronicleModal";
import { BoardModal } from "./BoardModal";
import { MarketModal } from "./MarketModal";
import { GuildModal } from "./GuildModal";
import SkillTreeModal from "./SkillTreeModal";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { CharacterSheet } from "./CharacterSheet";
import { RuneHub } from "./RuneHub";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import HallOfChoice from "./HallOfChoice";
import { QuestsPanel } from "./QuestsPanel";
import { DeathSaveModal } from "./DeathSaveModal";

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
  escortee_npc_id: string | null;
  escortee_destination: string | null;
  escortee_destination_name: string | null;
  downed: boolean; downed_at: string | null; downed_combat_id: string | null;
  dead: boolean; dead_at: string | null; death_room: string | null;
  zombified: boolean; revived_by: string | null; revived_at: string | null;
  talent_points?: number;
}
interface Room {
  slug: string; name: string; description: string;
  ambience: string | null;
  exits: Record<string, string>;
  kind?: string; label?: string;
  town_key?: string | null;
}
interface Npc { id: string; room: string; name: string; title: string | null; greeting: string | null; current_activity?: string | null; is_merchant?: boolean | null; merchant_town?: string | null; is_guildmaster?: boolean | null; guild_key?: string | null; is_soul?: boolean | null; is_fence?: boolean | null; }
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
  ["quests", "open your quest log"],
  ["accept <title>", "accept an offered quest"],
  ["decline <title>", "refuse an offered quest"],
  ["abandon <title>", "drop an active quest (NPC will remember)"],
  ["search", "search the room for hidden caches"],
  ["wagon", "hire the wagonmaster (open the fast-travel panel)"],
  ["rest", "sleep at an inn — full heal, costs gold"],
  ["camp", "make camp in the wilds — partial heal, may be ambushed"],
  ["services", "list services any NPC here will sell you"],
  ["pay <npc> <service>", "pay an NPC for a service (e.g. pay senna bind)"],
  ["buy <npc> [item]", "buy an item from an NPC after striking a verbal deal"],
  ["help", "show this list"],
];

const INTERACT_VERBS = new Set([
  "read","open","close","touch","feel","smell","sniff","listen","taste","lick",
  "push","pull","press","turn","twist","light","extinguish","sit","stand","kneel","pray",
  "break","smash","cut","tear","burn","wash","drink","eat","sip","knock","wave",
  "climb","dig","search","kiss","hug","bow","salute","pick","wear","remove","throw",
  "shake","rub","scratch","poke","hold","lift","carry","drop","place","write","sing","whistle","dance","sleep","rest","meditate",
]);

type TimeBucket = "night" | "dawn" | "morning" | "midday" | "dusk" | "deepnight";

function getTimeBucket(d: Date = new Date()): TimeBucket {
  const h = d.getUTCHours();
  if (h < 5) return "deepnight";
  if (h < 8) return "dawn";
  if (h < 12) return "morning";
  if (h < 16) return "midday";
  if (h < 20) return "dusk";
  return "night";
}

// Shop owners (merchants, fences, guildmasters running a counter) close up
// for the small hours and aren't present in the room during deepnight.
function filterNpcsForBucket<T extends { is_merchant?: boolean; is_fence?: boolean; is_guildmaster?: boolean }>(list: T[], bucket: TimeBucket): T[] {
  if (bucket !== "deepnight") return list;
  return list.filter((n) => !n.is_merchant && !n.is_fence && !n.is_guildmaster);
}

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
  const [roommates, setRoommates] = useState<{
    id: string; username: string; portrait_url: string | null;
    level: number; aether: string | null; faction: string | null;
    downed: boolean; dead: boolean;
  }[]>([]);
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
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [corpses, setCorpses] = useState<{ id: string; username: string }[]>([]);
  const [reviving, setReviving] = useState(false);
  const [kinOpen, setKinOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [activeQuestCount, setActiveQuestCount] = useState(0);
  const [offeredQuestCount, setOfferedQuestCount] = useState(0);
  const [wagonOpen, setWagonOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [marketMerchant, setMarketMerchant] = useState<string | null>(null);
  const [guildmaster, setGuildmaster] = useState<string | null>(null);
  const [wagonRoutes, setWagonRoutes] = useState<{ destination: string; cost_gold: number; flavor: string; name?: string; visited?: boolean }[]>([]);
  const [hasCache, setHasCache] = useState(false);
  const [cacheClaimed, setCacheClaimed] = useState(false);
  const [roomLoot, setRoomLoot] = useState<{ id: string; gold: number; item_key: string | null; quantity: number; placed_by_name: string | null }[]>([]);
  const [bucket, setBucket] = useState<TimeBucket>(getTimeBucket());
  const audioMode: "room" | "combat" | "rest" = profile?.in_combat_id
    ? "combat"
    : room?.kind === "inn"
      ? "rest"
      : "room";
  const { muted: musicMuted, setMuted: setMusicMuted, tryResume: resumeMusic } = useRoomAudio(
    profile?.current_room ?? null,
    audioMode,
  );
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tick a world clock once a minute. When the time-of-day bucket flips,
  // emit a system note in the current room so players feel the day pass.
  useEffect(() => {
    const id = setInterval(() => {
      const next = getTimeBucket();
      setBucket((prev) => {
        if (prev === next) return prev;
        if (profile && room) {
          const note = TIME_TRANSITIONS[next];
          setMessages((m) => [...m, {
            id: crypto.randomUUID(), room: room.slug, author_name: "—",
            kind: "ambient", content: `*${note} over ${room.name}.*`,
            created_at: new Date().toISOString(), user_id: null, npc_id: null,
          } as Message]);
        }
        return next;
      });
    }, 60000);
    return () => clearInterval(id);
  }, [profile, room]);

  // When the time-of-day flips, re-pull NPCs so shop owners vanish at deepnight
  // and reappear at dawn without requiring the player to leave and return.
  useEffect(() => {
    if (!profile?.current_room) return;
    const slug = profile.current_room;
    let cancelled = false;
    (async () => {
      const { data: n } = await supabase.from("npcs").select("*").eq("room", slug)
        .or(`dead_until.is.null,dead_until.lte.${new Date().toISOString()}`);
      const { data: d } = await supabase.from("player_npc_discoveries")
        .select("npc_id").eq("user_id", profile.id);
      const found = new Set((d ?? []).map((x: any) => x.npc_id));
      if (cancelled) return;
      setNpcs(filterNpcsForBucket(((n ?? []) as any[]).filter((x: any) => !x.hidden || found.has(x.id)) as Npc[], bucket));
    })();
    return () => { cancelled = true; };
  }, [bucket, profile?.id, profile?.current_room]);

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

  const reloadQuestCounts = async () => {
    const { data } = await supabase.from("quests")
      .select("status").eq("user_id", session.user.id)
      .in("status", ["active", "offered"]);
    setActiveQuestCount((data ?? []).filter((q: any) => q.status === "active").length);
    setOfferedQuestCount((data ?? []).filter((q: any) => q.status === "offered").length);
  };

  useEffect(() => { reloadInventory(); reloadRunes(); reloadQuestCounts(); }, [session.user.id]);

  // Quests realtime
  useEffect(() => {
    const ch = supabase.channel(`quests:${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quests", filter: `user_id=eq.${session.user.id}` },
        () => reloadQuestCounts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session.user.id]);

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

  // Wound-state portrait variant for HUD (auto-fetches when hurt)
  const woundState = useMemo<"healthy" | "scratched" | "wounded" | "bloodied">(() => {
    if (!profile) return "healthy";
    const pct = profile.max_hp > 0 ? profile.hp / profile.max_hp : 1;
    if (pct >= 0.75) return "healthy";
    if (pct >= 0.5) return "scratched";
    if (pct >= 0.25) return "wounded";
    return "bloodied";
  }, [profile?.hp, profile?.max_hp]);
  const woundKind = (profile as any)?.last_damage_kind ?? "physical";
  const woundCacheKey = `${woundState}:${woundKind}`;
  const cachedWoundPortrait: string | null =
    woundState === "healthy" ? null : ((profile as any)?.portrait_variants ?? {})[woundCacheKey] ?? null;
  const hudPortrait = cachedWoundPortrait ?? profile?.portrait_url ?? null;
  useEffect(() => {
    if (!profile?.portrait_url || woundState === "healthy" || cachedWoundPortrait) return;
    let cancelled = false;
    supabase.functions.invoke("portrait-state-variant", { body: { state: woundState, kind: woundKind } })
      .then(({ data }) => {
        if (cancelled || !data?.portrait_url) return;
        setProfile((p: any) => p ? {
          ...p,
          portrait_variants: { ...(p.portrait_variants ?? {}), [woundCacheKey]: data.portrait_url },
        } : p);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profile?.portrait_url, woundState, woundKind, woundCacheKey, cachedWoundPortrait]);

  // Corpses in this room (dead players you could potentially revive)
  useEffect(() => {
    if (!profile) { setCorpses([]); return; }
    const load = () => supabase.from("profiles")
      .select("id,username")
      .eq("dead", true).eq("death_room", profile.current_room).neq("id", profile.id)
      .then(({ data }) => setCorpses((data ?? []) as any));
    load();
    const ch = supabase.channel(`corpses:${profile.current_room}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.current_room, profile?.id]);

  const reviveCorpse = async (targetId: string, name: string) => {
    if (reviving) return;
    setReviving(true);
    try {
      const { data, error } = await supabase.functions.invoke("revive-player", { body: { target_user_id: targetId } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success(`${name} rises — zombified.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "The dead refuse the call."); }
    finally { setReviving(false); }
  };

  // Load room + npcs + history when room changes
  useEffect(() => {
    if (!profile) return;
    const slug = profile.current_room;
    setSceneUrl(null);
    (async () => {
      const nowIso = new Date().toISOString();
      // Only show conversations from the moment the player arrived in this room.
      const [{ data: r }, { data: nAll }, { data: m }, { data: ev }, { data: dr }, { data: discov }, { data: extraExits }, { data: envTags }] = await Promise.all([
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
        supabase.from("player_npc_discoveries").select("npc_id").eq("user_id", profile.id),
        supabase.from("player_room_extra_exits").select("dir,to_room,label")
          .eq("user_id", profile.id).eq("room", slug),
        supabase.from("room_env_tags").select("tag").eq("room", slug),
      ]);
      const discoveredIds = new Set((discov ?? []).map((d: any) => d.npc_id));
      // Hide soul/hidden NPCs that this player has not personally uncovered.
      const n = (nAll ?? []).filter((x: any) => !x.hidden || discoveredIds.has(x.id));
      if (r) {
        // Merge per-player unlocked exits into the room's exits map
        const merged: Record<string, string> = { ...((r as any).exits ?? {}) };
        for (const ex of extraExits ?? []) merged[(ex as any).dir] = (ex as any).to_room;
        setRoom({ ...(r as any), exits: merged } as Room);
      }
      // Show a faint hint about environmental tags the first time you see them this visit
      const tagList = (envTags ?? []).map((t: any) => t.tag);
      let hintMsg: Message | null = null;
      if (tagList.length) {
        const hintMap: Record<string, string> = {
          dark: "It is very dark here.",
          flooded: "Water lies heavy across the floor.",
          parched: "The air is bone-dry; nothing grows.",
          sealed: "Something here is bound shut.",
          overgrown: "Vines and briar choke the ground.",
          hallowed: "The air feels older than the stones.",
        };
        const lines = tagList.map((t) => hintMap[t]).filter(Boolean);
        if (lines.length) hintMsg = localSys(lines.map((l) => `*${l}*`).join("  "));
      }
      setNpcs(filterNpcsForBucket((n ?? []) as Npc[], getTimeBucket()));
      setDragons((dr ?? []) as any);
      setRoomEvents((ev ?? []) as any);
      const baseMsgs = ((m ?? []) as Message[]).reverse();
      setMessages(hintMsg ? [...baseMsgs, hintMsg] : baseMsgs);

      // Load amity scores for the NPCs in this room
      const npcIds = (n ?? []).map((x: any) => x.id);
      if (npcIds.length) {
        const { data: am } = await supabase.from("npc_amity")
          .select("npc_id,score").eq("user_id", profile.id).in("npc_id", npcIds);
        const map: Record<string, number> = {};
        for (const row of am ?? []) map[(row as any).npc_id] = (row as any).score;
        setAmityByNpc(map);
      } else { setAmityByNpc({}); }

      // Top up residents if this room has fewer NPCs than its kind's floor.
      if (r && (r as any).kind !== "loft") {
        supabase.functions.invoke("populate-npcs", { body: { room: slug } })
          .then(({ data }) => {
            if (data?.added > 0) {
              // refetch npcs after a short beat so they appear
              setTimeout(async () => {
                const { data: n2 } = await supabase.from("npcs").select("*").eq("room", slug)
                  .or(`dead_until.is.null,dead_until.lte.${new Date().toISOString()}`);
                const { data: d2 } = await supabase.from("player_npc_discoveries")
                  .select("npc_id").eq("user_id", profile.id);
                const found = new Set((d2 ?? []).map((d: any) => d.npc_id));
                setNpcs(filterNpcsForBucket(((n2 ?? []) as any[]).filter((x: any) => !x.hidden || found.has(x.id)) as Npc[], getTimeBucket()));
              }, 400);
            }
          })
          .catch(() => { /* silent */ });
      }
    })();
  }, [profile?.current_room]);

  // Living scene: post a sensory ambient line on entry and every 45-90s while present.
  // AI-generated per room+player+moment, with a local pool as fallback.
  // Lines are not persisted — only the current player sees them.
  useEffect(() => {
    if (!profile || !room) return;
    const slug = profile.current_room;
    const kind = (room.kind ?? "room") as string;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const recent: string[] = [];

    const generate = async (): Promise<string | null> => {
      try {
        const { data, error } = await supabase.functions.invoke("room-ambience", { body: { recent } });
        if (error) throw error;
        const line = (data as any)?.line as string | undefined;
        if (line && line.length > 2) return line;
      } catch (e) { /* fall through */ }
      return pickAmbience(kind, npcs.map(n => n.name));
    };

    const fire = (delay: number) => {
      const t = setTimeout(async () => {
        if (cancelled) return;
        // skip if room is not the focus anymore
        if (slug !== profile.current_room) return;
        const line = await generate();
        if (cancelled) return;
        if (line) {
          recent.push(line);
          if (recent.length > 8) recent.shift();
          setMessages((m) => [...m, {
            id: crypto.randomUUID(), room: slug, author_name: "—",
            kind: "ambient", content: `*${line}*`, created_at: new Date().toISOString(),
            user_id: null, npc_id: null,
          } as Message]);
        }
        fire(45000 + Math.floor(Math.random() * 45000));
      }, delay);
      timers.push(t);
    };
    fire(2200 + Math.floor(Math.random() * 2000));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [profile?.current_room, room?.slug]);

  // Wagon routes & cache info for the current room
  useEffect(() => {
    if (!profile) return;
    const slug = profile.current_room;
    (async () => {
      const [{ data: routes }, { data: cache }, { data: claim }] = await Promise.all([
        supabase.from("wagon_routes").select("destination, cost_gold, flavor").eq("hub", slug),
        supabase.from("room_caches").select("room").eq("room", slug).maybeSingle(),
        supabase.from("player_room_cache_claims").select("room").eq("user_id", profile.id).eq("room", slug).maybeSingle(),
      ]);
      if (routes && routes.length) {
        // resolve names + check visited
        const dests = routes.map((r: any) => r.destination);
        const [{ data: roomNames }, { data: visits }] = await Promise.all([
          supabase.from("rooms").select("slug, name").in("slug", dests),
          supabase.from("world_events").select("room").eq("actor_id", profile.id).in("room", dests),
        ]);
        const nameMap = new Map((roomNames ?? []).map((r: any) => [r.slug, r.name]));
        const visitedSet = new Set((visits ?? []).map((v: any) => v.room));
        setWagonRoutes(routes.map((r: any) => ({
          ...r, name: nameMap.get(r.destination) ?? r.destination, visited: visitedSet.has(r.destination),
        })));
      } else {
        setWagonRoutes([]);
      }
      setHasCache(!!cache);
      setCacheClaimed(!!claim);
    })();
  }, [profile?.current_room, profile?.id]);

  // Live loot pile in the current room (any player can `take` from it).
  useEffect(() => {
    if (!profile?.current_room) return;
    const slug = profile.current_room;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("room_loot")
        .select("id, gold, item_key, quantity, placed_by_name")
        .eq("room", slug);
      if (!cancelled) setRoomLoot(data ?? []);
    })();
    const ch = supabase.channel(`loot:${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_loot", filter: `room=eq.${slug}` },
        async () => {
          const { data } = await supabase.from("room_loot")
            .select("id, gold, item_key, quantity, placed_by_name").eq("room", slug);
          if (!cancelled) setRoomLoot(data ?? []);
        })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [profile?.current_room]);

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

  // Realtime: messages in current room + presence + DB-backed roommates
  useEffect(() => {
    if (!profile) return;
    const slug = profile.current_room;
    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const loadRoommates = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, portrait_url, level, aether, faction, downed, dead")
        .eq("current_room", slug)
        .neq("id", profile.id)
        .limit(50);
      if (!cancelled) setRoommates((data ?? []) as any);
    };
    const scheduleReload = () => {
      if (pending) return;
      pending = setTimeout(() => { pending = null; loadRoommates(); }, 250);
    };
    loadRoommates();

    const ch = supabase.channel(`room:${slug}`, { config: { presence: { key: profile.id } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${slug}` },
        (p) => {
          const msg = p.new as Message & { addressed_to?: string | null };
          if (!msg.addressed_to || msg.addressed_to === profile.id) {
            setMessages((prev) => [...prev, msg]);
          }
        })
      // Any profile move/state change triggers a refresh — covers arrivals AND departures.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, scheduleReload)
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, { username: string }[]>;
        const users = Object.values(state).flat();
        setPresence(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await ch.track({ username: profile.username });
      });

    // Safety net: window-focus refresh in case realtime missed an event.
    const onFocus = () => loadRoommates();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(ch);
    };
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

    // Escortee tags along (non-combatant) — they MUST survive to be delivered.
    let escorteeName: string | null = null;
    if (profile.escortee_npc_id) {
      const { data: esc } = await supabase.from("npcs")
        .select("name").eq("id", profile.escortee_npc_id).maybeSingle();
      if (esc) {
        escorteeName = esc.name;
        await supabase.from("npcs").update({ room: slug }).eq("id", profile.escortee_npc_id);
        await supabase.from("messages").insert({
          room: profile.current_room, author_name: "—", kind: "ambient",
          content: `*${esc.name} hurries after ${profile.username}, keeping close.*`, user_id: null,
        });
      }
    }

    const { error } = await supabase.from("profiles").update({ current_room: slug }).eq("id", profile.id);
    if (error) { toast.error(error.message); return; }
    setProfile({ ...profile, current_room: slug });
    // Quest auto-resolution: any active "visit" or "escort" quest targeting this room completes.
    supabase.functions.invoke("quest-auto-resolve", {
      body: { event: { kind: "visit", room: slug } },
    }).then(({ data }) => {
      const completed = data?.completed ?? [];
      for (const r of completed) {
        toast.success(`✦ Quest complete: ${r.title} — +${r.gold ?? 0}g, +${r.xp ?? 0}xp`);
      }
      if (completed.length) reloadProfile();
    }).catch(() => null);
    setTimeout(() => {
      post("system", `${profile.username} arrives.`, "—");
      if (companionName) {
        supabase.from("messages").insert({
          room: slug, author_name: "—", kind: "ambient",
          content: `*${companionName} arrives alongside ${profile.username}.*`, user_id: null,
        });
      }
      if (escorteeName) {
        supabase.from("messages").insert({
          room: slug, author_name: "—", kind: "ambient",
          content: `*${escorteeName} steps in behind ${profile.username}, breathing easier.*`, user_id: null,
        });
      }
    }, 300);

    // First arrival at the First City: deliver the mortality / Aether-vow truth, once.
    if (slug === "first-city-gate" || slug === "first-city") {
      (async () => {
        const { data: prior } = await supabase
          .from("player_journal_entries")
          .select("id").eq("user_id", profile.id).eq("kind", "first_city_arrival").maybeSingle();
        if (prior) return;
        const body =
          "The Veiled at the gate watch you with quiet, knowing eyes. One of them lifts the linen from their lips just enough to murmur:\n\n" +
          "*\"Walker — know this before you pass under the seven sigils. You are mortal. The years will take you as they take all unbound things.*\n" +
          "*But should you kneel before an Aether and swear true, their breath will lengthen yours. Their followers do not age as you age. They do not fall as you fall. To bend the knee is to step out of time's current.*\n" +
          "*Or walk on, and burn briefly, and bright, and yours.\"*";
        await supabase.from("player_journal_entries").insert({
          user_id: profile.id, kind: "first_city_arrival",
          title: "The Veiled told me the truth at the gate", body, room: slug,
        });
        await supabase.from("messages").insert({
          room: slug, author_name: "A Veiled gatekeeper", kind: "system",
          addressed_to: profile.id, user_id: null, content: body,
        });
      })();
    }

    // Travel encounters: roll on road / desert / wilds / hollow / grove rooms.
    // Server enforces cooldown + 15% trigger chance, so we always call it.
    supabase.functions.invoke("random-encounter", { body: { room: slug } })
      .then(({ data }) => {
        if (!data?.ok) return;
        if (data.kind === "ambush") {
          toast.error(`⚔ Ambush! ${data.npc_name} blocks the way.`);
        } else if (data.kind === "traveler") {
          toast(`✉ ${data.npc_name} asks for safe passage to ${data.destination_name}. Open Quests to accept.`);
        } else if (data.kind === "discovery") {
          if (data.reward?.kind === "gold") toast.success(`+${data.reward.amount}g (roadside find)`);
          else if (data.reward?.kind === "xp") toast.success(`+${data.reward.amount}xp (you take it in)`);
          reloadProfile();
        } else if (data.kind === "patrol") {
          toast(`${data.npc_name} flags you down on the road.`);
        }
      })
      .catch(() => null);
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
      setMessages((m) => [...m, localSys(formatRoom(room, npcs, roomEvents, bucket))]);
    } else if (c === "who") {
      const onlineNames = new Set(presence.map(p => p.username));
      const lines = roommates.map(r => {
        const dot = onlineNames.has(r.username) ? "●" : "○";
        const tags: string[] = [`lv ${r.level}`];
        if (r.aether) tags.push(r.aether);
        if (r.faction === "chaos") tags.push("chaos");
        if (r.dead) tags.push("fallen");
        else if (r.downed) tags.push("downed");
        return `  ${dot} ${r.username} (${tags.join(", ")})`;
      });
      lines.unshift(`  ● ${profile!.username} (you)`);
      setMessages((m) => [...m, localSys(`Here:\n${lines.join("\n")}`)]);
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
      const exitsMap = (room.exits as Record<string, string>) ?? {};
      // Any named exit key on this room (back, out, in, up, down, sanctum, etc.) is a valid move.
      const namedExitTarget = exitsMap[dir];
      if (namedExitTarget && !compassWords.includes(dir)) {
        await moveTo(namedExitTarget);
      } else if (compassWords.includes(dir)) {
        const target = exitsMap[dir];
        const isDesert = room.kind === "desert";
        const isCardinal = ["north","south","east","west"].includes(dir);
        // In the deep desert, every cardinal step is a wander roll, even if a stale exit exists.
        // In other desert rooms, only directions with no marked road push you off-piste.
        if (isDesert && isCardinal && (room.slug === "deep-desert" || !target)) {
          setMessages((m) => [...m, localSys(`*You leave the road and walk ${dir} into the sand.*`)]);
          try {
            const { data, error } = await supabase.functions.invoke("desert-wander", { body: { direction: dir } });
            if (error || data?.error) throw new Error(data?.error ?? error?.message);
            await reloadProfile();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "the desert turns you back");
          }
        } else if (!target) {
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
          setMessages((m) => [...m, localSys(`No road leads to "${dir}" from here. Follow exits, ask folk for directions, or hire a wagon.`)]);
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
        if (data?.silent) {
          toast.warning("The dead are silent without the Blessing of 💀 Necros.");
          setMessages((mm) => [...mm, localSys(`*${npc.name}'s mouth moves, but no sound reaches you. You need the Blessing of **💀 Necros** to hear the dead. Seek **Vesha the Tongue-of-Ash** at the Skeleton Kiln.*`)]);
          return;
        }
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
        if (data?.artifact_rumor) {
          const r = data.artifact_rumor;
          toast(`${r.glyph} A whisper of ${r.name}…`, { description: r.snippet });
        }
        if (data?.price_offer) {
          const p = data.price_offer;
          toast.success(`✦ ${npc.name} cuts you a deal: ${p.service_name} for ${p.price_gold}g`, { description: "Use the pay command within 2 hours." });
          setMessages((mm) => [...mm, localSys(`✦ ${npc.name} agrees: **${p.service_name}** for **${p.price_gold}g** (good for ~2h). Use \`pay ${npc.name.split(" ")[0].toLowerCase()} ${p.service_key.split("-")[0]}\`.`)]);
        }
        if (data?.item_offer) {
          const p = data.item_offer;
          toast.success(`✦ ${npc.name} will sell you ${p.item_name} for ${p.price_gold}g`, { description: "Use the buy command within 2 hours." });
          setMessages((mm) => [...mm, localSys(`✦ ${npc.name} agrees to sell **${p.item_name}** for **${p.price_gold}g** (good for ~2h). Use \`buy ${npc.name.split(" ")[0].toLowerCase()} ${p.item_key.split("-")[0]}\`.`)]);
        }
        // NPCs may name places — but the world is fixed. We no longer auto-create rooms.
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "The NPC stays silent.");
      } finally { setThinking(false); }
    } else if (c === "wagon" || c === "ride") {
      if (wagonRoutes.length === 0) {
        setMessages((m) => [...m, localSys("No wagonmaster runs from here.")]);
      } else {
        setWagonOpen(true);
      }
    } else if (c === "services" || c === "service") {
      // List services across all NPCs in this room. If args, narrow to that NPC.
      const wantNpcs = args
        ? npcs.filter((n) => n.name.toLowerCase().includes(args.toLowerCase()))
        : npcs;
      if (wantNpcs.length === 0) { setMessages((m) => [...m, localSys("No one here is offering services.")]); return; }
      const { data: rows } = await supabase.from("npc_services" as any)
        .select("npc_id, key, name, blurb, price_gold")
        .in("npc_id", wantNpcs.map((n) => n.id));
      const byNpc = new Map<string, any[]>();
      (rows ?? []).forEach((r: any) => {
        const arr = byNpc.get(r.npc_id) ?? [];
        arr.push(r); byNpc.set(r.npc_id, arr);
      });
      if (byNpc.size === 0) { setMessages((m) => [...m, localSys("No one here is offering services.")]); return; }
      const lines: string[] = [];
      for (const n of wantNpcs) {
        const list = byNpc.get(n.id);
        if (!list) continue;
        lines.push(`*${n.name}${n.title ? `, ${n.title}` : ""} offers:*`);
        for (const s of list) lines.push(`  • **${s.name}** — ${s.price_gold}g  _(${s.blurb})_  [pay ${n.name.split(" ")[0].toLowerCase()} ${s.key.split("-")[0]}]`);
      }
      setMessages((m) => [...m, localSys(lines.join("\n"))]);
    } else if (c === "pay") {
      const m1 = args.match(/^(\S+)\s+(.+)$/);
      if (!m1) { setMessages((m) => [...m, localSys('Try: pay <npc> <service>. Example: "pay senna bind".')]); return; }
      const [, target, svcArg] = m1;
      const npc = npcs.find((n) => n.name.toLowerCase().startsWith(target.toLowerCase()));
      if (!npc) { setMessages((m) => [...m, localSys(`No one called "${target}" is here.`)]); return; }
      const { data: svcRows } = await supabase.from("npc_services" as any)
        .select("key, name, price_gold").eq("npc_id", npc.id);
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const needle = norm(svcArg);
      const all = (svcRows ?? []) as any[];
      const matches = all.filter((s) => norm(s.name).includes(needle) || norm(s.key).includes(needle));
      if (matches.length === 0) { setMessages((m) => [...m, localSys(`${npc.name} offers no service matching "${svcArg}". Try "services ${target}".`)]); return; }
      if (matches.length > 1) { setMessages((m) => [...m, localSys(`Be more specific — ${npc.name} offers: ${matches.map((s) => s.name).join(" / ")}.`)]); return; }
      try {
        const { data, error } = await supabase.functions.invoke("npc-service", {
          body: { action: "buy", npc_id: npc.id, service_key: matches[0].key },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        setMessages((mm) => [...mm, localSys(`✦ You hand ${matches[0].price_gold}g to ${npc.name}. ${data.note}`)]);
        reloadProfile();
      } catch (e) { toast.error(e instanceof Error ? e.message : "The deal does not take."); }
      setQuestsOpen(true);
    } else if (c === "buy") {
      // Buy an item from an NPC against a verbal offer they've made you.
      const m1 = args.match(/^(\S+)(?:\s+(.+))?$/);
      if (!m1) { setMessages((m) => [...m, localSys('Try: buy <npc> [item]. Example: "buy trik longsword".')]); return; }
      const [, target, itemArg] = m1;
      const t = target.toLowerCase();
      const npc = npcs.find((n) => {
        const nm = n.name.toLowerCase();
        return nm === t || nm.startsWith(t) || nm.split(/\s+/).some(w => w.startsWith(t)) || nm.includes(t);
      });
      if (!npc) { setMessages((m) => [...m, localSys(`No one called "${target}" is here.`)]); return; }
      const { data: offers } = await supabase.from("npc_item_offers" as any)
        .select("item_key, price_gold, expires_at")
        .eq("npc_id", npc.id).eq("user_id", profile.id)
        .is("used_at", null).gt("expires_at", new Date().toISOString());
      const liveOffers = (offers ?? []) as any[];
      if (liveOffers.length === 0) { setMessages((m) => [...m, localSys(`${npc.name} hasn't agreed a price with you on any item. Talk it through first.`)]); return; }
      const { data: itemRows } = await supabase.from("items")
        .select("key,name").in("key", liveOffers.map(o => o.item_key));
      const itemNameMap = new Map<string, string>((itemRows ?? []).map((r: any) => [r.key, r.name]));
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      let chosen = liveOffers;
      if (itemArg) {
        const needle = norm(itemArg);
        chosen = liveOffers.filter(o => norm(o.item_key).includes(needle) || norm(itemNameMap.get(o.item_key) ?? "").includes(needle));
      }
      if (chosen.length === 0) { setMessages((m) => [...m, localSys(`No standing offer from ${npc.name} matches "${itemArg}". Their offers: ${liveOffers.map(o => itemNameMap.get(o.item_key) ?? o.item_key).join(" / ")}.`)]); return; }
      if (chosen.length > 1) { setMessages((m) => [...m, localSys(`Be specific — ${npc.name} has offered you: ${chosen.map(o => `${itemNameMap.get(o.item_key) ?? o.item_key} (${o.price_gold}g)`).join(" / ")}.`)]); return; }
      try {
        const { data, error } = await supabase.functions.invoke("npc-service", {
          body: { action: "buy_item", npc_id: npc.id, item_key: chosen[0].item_key },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        setMessages((mm) => [...mm, localSys(`✦ ${data.note}`)]);
        reloadProfile();
      } catch (e) { toast.error(e instanceof Error ? e.message : "The deal does not take."); }
    } else if (c === "accept" || c === "decline" || c === "abandon") {
      const wantStatus = c === "abandon" ? "active" : "offered";
      const { data: allMatches } = await supabase.from("quests")
        .select("id, title, status")
        .eq("user_id", profile.id)
        .eq("status", wantStatus);
      const pool = allMatches ?? [];
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const needle = norm(args ?? "");
      // If only one quest is in the requested state, ignore args and act on it.
      let matches = pool.length === 1 ? pool : pool.filter(q => needle && norm(q.title).includes(needle));
      if (matches.length === 0) {
        if (!args) { setMessages((m) => [...m, localSys(`${c} which quest? Try "quests" to see your offers.`)]); return; }
        setMessages((m) => [...m, localSys(`No ${wantStatus} quest matches "${args}". You have: ${pool.map(q => q.title).join(" / ") || "none"}.`)]); return;
      }
      if (matches.length > 1) {
        setMessages((m) => [...m, localSys(`Be more specific — could be: ${matches.map(q => q.title).join(" / ")}.`)]); return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("quest-action", {
          body: { quest_id: matches[0].id, action: c },
        });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        setMessages((m) => [...m, localSys(`✦ Quest ${c}ed: ${matches[0].title}`)]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
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
    } else if (c === "rest" || c === "sleep" || c === "inn") {
      try {
        const { data, error } = await supabase.functions.invoke("rest-action", { body: { action: "inn" } });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        toast.success(`Rested at the inn. (+${data.healed} HP, -${data.cost}g)`);
        reloadProfile();
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "camp" || c === "bivouac") {
      try {
        const { data, error } = await supabase.functions.invoke("rest-action", { body: { action: "camp" } });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        if (data.ambushed) toast.error(`Ambushed mid-rest by ${data.npc_name}!`);
        else toast.success(`Camped safely. (+${data.healed} HP)`);
        reloadProfile();
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "search" || c === "look around" || c === "scour" || c === "rummage") {
      // Forcibly hunt for a hidden cache in the current room.
      try {
        const { data, error } = await supabase.functions.invoke("search-cache");
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        if (data?.found) {
          toast.success(`Rolled ${data.roll}/${data.dc} — you uncover something! Use TAKE.`);
          setCacheClaimed(true);
        } else if (data?.already) {
          setMessages((m) => [...m, localSys("You've already picked this place clean.")]);
        } else if (data?.none) {
          setMessages((m) => [...m, localSys("Nothing here rewards your searching.")]);
        } else if (data?.roll !== undefined) {
          toast.message(`Rolled ${data.roll}/${data.dc} — nothing this time.`);
        }
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "take" || c === "get" || c === "loot" || c === "grab") {
      // `take` (or `take all`) — claim everything in this room's loot pile.
      try {
        const { data, error } = await supabase.functions.invoke("take-loot", { body: {} });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        if (!data?.taken) {
          setMessages((m) => [...m, localSys("There is nothing here to take.")]);
        } else {
          toast.success(`+${data.gold ?? 0}g${data.items?.length ? ` · ${data.items.map((i: any) => i.item_key).join(", ")}` : ""}`);
          reloadProfile(); reloadInventory();
        }
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "steal" || c === "pickpocket") {
      if (!args) { setMessages((m) => [...m, localSys("Steal from whom?")]); return; }
      const target = args.replace(/^from\s+/i, "").toLowerCase().trim();
      const mark = npcs.find(n => n.name.toLowerCase().includes(target));
      if (!mark) { setMessages((m) => [...m, localSys(`No "${target}" here to lift from.`)]); return; }
      try {
        const { data, error } = await supabase.functions.invoke("steal-from-npc", { body: { npc_id: mark.id } });
        if (error || data?.error) throw new Error(data?.error ?? error?.message);
        if (data?.success) {
          toast.success(data.gold ? `+${data.gold}g (rolled ${data.roll}/${data.dc})` : `Got nothing — empty purse.`);
          reloadProfile();
        } else {
          toast.error(`Caught! (rolled ${data.roll}/${data.dc})`);
        }
      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    } else if (c === "fence") {
      const fence = npcs.find(n => n.is_fence);
      if (!fence) { setMessages((m) => [...m, localSys("No fence here. Find one in a back-room of certain town inns.")]); return; }
      try {
        if (!args || args.toLowerCase() === "list") {
          const { data, error } = await supabase.functions.invoke("fence-item", { body: { action: "list", fence_id: fence.id } });
          if (error || data?.error) throw new Error(data?.error ?? error?.message);
          const items = (data?.items ?? []) as any[];
          if (!items.length) { setMessages((m) => [...m, localSys(`*${fence.name} looks at your empty hands and shrugs.* "Bring me something that isn't yours."`)]); return; }
          const lines = items.map((it) => `  • ${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ""} — ${it.fence_total}g  (${it.fence_each}g/ea, full ${it.full_value}g)`);
          setMessages((m) => [...m, localSys(`*${fence.name} eyes your goods at ${Math.round((data.fence.rate ?? 0.55) * 100)}% of value:*\n${lines.join("\n")}\n\nUse: fence sell <item name>`)]);
        } else if (args.toLowerCase().startsWith("sell ")) {
          const want = args.slice(5).toLowerCase().trim();
          const { data: list } = await supabase.functions.invoke("fence-item", { body: { action: "list", fence_id: fence.id } });
          const target = (list?.items ?? []).find((it: any) => it.name.toLowerCase().includes(want));
          if (!target) { setMessages((m) => [...m, localSys(`No stolen "${want}" on you.`)]); return; }
          const { data, error } = await supabase.functions.invoke("fence-item", { body: { action: "sell", fence_id: fence.id, player_item_id: target.player_item_id } });
          if (error || data?.error) throw new Error(data?.error ?? error?.message);
          toast.success(`+${data.gold}g`);
          reloadProfile(); reloadInventory();
        }
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

  const combatBusyRef = useRef(false);
  const combatAct = async (kind: string, args: Record<string, unknown> = {}) => {
    if (combatBusyRef.current) return;
    combatBusyRef.current = true;
    try {
      if (kind === "trace_lesser") {
        // Open the rune hub for live tracing; start a 10s timer that
        // triggers an "interrupt" if the player doesn't submit in time.
        setTracerOpen(true);
        toast.warning("Trace a lesser rune within 10s — or your foe will strike!");
        const timer = window.setTimeout(async () => {
          await supabase.functions.invoke("combat-action", { body: { action: "interrupt" } });
          toast.error("Your hand faltered — the foe struck!");
        }, 10_000);
        // Cancel the timer the moment a cast lands (any combat_action insert)
        const ch = supabase.channel(`trace-timer:${profile!.id}:${Date.now()}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "combat_actions" },
            () => { window.clearTimeout(timer); supabase.removeChannel(ch); })
          .subscribe();
        return;
      }
      const { data, error } = await supabase.functions.invoke("combat-action", { body: { action: kind, ...args } });
      if (error || data?.error) {
        const msg = data?.error ?? error?.message ?? "no";
        if (!/not your turn/i.test(msg)) throw new Error(msg);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
    finally { combatBusyRef.current = false; }
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

  // ===== Permadeath screen =====
  if (profile.dead) {
    // (Dead is a render-only branch; no hooks here.)
    return (
      <div className="min-h-screen bg-black text-red-100 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-7xl">⚰</div>
        <h1 className="text-3xl tracking-widest text-red-300">YOU ARE DEAD</h1>
        <p className="max-w-md text-red-200/80">
          Your corpse lies in <strong className="text-red-300">{profile.death_room ?? "an unmarked place"}</strong>.
          Only a friend who knows the Blessing of <strong>💀 Necros</strong> can call you back — and you will return <em className="text-red-400">zombified</em>.
        </p>
        <p className="text-xs text-red-200/50 max-w-md">
          (You cannot act. Wait for another player to find your corpse and revive you. This window will refresh when you return.)
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" className="border-red-800 text-red-200 hover:bg-red-950" onClick={() => reloadProfile()}>
            Listen for the call
          </Button>
          <Button
            variant="outline"
            className="border-ember/60 text-ember hover:bg-ember/10"
            onClick={async () => {
              try {
                const { data, error } = await supabase.functions.invoke("restart-character", { body: {} });
                if (error || data?.error) throw new Error(data?.error ?? error?.message);
                toast.success("The wind takes your old name. A new road waits.");
                window.location.reload();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "The wind refuses.");
              }
            }}
          >
            Begin a new adventure
          </Button>
        </div>
        <p className="text-[10px] text-red-200/40 max-w-md">
          Walking away surrenders this corpse forever. A new walker rises at the dunes' edge.
        </p>
      </div>
    );
  }

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
            {hudPortrait ? (
              <img src={hudPortrait} alt={profile.username}
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
          <button
            onClick={() => setSkillsOpen(true)}
            className={`relative flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors ${
              (profile.talent_points ?? 0) > 0
                ? "border-amber-400/70 text-amber-200 hover:bg-amber-950/30 animate-pulse"
                : "border-border text-whisper hover:text-ember hover:border-ember"
            }`}
            title="The Long Path — your talents"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">talents</span>
            {(profile.talent_points ?? 0) > 0 && (
              <span className="ml-0.5 px-1 rounded bg-amber-500/30 text-amber-100 text-[10px]">
                +{profile.talent_points}
              </span>
            )}
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
          <button onClick={() => setQuestsOpen(true)}
            className="relative flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs"
            title="Quests">
            <ScrollText className="w-4 h-4" />
            <span className="hidden sm:inline">quests</span>
            <span className="font-mono text-[10px] text-ash">{activeQuestCount}</span>
            {offeredQuestCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-ember animate-pulse" />
            )}
          </button>
          {room?.town_key && (
            <button onClick={() => setBoardOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs" title="Town board — quests, bounties, bank">
              <Landmark className="w-4 h-4" /><span className="hidden sm:inline">board</span>
            </button>
          )}
          <button onClick={() => setKinOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs" title="Kin spirits — friends & private messages">
            <Users className="w-4 h-4" /><span className="hidden sm:inline">kin</span>
          </button>
          {/* Speaker's Artifacts hidden — discovered through lore/rumor only */}
          <button
            onClick={() => { setMusicMuted(!musicMuted); resumeMusic(); }}
            className="flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs ml-auto"
            title={musicMuted ? "Unmute scene music" : "Mute scene music"}
          >
            {musicMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setHelpOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded border border-border text-whisper hover:text-ember hover:border-ember transition-colors text-xs" title="Commands">
            <HelpCircle className="w-4 h-4" /><span className="hidden sm:inline">help</span>
          </button>
        </div>
      </header>


      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Main log */}
        <main className="flex-1 flex flex-col min-w-0">
          <div ref={logRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-6 space-y-3 font-body text-[17px] leading-relaxed">
            <RoomBlock room={room} npcs={npcs} dragons={dragons} sceneUrl={sceneUrl} sceneLoading={sceneLoading} events={roomEvents} bucket={bucket} />
            {corpses.length > 0 && (
              <div className="border border-red-900/50 bg-red-950/20 px-3 py-2 mb-3 text-sm">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-400 mb-1">⚰ Corpses here</div>
                {corpses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="text-red-200">{c.username}</span>
                    <button
                      onClick={() => reviveCorpse(c.id, c.username)}
                      disabled={reviving}
                      className="text-xs px-2 py-0.5 rounded border border-red-800 text-red-200 hover:bg-red-900/40 disabled:opacity-50"
                      title="Costs 50g + the Blessing of 💀 Necros. They return zombified."
                    >💀 Revive (50g)</button>
                  </div>
                ))}
              </div>
            )}
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

          {/* Inline exits bar (especially valuable on mobile where the sidebar is below the fold) */}
          {room && (
            <div className="md:hidden border-t border-border bg-card/60 px-3 py-2 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ash mr-1">Exits</span>
              {Object.keys(room.exits).length === 0 ? (
                <span className="text-ash italic text-xs">none</span>
              ) : (
                Object.entries(room.exits).map(([dir]) => (
                  <button key={dir} onClick={() => handleCommand(`go ${dir}`)}
                    className="font-mono text-[11px] px-2 py-1 border border-border hover:border-ember hover:text-ember transition-colors uppercase">
                    {dir}
                  </button>
                ))
              )}
            </div>
          )}

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
          <div className="hidden md:block">
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

          {(wagonRoutes.length > 0 || roomLoot.length > 0) && (
            <div className="flex flex-col gap-1.5">
              {wagonRoutes.length > 0 && (
                <button onClick={() => setWagonOpen(true)}
                  className="w-full text-left font-mono text-[11px] px-2 py-1.5 border border-border hover:border-ember hover:text-ember transition-colors uppercase tracking-widest text-parchment">
                  ⛟ Hire Wagon
                </button>
              )}
              {roomLoot.length > 0 && (
                <button onClick={() => handleCommand("take")}
                  className="w-full text-left font-mono text-[11px] px-2 py-1.5 border border-ember/60 bg-ember/10 hover:bg-ember/20 transition-colors uppercase tracking-widest text-ember">
                  ✦ Take Loot ({roomLoot.reduce((s, l) => s + (l.gold ?? 0), 0)}g{roomLoot.some(l => l.item_key) ? " + items" : ""})
                </button>
              )}
            </div>
          )}

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
                  <div key={n.id} className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        if (n.is_merchant) { setMarketMerchant(n.id); }
                        else if (n.is_guildmaster) { setGuildmaster(n.id); }
                        else { setInput(`ask ${n.name.split(" ")[0]} `); inputRef.current?.focus(); }
                      }}
                      className="flex-1 text-left font-body text-parchment hover:text-ember transition-colors">
                      <span className={n.is_fence ? "text-whisper" : n.is_merchant ? "text-ember" : n.is_guildmaster ? "text-accent" : "text-accent"}>
                        {n.is_fence ? "✥" : n.is_merchant ? "⚖" : n.is_guildmaster ? (n.guild_key === "warriors" ? "⚔" : n.guild_key === "traders" ? "⚖" : "✶") : "●"}
                      </span> {n.name}
                      {n.title && <span className="text-ash italic"> — {n.title}</span>}
                      {word && <span className={`text-[10px] italic ml-1 ${tone}`}> ({word})</span>}
                      {n.is_merchant && <span className="text-[10px] text-ember/70 ml-1">[trade]</span>}
                      {n.is_fence && <span className="text-[10px] text-whisper/80 ml-1">[fence]</span>}
                      {n.is_guildmaster && !n.is_fence && <span className="text-[10px] text-accent/70 ml-1">[guild]</span>}
                    </button>
                  </div>
                );
              })}
              {/* You */}
              <div className="flex items-center gap-2 font-body text-moss">
                {profile.portrait_url
                  ? <img src={profile.portrait_url} alt="" className="w-6 h-6 object-cover border border-border" />
                  : <span>◆</span>}
                <span>{profile.username}</span>
                <span className="text-ash text-[10px]">(you · lv {profile.level})</span>
              </div>
              {/* Other walkers — DB-backed, with online dot from realtime presence */}
              {roommates.map((r) => {
                const online = presence.some(p => p.username === r.username);
                const stateColor = r.dead ? "text-red-500" : r.downed ? "text-amber-500" : "text-moss";
                return (
                  <button
                    key={r.id}
                    onClick={() => { setInput(`say `); inputRef.current?.focus(); }}
                    className="w-full flex items-center gap-2 font-body text-left hover:bg-background/40 px-1 py-0.5 transition-colors"
                    title={`${r.username} — level ${r.level}${r.aether ? ` · ${r.aether}` : ""}${r.faction === "chaos" ? " · chaos" : ""}`}
                  >
                    {r.portrait_url
                      ? <img src={r.portrait_url} alt="" className={`w-6 h-6 object-cover border ${online ? "border-ember" : "border-border opacity-60"}`} />
                      : <span className={stateColor}>◆</span>}
                    <span className={stateColor}>{r.username}</span>
                    <span className="text-ash text-[10px]">lv {r.level}{r.aether ? ` · ${r.aether}` : ""}{r.dead ? " · fallen" : r.downed ? " · downed" : ""}</span>
                    <span className={`ml-auto text-[10px] ${online ? "text-ember" : "text-ash/50"}`}>{online ? "●" : "○"}</span>
                  </button>
                );
              })}
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
      <DeathSaveModal
        open={!!profile.downed && !profile.dead}
        onResolved={(saved) => { reloadProfile(); if (saved) toast.success("You drag yourself out of the dark."); else toast.error("The dark wins. You are dead."); }}
      />
      {questsOpen && (
        <QuestsPanel userId={profile.id} onClose={() => setQuestsOpen(false)} onChanged={() => { reloadProfile(); reloadQuestCounts(); }} />
      )}
      {kinOpen && <KinPanel userId={profile.id} onClose={() => setKinOpen(false)} />}
      <BoardModal open={boardOpen} onClose={() => setBoardOpen(false)} userId={profile.id} onProfileChange={() => reloadProfile()} />
      <MarketModal open={!!marketMerchant} merchantId={marketMerchant} onClose={() => setMarketMerchant(null)} onChanged={() => { reloadProfile(); reloadInventory(); }} />
      <GuildModal open={!!guildmaster} guildmasterId={guildmaster} onClose={() => setGuildmaster(null)} onChanged={() => { reloadProfile(); reloadInventory(); reloadRunes(); reloadQuestCounts(); }} />
      <ArtifactsPanel open={artifactsOpen} onClose={() => setArtifactsOpen(false)} onChanged={() => { reloadProfile(); }} />
      <SkillTreeModal open={skillsOpen} onClose={() => setSkillsOpen(false)} userId={profile.id} talentPoints={profile.talent_points ?? 0} onChanged={reloadProfile} />
      <CharacterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} profile={profile} inventory={inventory} onPortraitUpdated={(url) => setProfile((p: any) => p ? { ...p, portrait_url: url } : p)} onRestarted={() => window.location.reload()} onRenamed={(name) => setProfile((p: any) => p ? { ...p, username: name } : p)} />
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
      <Dialog open={wagonOpen} onOpenChange={setWagonOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Wagonmaster</DialogTitle>
            <DialogDescription>The driver tips a wide hat. "Where to, traveler? You can only ride to a place you've already trodden."</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5">
            {wagonRoutes.map((r) => {
              const canAfford = profile.gold >= r.cost_gold;
              const ok = r.visited && canAfford;
              return (
                <li key={r.destination}>
                  <button
                    disabled={!ok}
                    onClick={async () => {
                      try {
                        const { data, error } = await supabase.functions.invoke("wagon-travel", { body: { destination: r.destination } });
                        if (error || data?.error) throw new Error(data?.error ?? error?.message);
                        setWagonOpen(false);
                        toast.success(`Wagon away — ${r.cost_gold}g`);
                        reloadProfile();
                      } catch (e) { toast.error(e instanceof Error ? e.message : "no"); }
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 border border-border hover:border-ember disabled:opacity-40 disabled:cursor-not-allowed text-left">
                    <span className="font-body text-parchment">{r.name}</span>
                    <span className="font-mono text-xs text-ash">
                      {!r.visited ? "unvisited" : !canAfford ? `${r.cost_gold}g (short)` : `${r.cost_gold}g`}
                    </span>
                  </button>
                </li>
              );
            })}
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

function RoomBlock({ room, npcs, dragons, sceneUrl, sceneLoading, events, bucket }: {
  room: Room; npcs: Npc[]; dragons: { name: string; epithet: string; personality: string }[];
  sceneUrl: string | null; sceneLoading: boolean;
  events: { kind: string; actor_name: string; target_name: string | null; details: any; created_at: string }[];
  bucket: TimeBucket;
}) {
  const tint = pickTimeTint(bucket, (room.kind ?? "room") as string);
  return (
    <div className="border-l-2 border-ember/60 pl-4 py-1 mb-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ash mb-1 flex items-center gap-3">
        <span>{room.label ?? "Place"}</span>
        <span className="text-whisper">·</span>
        <span className="text-whisper normal-case tracking-normal italic">{TIME_LABEL[bucket]}</span>
      </div>
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
      {tint && <p className="text-whisper italic mt-2">{tint}</p>}
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

function ShadowWhisper({ content }: { content: string }) {
  const [acted, setActed] = useState(false);
  const act = (kind: "submit" | "resist") => {
    if (acted) return;
    setActed(true);
    window.dispatchEvent(new CustomEvent("shadow-act", { detail: kind }));
  };
  return (
    <div className="border-l-2 border-whisper/40 pl-3 my-1">
      <div className="font-mono text-[10px] text-ash uppercase tracking-[0.3em]">— a whisper from the unspoken —</div>
      <p className="text-whisper italic lowercase tracking-wide">{content}</p>
      {!acted && (
        <div className="mt-1 flex gap-2 font-mono text-[10px]">
          <button onClick={() => act("submit")}
            className="text-ember/80 hover:text-ember underline underline-offset-2">listen</button>
          <button onClick={() => act("resist")}
            className="text-moss hover:text-parchment underline underline-offset-2">speak against it</button>
        </div>
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
  if (m.kind === "ambient") {
    return <div className="text-whisper italic text-sm">{m.content}</div>;
  }
  if (m.kind === "shadow") {
    return <ShadowWhisper content={m.content} />;
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

function formatRoom(room: Room, npcs: Npc[], events: { kind: string; actor_name: string; target_name: string | null; details: any }[] = [], bucket: TimeBucket = getTimeBucket()) {
  const lines = [`${(room.label ?? "Place").toUpperCase()} — ${room.name.toUpperCase()}  [${TIME_LABEL[bucket]}]`, "", room.description];
  const tint = pickTimeTint(bucket, (room.kind ?? "room") as string);
  if (tint) lines.push("", tint);
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

// ─────────────────────────────────────────────────────────────────
// Living scene ambience — sensory flavor lines keyed by room kind.
// Local-only; the world feels alive without spamming the database.
// ─────────────────────────────────────────────────────────────────
const AMBIENCE_BY_KIND: Record<string, string[]> = {
  market: [
    "a copper bell over a stall clinks as someone elbows past",
    "the smell of cumin and singed hair drifts through the lane",
    "a child slips a fig from a vendor's basket and is gone",
    "two cats yowl over a fishhead in the gutter",
    "somewhere a hammer falls — once, twice, then nothing",
  ],
  square: [
    "a flock of grey pigeons lifts at once and resettles",
    "a beggar coughs into the hem of his cloak",
    "the fountain swallows a tossed coin without sound",
    "an old woman is feeding crusts to a one-legged dove",
    "wind drags a torn proclamation along the flagstones",
  ],
  tavern: [
    "a stool scrapes; someone laughs too loud and stops short",
    "the fire spits a green spark that no one comments on",
    "a wet rag slaps the bar; mugs rearrange themselves",
    "a fly is drowning slowly in someone's abandoned ale",
    "the door creaks open — only the wind comes in",
  ],
  hall: [
    "a candle gutters and a shadow leans across the wall",
    "somewhere above, a long bell tolls a single note",
    "dust falls in a slow rope of light from the high windows",
    "a guard shifts his weight; mail whispers against stone",
  ],
  gate: [
    "a horsefly hums in slow circles around the post",
    "a banner snaps once in a gust and slumps again",
    "a guard hawks and spits into the dust",
    "wagon-wheels grind somewhere out beyond the wall",
  ],
  road: [
    "a beetle the size of a thumbnail scurries across a wagon-rut",
    "wind moves through the long grass like a sigh",
    "a single crow watches you from a leaning post",
    "the dust settles, then lifts again",
    "somewhere far off, a dog is barking and barking",
  ],
  shore: [
    "a wave comes in, paws at the stones, and recedes",
    "a gull screams once and is answered by another, closer",
    "a small crab sidles out of a half-buried boot",
    "salt crusts on the rope coiled by the dock",
  ],
  grove: [
    "a thrush trills three notes from somewhere above",
    "a leaf detaches itself and spirals down without hurry",
    "a fat bee blunders past your ear",
    "something small moves through the undergrowth — a hare, perhaps",
    "the wind in the high branches sounds like distant water",
  ],
  garden: [
    "a bee staggers drunk from a foxglove",
    "a butterfly opens and closes its wings on a sun-warm stone",
    "somewhere unseen, water is dripping into water",
    "a cat noses through the rosemary and is gone",
  ],
  wilds: [
    "a twig snaps somewhere behind you; nothing follows",
    "a hawk's shadow crosses the ground and is gone",
    "burrs catch on your hem with small, dry sounds",
    "the wind changes direction without explanation",
  ],
  desert: [
    "the sand whispers along the dune crest",
    "a black beetle scurries across a half-buried corpse",
    "a thermal lifts somewhere — three vultures wheeling",
    "the wind takes a handful of grit and flings it sideways",
    "a lizard freezes on a rock and watches you with one eye",
  ],
  cave: [
    "water drips, three beats apart, somewhere deeper in",
    "a pebble dislodges and rolls a long way before silence",
    "your breath comes back to you off the stone",
    "something pale skitters into a crack and is gone",
  ],
  ruin: [
    "a chunk of mortar sighs loose and clatters down the wall",
    "ivy creaks against stone in a slow, patient grip",
    "a rat regards you from atop a fallen capital",
    "the wind moves through an empty window and makes a low note",
  ],
  crypt: [
    "the air is colder by one breath than it was a moment ago",
    "dust shifts in a corner where no draft should reach",
    "a scarab the colour of old gold creeps along a sarcophagus seam",
    "you hear, very faintly, what could be weeping or could be wind",
  ],
  tower: [
    "the wind bullies the shutters and lets them go",
    "a pigeon flusters in the rafters and resettles",
    "below, a door closes that no one was near",
  ],
  temple: [
    "incense thickens the air; your eyes water briefly",
    "a brass bowl rings, untouched, and goes still",
    "somewhere out of sight, slow footsteps cross stone and stop",
  ],
  bridge: [
    "the boards creak underfoot in a rhythm not your own",
    "below, the water drags something dark and slow past",
    "a fishhawk drops, takes nothing, and climbs again",
  ],
  dock: [
    "a rope groans against a bollard as the tide shifts",
    "a fishhead rolls off the planks and is taken in a small splash",
    "gulls bicker over something pink at the waterline",
  ],
  camp: [
    "a fire pops and someone, unseen, swears softly",
    "a horse blows out, stamps once, settles",
    "the smell of burnt onions drifts past",
  ],
  hollow: [
    "wind moves in the high reeds with a dry, ticking sound",
    "a frog calls once, decides better, falls silent",
    "midges rise in a thin column over standing water",
  ],
  clearing: [
    "a finch lands on a low branch and tilts its head at you",
    "sunlight shifts as a cloud passes, and shifts back",
    "something shakes the long grass at the edge — and is still",
  ],
  loft: [
    "a beam settles with a long, considered creak",
    "moths blunder against the lantern and fall away",
  ],
  room: [
    "a draft moves through; the lamp-flame leans, then straightens",
    "somewhere in the building, a door closes",
    "a moth circles the light in slow, patient orbits",
  ],
};

// Indoor vs outdoor classification — drives both the AI prompt context and
// the local fallback flavor pool. Roofed/enclosed places must not reference
// open sky, wind across distance, etc.; open places must not reference doors
// or rafters.
const INDOOR_KINDS = new Set(["tavern", "hall", "cave", "crypt", "tower", "temple", "loft", "room"]);
function isIndoor(kind: string): boolean { return INDOOR_KINDS.has(kind); }

// NPC-aware flavor: occasionally weave a present NPC into the line.
const NPC_FLAVOR_INDOOR: ((name: string) => string)[] = [
  (n) => `${n} mutters something to themselves and falls quiet`,
  (n) => `${n} glances toward the door, then back`,
  (n) => `${n} cracks a knuckle, slowly, one finger at a time`,
  (n) => `${n} scratches at an old stain on their sleeve`,
  (n) => `${n} catches your eye for a beat, then looks away`,
  (n) => `${n} hums two bars of a song you almost know`,
  (n) => `${n} leans closer to the lamp to see what they're working on`,
];
const NPC_FLAVOR_OUTDOOR: ((name: string) => string)[] = [
  (n) => `${n} squints up the road for a moment, then looks back down`,
  (n) => `${n} cracks a knuckle, slowly, one finger at a time`,
  (n) => `${n} scratches at an old stain on their sleeve`,
  (n) => `${n} catches your eye for a beat, then looks away`,
  (n) => `${n} hums two bars of a song you almost know`,
  (n) => `${n} shades their eyes against the light and watches something far off`,
  (n) => `${n} kicks a stone idly into the dust`,
  (n) => `${n} pulls their cloak tighter against the wind`,
];

function pickAmbience(kind: string, npcNames: string[]): string | null {
  const pool = AMBIENCE_BY_KIND[kind] ?? AMBIENCE_BY_KIND.room;
  // 1-in-3 chance: if NPCs are present, attribute a small bit of business to one of them.
  if (npcNames.length && Math.random() < 0.34) {
    const who = npcNames[Math.floor(Math.random() * npcNames.length)];
    const flavorPool = isIndoor(kind) ? NPC_FLAVOR_INDOOR : NPC_FLAVOR_OUTDOOR;
    const fn = flavorPool[Math.floor(Math.random() * flavorPool.length)];
    return fn(who);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─────────────────────────────────────────────────────────────────
// Time-of-day cycle. Real-world UTC hour drives a six-bucket day,
// and each room kind gets its own atmospheric tint per bucket so
// the same place reads differently at dawn vs deep night.
// ─────────────────────────────────────────────────────────────────

const TIME_LABEL: Record<TimeBucket, string> = {
  deepnight: "the small hours",
  dawn: "first light",
  morning: "late morning",
  midday: "the long afternoon",
  dusk: "dusk",
  night: "deep night",
};

const TIME_TRANSITIONS: Record<TimeBucket, string> = {
  deepnight: "The deep hours settle",
  dawn: "First grey light creeps in",
  morning: "Morning brightens",
  midday: "The sun climbs over the rooftops",
  dusk: "The light goes amber and starts to fail",
  night: "Night closes",
};

// Per (kind × bucket) tints. Falls back to GENERIC_TIME_TINTS by bucket if a
// kind has no entry. Each entry is one short sensory line in the same voice
// as the AMBIENCE pool. We pick at random per render.
const TIME_TINTS_BY_KIND: Partial<Record<string, Partial<Record<TimeBucket, string[]>>>> = {
  market: {
    dawn: ["awnings are still being cranked open and the cobbles are dark with night-water"],
    morning: ["the lanes are at full clamor; coin and copper sing on every counter"],
    midday: ["the heat slows everyone; merchants fan themselves under striped cloth"],
    dusk: ["stalls are coming down; lamps are being lit one by one along the row"],
    night: ["only the late stalls keep going by lantern; a watchman drifts past"],
    deepnight: ["the lane is empty save for swept-up rinds and a single guttering lamp"],
  },
  square: {
    dawn: ["pigeons are still asleep on the cornices; the fountain steams faintly"],
    morning: ["the bells have just rung; the square fills with errands and gossip"],
    midday: ["heat lies heavy on the flagstones; figures keep to the colonnades"],
    dusk: ["lamplighters work the perimeter; the fountain blackens with shadow"],
    night: ["the fountain murmurs to itself; lanterns burn low at the corners"],
    deepnight: ["the square is given over to wind and a single, distant watch-bell"],
  },
  tavern: {
    dawn: ["chairs are stacked on tables; someone is sluicing the floor"],
    morning: ["the kitchen-fire is being woken; a smell of yeast and bacon"],
    midday: ["a quiet noon trade — a few drinkers, the hum of low talk"],
    dusk: ["the room is filling fast; the first songs are being negotiated"],
    night: ["smoke and laughter and the occasional crash of a stool going over"],
    deepnight: ["only the hard cases left now, hunched and slow over their cups"],
  },
  hall: {
    dawn: ["torches are guttering in their brackets, untrimmed since the night-watch"],
    morning: ["light cuts in through the high windows in long pale bars"],
    midday: ["the stone holds its cool; voices echo a long way down the nave"],
    dusk: ["the high windows go red, then violet; sconces are being lit below"],
    night: ["the hall is held only by torchlight; the corners are deep with dark"],
    deepnight: ["the hall is silent except for one watchman's footsteps, far off"],
  },
  gate: {
    dawn: ["the bar is being lifted; the first carts are queueing in the grey"],
    morning: ["the gate is full open; trade flows in both directions"],
    midday: ["the guards are slow with heat; flies orbit the gate-house lamp"],
    dusk: ["the last carts are being waved through before the bar comes down"],
    night: ["the gate is barred; a single lantern burns above the wicket"],
    deepnight: ["the gate is shut and the watch is doubled, breath steaming"],
  },
  road: {
    dawn: ["dew silvers the wagon-ruts; nothing else is moving"],
    morning: ["the road is busy with the day's first traffic"],
    midday: ["the heat lays a shimmer along the road ahead"],
    dusk: ["long shadows stripe the road; the air goes cool and blue"],
    night: ["the road is dark; only your own footfall keeps you company"],
    deepnight: ["nothing moves but the wind and the cold weight of stars"],
  },
  shore: {
    dawn: ["the sea is the colour of slate; gulls are just stirring on the wrack"],
    morning: ["sunlight catches each wave-crest in cold white"],
    midday: ["the tide is far out; the flats steam under the sun"],
    dusk: ["the sea takes the light and gives back fire on every wave"],
    night: ["the sea is black and patient; phosphor flickers in the wash"],
    deepnight: ["the sea is invisible; only its long, dragging breath is left"],
  },
  grove: {
    dawn: ["mist threads the trunks and the first bird is trying its voice"],
    morning: ["light filters down green through the canopy"],
    midday: ["the leaves go still; insects hum in the warm hush"],
    dusk: ["the grove darkens fast; one owl, somewhere, is starting up"],
    night: ["the trees are great black shapes; something moves among them"],
    deepnight: ["nothing moves at all; the grove holds its breath"],
  },
  garden: {
    dawn: ["dew weighs every petal; no bee is yet awake"],
    morning: ["the borders are loud with bees and the smell of warming earth"],
    midday: ["the flowers are wide open and almost too bright"],
    dusk: ["moths are coming out as the colors drain to blues and greys"],
    night: ["pale blooms catch what light there is; everything else goes black"],
    deepnight: ["the garden is silver and silent under the moon"],
  },
  wilds: {
    dawn: ["a cold mist hangs in every hollow; the world is grey and waiting"],
    morning: ["the heath warms; small things rustle in the low cover"],
    midday: ["the light is bleached and merciless across the open ground"],
    dusk: ["long shadows pool in every dip; an owl tries the air"],
    night: ["the wilds are pitch and full of small, patient noises"],
    deepnight: ["nothing for miles but wind and your own breath, and the dark"],
  },
  desert: {
    dawn: ["the dunes go from black to bone in a single slow wash of light"],
    morning: ["the sand is already hot enough to sting through a sandal"],
    midday: ["the sun is a hammer; the air shakes above the sand"],
    dusk: ["the dunes turn copper, then violet; the heat finally breaks"],
    night: ["the desert goes brutally cold; the stars are unbearably close"],
    deepnight: ["nothing moves; the cold and the silence are absolute"],
  },
  cave: {
    dawn: ["a thin grey trickle of light reaches the mouth and dies"],
    morning: ["pale light gropes a few feet inside, then gives up"],
    midday: ["the mouth glows bright, but the dark beyond is unchanged"],
    dusk: ["the mouth bleeds red light onto the first few feet of stone"],
    night: ["the dark from outside meets the dark inside without any seam"],
    deepnight: ["the cave is the same as it always is; only you can tell time"],
  },
  ruin: {
    dawn: ["dew runs down every broken column; nothing has stirred in the rubble"],
    morning: ["light picks out the carvings the night had hidden"],
    midday: ["the stone is hot; lizards bask on the fallen capitals"],
    dusk: ["shadows fill the ruin; the broken arches go to silhouette"],
    night: ["the ruin is black on black; only the sky between the walls is paler"],
    deepnight: ["the ruin is deeply, completely still — the dead-of-night kind"],
  },
  crypt: {
    dawn: ["a cold draft moves through, smelling of stone and turned earth"],
    morning: ["nothing changes here; somewhere above, faint birdsong filters"],
    midday: ["the crypt holds the same cold it always does"],
    dusk: ["it feels colder; the lamp-flames lean inward without cause"],
    night: ["the dark seems to thicken and lean in close"],
    deepnight: ["the very air tastes older now; something is awake in the silence"],
  },
  tower: {
    dawn: ["wind pushes mist past the high windows in slow ropes"],
    morning: ["the wind is fresher up here, cold off the open country"],
    midday: ["sunlight floods the floorboards; you can see the dust hanging"],
    dusk: ["the windows fill with red; the wind starts to whine in the slats"],
    night: ["only the lamp keeps the dark out of the room"],
    deepnight: ["the tower creaks in the wind; you are very high and very alone"],
  },
  temple: {
    dawn: ["a single chant has just begun, somewhere out of sight"],
    morning: ["the daily rites are in progress; bells, incense, low voices"],
    midday: ["the temple is hushed; an acolyte sweeps without noise"],
    dusk: ["lamps are being lit at every altar; the air thickens with smoke"],
    night: ["only the night-keeper is here, tending the standing flames"],
    deepnight: ["the temple is empty and the lamps burn very low"],
  },
  bridge: {
    dawn: ["mist hangs in the gorge; the planks are slick with it"],
    morning: ["the river runs bright below; the boards are warming"],
    midday: ["heat shimmers off the stones; the water flashes underneath"],
    dusk: ["the water below goes black; the bridge stands out red against it"],
    night: ["the bridge is invisible until you are on it; the water hisses below"],
    deepnight: ["only the river is awake, somewhere down in the dark"],
  },
  dock: {
    dawn: ["the boats sit still in a milky calm; nothing has cast off yet"],
    morning: ["the docks are full noise — winches, shouts, gulls, water"],
    midday: ["the smell of pitch and fish settles thick in the heat"],
    dusk: ["the last boats are being made fast; lanterns wink on the water"],
    night: ["a single lamp burns on each pier; the boats nod in the dark"],
    deepnight: ["the docks are deserted; only the tide works against the wood"],
  },
  camp: {
    dawn: ["the fire is down to grey ash; someone is coaxing it back"],
    morning: ["the fire is up and the camp is breaking — packs going on backs"],
    midday: ["the camp is quiet; most are out on the day's business"],
    dusk: ["the fire is being built up; people are drifting back to it"],
    night: ["the fire throws orange on every face; the dark stands around it"],
    deepnight: ["only the watchman is awake, feeding the fire one stick at a time"],
  },
  hollow: {
    dawn: ["fog fills the hollow to the brim and is slow to drain"],
    morning: ["the hollow is bright at the rim and dim at the bottom"],
    midday: ["heat pools here and does not move"],
    dusk: ["the hollow goes dark before anywhere else does"],
    night: ["the hollow is full of black water and quieter sounds"],
    deepnight: ["the hollow is the deepest dark in the country, and very still"],
  },
  clearing: {
    dawn: ["dew weighs the long grass; mist rises in pale rags"],
    morning: ["the clearing is bright and full of small wing-noises"],
    midday: ["the sun stands directly over and there is no shadow worth the name"],
    dusk: ["the grass goes gold, then grey; bats begin their first low passes"],
    night: ["moonlight lies across the clearing; the trees stand around in black"],
    deepnight: ["the clearing is silver and still; nothing crosses it"],
  },
  loft: {
    dawn: ["pale light leaks through every gap in the boards"],
    morning: ["dust dances in the bars of light from the gable"],
    midday: ["the loft is roasting under the slate; the air is close"],
    dusk: ["the light goes long and red across the floor before failing"],
    night: ["the loft is dark and the timbers settle around you"],
    deepnight: ["only mice are awake up here, and they pretend not to be"],
  },
  room: {
    dawn: ["grey light is just reaching the floor"],
    morning: ["sunlight has the room and dust hangs in it"],
    midday: ["the room holds the heat; the air is still"],
    dusk: ["the room dims and a lamp is lit somewhere in the building"],
    night: ["only lamplight; the corners are full of soft dark"],
    deepnight: ["the lamp burns low; everything is asleep but you"],
  },
};

const GENERIC_TIME_TINTS: Record<TimeBucket, string[]> = {
  dawn: ["the world is grey and waking; the air is cold off the night"],
  morning: ["the day is well underway and the light is honest"],
  midday: ["the light is full and unkind; shadows huddle at the bases of things"],
  dusk: ["the light goes red and slantways; everything throws a long shadow"],
  night: ["the dark is settled in; lamps are doing the work of the sun now"],
  deepnight: ["it is the dead of night and the world is given over to it"],
};

function pickTimeTint(bucket: TimeBucket, kind: string): string | null {
  const k = TIME_TINTS_BY_KIND[kind]?.[bucket];
  if (k && k.length) return k[Math.floor(Math.random() * k.length)];
  const g = GENERIC_TIME_TINTS[bucket];
  return g[Math.floor(Math.random() * g.length)];
}
