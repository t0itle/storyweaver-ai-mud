// Tab-completion for the command prompt. First token completes against the
// command list; later tokens complete against the souls in the room, so
// `ask ma<Tab>` becomes `ask Maeve `.

export const COMPLETABLE_COMMANDS = [
  "look", "go", "say", "emote", "ask", "examine", "inventory", "runes", "learn",
  "weave", "attack", "join", "defend", "cast", "flee", "lore", "map", "who",
  "follow", "dismiss", "stay", "come", "quests", "accept", "decline", "abandon",
  "riddle", "solve", "search", "take", "steal", "fence", "wagon", "rest", "camp",
  "services", "pay", "buy", "align", "legends", "help",
];

export interface Completion {
  completed: string;   // the full new input value
  candidates: string[]; // all matches (length > 1 means ambiguous)
}

export function completeInput(input: string, npcNames: string[], commands: string[] = COMPLETABLE_COMMANDS): Completion | null {
  if (!input || input.endsWith(" ")) return null;
  const parts = input.split(/\s+/);
  const last = parts[parts.length - 1].toLowerCase();
  if (!last) return null;

  const isFirstToken = parts.length === 1;
  const pool = isFirstToken
    ? commands
    : npcNames.flatMap((n) => {
        const first = n.split(/\s+/)[0];
        return first ? [first] : [];
      });

  const matches = [...new Set(pool.filter((c) => c.toLowerCase().startsWith(last)))];
  if (matches.length === 0) return null;

  // Complete to the shared prefix of all matches; add a trailing space when unique.
  let prefix = matches[0];
  for (const m of matches.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < m.length && prefix[i].toLowerCase() === m[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
  }
  const replacement = matches.length === 1 ? `${matches[0]} ` : prefix;
  const completed = [...parts.slice(0, -1), replacement].join(" ");
  return { completed, candidates: matches };
}
