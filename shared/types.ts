import type { PlayerStyle } from "./cosmetics";

// Shared domain types for Ma Sói Online (server is the single source of truth).

export type Locale = "vi" | "en";
export const LOCALES: Locale[] = ["vi", "en"];

export type RoleId =
  | "werewolf"
  | "villager"
  | "seer"
  | "bodyguard"
  | "witch"
  | "hunter"
  | "cupid"
  // Advanced roles:
  | "cursedWolf"
  | "wolfSeer"
  | "elder"
  | "idiot"
  // Advanced village roles (second set):
  | "lycan"
  | "sister"
  | "wildChild"
  | "medium"
  // Advanced roles, third set (votes, wolves with extra powers):
  | "mayor"
  | "bigBadWolf"
  | "minion"
  | "knight"
  | "silencer"
  // Advanced roles, solo (they win alone):
  | "tanner"
  | "whiteWolf"
  | "serialKiller"
  | "arsonist";

/** "solo": plays for itself and wins alone (Tanner, White Wolf, Serial Killer, Arsonist). */
export type Team = "wolves" | "village" | "solo";

/** Night steps are identified by the role that wakes up. */
export type NightStepId =
  | "cupid"
  | "wildChild"
  | "bodyguard"
  | "werewolf"
  | "wolfSeer"
  | "cursedWolf"
  | "witch"
  | "seer"
  | "medium"
  | "bigBadWolf"
  | "silencer"
  | "whiteWolf"
  | "serialKiller"
  | "arsonist";

export type PhaseKind =
  | "lobby"
  | "roleReveal"
  | "night"
  | "dawn"
  | "hunter"
  | "discussion"
  | "nominate"
  | "nominateResult"
  | "defense"
  | "verdict"
  | "verdictResult"
  | "gameOver";

export type DeathCause =
  | "wolves"
  | "poison"
  | "heartbreak"
  | "hunter"
  | "execution"
  | "host"
  /** The Knight's rusty sword: a wolf dies the night after biting him. */
  | "rust"
  /** The Serial Killer's knife. */
  | "killer"
  /** The Arsonist set the doused houses alight. */
  | "fire";

/** A solo role id when that player won alone. */
export type SoloWinner = "tanner" | "whiteWolf" | "serialKiller" | "arsonist";
export type Winner = "wolves" | "village" | "lovers" | "draw" | SoloWinner;

export interface Death {
  playerId: string;
  cause: DeathCause;
}

export interface Player {
  id: string;
  /** Secret used to resume the session. Never sent to other clients. */
  token: string;
  name: string;
  avatar: string;
  /** Uploaded/Google photo (validated server-side); falls back to the emoji avatar. */
  avatarUrl?: string | null;
  style?: PlayerStyle;
  /** Shop items the linked account owns (server-side only, never sent to clients). */
  owned?: string[];
  /** Index into CHAT_COLORS, unique in the room: the player's chat bubble colour. */
  chatColor?: number;
  /** Linked account, if the player signed in. */
  userId?: string | null;
  /** The browser the player joined from (server-side only): guests sit in one room at a time too. */
  deviceId?: string | null;
  locale: Locale;
  isBot: boolean;
  connected: boolean;
  /** Away (offline or idle on their turn for a minute): a bot plays for them until they are back. */
  standIn?: boolean;
  alive: boolean;
  joinedAt: number;
}

export interface NominationSettings {
  /** top1: most votes go up · topN: N highest · threshold: everyone with >= threshold votes */
  mode: "top1" | "topN" | "threshold";
  n: number;
  threshold: number;
  /** What to do when the cut-off is a tie. */
  tie: "allTied" | "none" | "revote";
}

export interface VerdictSettings {
  /** absolute: EXECUTE > half of eligible voters · simple: EXECUTE > SPARE */
  majority: "absolute" | "simple";
  anonymous: boolean;
}

export interface Settings {
  nightOrder: NightStepId[];
  roleCounts: Record<RoleId, number>;
  nomination: NominationSettings;
  verdict: VerdictSettings;
  bodyguardSelf: boolean;
  witchSelfSave: boolean;
  witchBothSameNight: boolean;
  hunterShootsWhenPoisoned: boolean;
  revealRoleOnDeath: boolean;
  deadSeeRoles: boolean;
  decoyActions: boolean;
  /** The pack must pick a victim every night (no "no bite"). */
  wolvesMustBite: boolean;
  /** Everyone alive must vote: no skipping, the host can't close until all have voted. */
  mandatoryVote: boolean;
  /** Players may open their mic in the lobby and during the discussion. */
  voiceChat: boolean;
  /** Auto narrator: once a step is confirmed, move on by itself after a short pause. */
  autoAdvance: boolean;
  /** Bots answer people in the chat with an AI model (needs GEMINI_API_KEY on the server). */
  aiBots: boolean;
  /** No projector: players' phones also show the narration and the public info. */
  noScreen: boolean;
  /** How fast bots act and talk (1 = normal, 2 = twice as fast). */
  botSpeed: number;
  /** A player offline for 5 minutes during a game is out for good (a bot takes the seat, it counts as a loss). */
  autoKickAway: boolean;
  discussionSeconds: number;
  defenseSeconds: number;
  bilingualScreen: boolean;
}

