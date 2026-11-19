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
  | "cupid";

export type Team = "wolves" | "village";

/** Night steps are identified by the role that wakes up. */
export type NightStepId = "cupid" | "bodyguard" | "werewolf" | "witch" | "seer";

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

export type DeathCause = "wolves" | "poison" | "heartbreak" | "hunter" | "execution" | "host";

export type Winner = "wolves" | "village" | "lovers" | "draw";

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
  /** Linked account, if the player signed in. */
  userId?: string | null;
  locale: Locale;
  isBot: boolean;
  connected: boolean;
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
  /** Steps whose actor(s) have finished. */
  done: Partial<Record<NightStepId, boolean>>;
}

export interface SeerResult {
  night: number;
  targetId: string;
  isWolf: boolean;
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
  pendingWin: Winner | null;
  /** Signature of the alive set when the host chose "keep playing". */
  dismissedWinSig: string | null;
  winner: Winner | null;
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
  timer: TimerState;
  log: LogEntry[];
}

// ---------------------------------------------------------------------------
// Actions (client -> server)
// ---------------------------------------------------------------------------

export type PlayerAction =
  | { type: "setLocale"; locale: Locale }
  | { type: "night"; targets?: string[]; save?: boolean; poisonId?: string | null }
  | { type: "vote"; choice: string }
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