export interface NightState {
  cupidPair: [string, string] | null;
  protectId: string | null;
  /** wolfId -> targetId (live, visible to the pack) */
  wolfVotes: Record<string, string>;
  wolfTarget: string | null;
  wolfFinalized: boolean;
  witchSave: boolean;
  witchPoisonId: string | null;
  witchDone: boolean;
  seerTarget: string | null;
  /** The Wolf Seer's pick tonight. */
  wolfSeerTarget?: string | null;
  /** The Cursed Wolf turns tonight's victim into a werewolf instead of killing them. */
  curse?: boolean;
  /** The Medium's pick tonight (a dead player). */
  mediumTarget?: string | null;
  /** The Big Bad Wolf's extra victim. */
  bigBadTarget?: string | null;
  /** The Silencer's pick: can't talk or vote tomorrow. */
  silenceId?: string | null;
  /** The White Wolf's victim (one of the pack). */
  whiteWolfTarget?: string | null;
  /** The Serial Killer's victim. */
  killerTarget?: string | null;
  /** The Arsonist douses this player tonight… */
  douseId?: string | null;
  /** …or sets every doused house alight. */
  ignite?: boolean;
  /** Steps whose actor(s) have finished. */
  done: Partial<Record<NightStepId, boolean>>;
}

export interface SeerResult {
  night: number;
  targetId: string;
  isWolf: boolean;
  /** Wolf Seer and Medium: the exact role seen. */
  roleId?: RoleId;
}

export type VoteKind = "nominate" | "verdict";

export interface VoteState {
  kind: VoteKind;
  /** voterId -> targetId | "skip" (nominate) or "execute" | "spare" (verdict) */
  ballots: Record<string, string>;
  closed: boolean;
  /** Restricts nomination targets (used for a revote between tied players). */
  candidates: string[] | null;
  /** The nominee being judged (verdict only). */
  nomineeId: string | null;
}

export interface NominationTally {
  counts: Record<string, number>;
  skips: number;
  nominees: string[];
  tie: boolean;
  tiedIds: string[];
}

export interface VerdictTally {
  execute: number;
  spare: number;
  abstain: number;
  eligible: number;
  executed: boolean;
}

export interface VerdictRecord extends VerdictTally {
  nomineeId: string;
  ballots: Record<string, string>;
  deaths: Death[];
  /** The village voted to hang the Idiot: he was revealed and lives. */
  idiotRevealed?: boolean;
}

export interface TimerState {
  /** Epoch ms when the timer hits zero (running) */
  endsAt: number | null;
  /** Remaining ms when paused */
  remainingMs: number;
  durationMs: number;
  running: boolean;
}

export interface LogEntry {
  t: number;
  night: number;
  day: number;
  key: string;
  params: Record<string, string | number>;
  /** Shown publicly on the end-of-game timeline. */
  public?: boolean;
}

export interface Game {
  roles: Record<string, RoleId>;
  originalRoles: Record<string, RoleId>;
  lovers: [string, string] | null;
  bodyguardLast: string | null;
  potions: { heal: boolean; poison: boolean };
  nightState: NightState;
  seerResults: Record<string, SeerResult[]>;
  lastDeaths: Death[];
  nominees: string[];
  nomination: NominationTally | null;
  /** What happens after the nomination results are shown. */
  nominationOutcome: "defense" | "revote" | "none" | null;
  vote: VoteState | null;
  verdicts: VerdictRecord[];
  pendingHunters: string[];
  hunterReturn: "discussion" | "afterVerdict";
  hunterShots: Record<string, string>;
  /** Nominees who said they are done defending themselves. */
  defenseDone?: string[];
  pendingWin: Winner | null;
  /** Signature of the alive set when the host chose "keep playing". */
  dismissedWinSig: string | null;
  winner: Winner | null;
  /** The Cursed Wolf has turned someone already (once per game). */
  curseUsed?: boolean;
  /** Players turned into werewolves by the curse, and on which night. */
  cursed?: { playerId: string; night: number }[];
  /** Elders who already took their one wolf bite. */
  elderHits?: string[];
  /** Wild Child id -> the model they picked on the first night. */
  wildModels?: Record<string, string>;
  /** Wild Children who turned werewolf when their model died. */
  wildTurned?: { playerId: string; night: number; day: number }[];
  /** The Knight was bitten to death: a wolf dies at the end of this night. */
  rustNight?: number | null;
  /** Silenced by the Silencer for this day: no chat, no mic, no vote. */
  silenced?: { playerId: string; day: number } | null;
  /** Players the Arsonist has doused. */
  doused?: string[];
  /** The village hanged the Tanner. */
  tannerWin?: boolean;
  /** Idiots the village voted to hang: revealed, alive, but no vote any more. */
  revealedIdiots?: string[];
  /** The finished game was added to the players' career stats (server side, once). */
  statsRecorded?: boolean;
  /** Id of the saved game (shared/replay.ts) the players' history links to. Set by the server. */
  recordId?: string;
  /** Seats of players who left after they died: seat id to their account, still counted at the end. */
  leftDead?: Record<string, string>;
}

export interface Phase {
  kind: PhaseKind;
  night: number;
  day: number;
  steps: NightStepId[];
  stepIndex: number;
  verdictIndex: number;
}

export interface Room {
  code: string;
  hostToken: string;
  locale: Locale;
  createdAt: number;
  lastActivity: number;
  players: Player[];
  settings: Settings;
  /** Lobby role assignment (editable by host before the game starts). */
  assignment: Record<string, RoleId>;
  phase: Phase;
  game: Game | null;
  /** Which game this is in the room (1 for the first; each new game adds one). */
  gameNo?: number;
  timer: TimerState;
  log: LogEntry[];
  /** When the auto narrator will move on (ms epoch), or null. */
  autoAt?: number | null;
  /** Players asking the host to let them back into the running game. */
  rejoinRequests?: { playerId: string; t: number }[];
  /** Shown in the online lobby's room list (rooms made from the lobby). */
  listed?: boolean;
  /** Name shown in the room list (the creator's name). */
  title?: string;
  /** The Google account that made the room (one open room per account). */
  creatorId?: string | null;
  /** Special roles the room cannot use now; set by the server from the free rotation and the creator's role cards. */
  lockedRoles?: RoleId[];
  /** The machine runs the game: nobody holds the host view, the owner (a player) sets the room up. */
  machineHost?: boolean;
  /** Machine-host rooms: the player who may change the settings and start the game. */
  ownerId?: string | null;
  /** Players who left a running game for good (their seat is played by a bot now). */
  abandoned?: string[];
  /** "salt:sha256" of the room password, or null/absent when the room is open. Never sent to clients. */
  passwordHash?: string | null;
}

/** What the room owner of a machine-host room may do (a safe subset of the host's actions). */
export type OwnerAction =
  | { type: "updateSettings"; settings: Partial<Settings> }
  | { type: "setRoleCounts"; roleCounts: Record<RoleId, number> }
  | { type: "useSuggested" }
  | { type: "addBots"; count: number }
  | { type: "removeBots" }
  | { type: "kick"; playerId: string }
  /** Make another person in the room its owner. */
  | { type: "transferOwner"; playerId: string }
  | { type: "start" }
  /** Fill with bots, deal the suggested basic roles and start, in one go. */
  | { type: "playNow" }
  | { type: "newGame" };

// ---------------------------------------------------------------------------
// Actions (client -> server)
// ---------------------------------------------------------------------------

export type PlayerAction =
  | { type: "setLocale"; locale: Locale }
  | { type: "night"; targets?: string[]; save?: boolean; poisonId?: string | null; curse?: boolean; ignite?: boolean }
  | { type: "vote"; choice: string }
  | { type: "endDefense" }
  | { type: "hunterShot"; targetId: string | null }
  | { type: "updateProfile"; name?: string; avatar?: string; style?: Partial<PlayerStyle> };

export type OverrideAction =
  | { kind: "kill"; playerId: string }
  | { kind: "revive"; playerId: string }
  | { kind: "changeRole"; playerId: string; roleId: RoleId }
  | { kind: "cancelVote" }
  | { kind: "revote" };

export type HostAction =
  | { type: "setLocale"; locale: Locale }
  | { type: "kick"; playerId: string }
  | { type: "rename"; playerId: string; name: string }
  | { type: "updateSettings"; settings: Partial<Settings> }
  | { type: "setRoleCounts"; roleCounts: Record<RoleId, number> }
  | { type: "useSuggested" }
  | { type: "assignRandom" }
  /** Fill with bots, deal the suggested basic roles and start, in one go. */
  | { type: "playNow" }
  | { type: "assignManual"; playerId: string; roleId: RoleId | null }
  | { type: "addBots"; count: number }
  | { type: "removeBots" }
  | { type: "start" }
  | { type: "next" }
  | { type: "timer"; op: "start" | "pause" | "resume" | "reset" | "add"; seconds?: number }
  | { type: "override"; action: OverrideAction }
  | { type: "actAs"; playerId: string; action: PlayerAction }
  | { type: "confirmWin" }
  | { type: "dismissWin" }
  | { type: "endGame"; winner: Winner }
  | { type: "newGame" };

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** i18n params for the error */
  params?: Record<string, string | number>;
}
