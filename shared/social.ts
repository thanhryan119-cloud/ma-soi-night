// Chat and open-mic rules (pure, shared by server and client).
// Social features are open in the lobby, during the day discussion and after
// the game ends; during the game dead players can only watch and listen.

import type { PlayerStyle } from "./cosmetics";
import type { Room } from "./types";

/** The Silencer's victim of the day (same rule as engine.isSilenced, kept here to stay import-free). */
function silencedNow(room: Room, id: string): boolean {
  const s = room.game?.silenced;
  return !!s && s.playerId === id && s.day === room.phase.day && room.phase.kind !== "night" && room.phase.kind !== "gameOver";
}

/** Chat is open in these phases; during the defense only the players on the stand may speak. */
export const SOCIAL_PHASES = ["lobby", "discussion", "defense", "gameOver"] as const;
export const CHAT_MAX_LEN = 200;
export const CHAT_HISTORY = 400;

/** A spectator watches a running game: they read along and talk in the dead players' chat only. */
export interface Spectator {
  id: string;
  name: string;
  avatar: string;
}

export type Speaker = { kind: "host" } | { kind: "player"; playerId: string } | ({ kind: "spectator" } & Spectator);

/** Chat lines from spectators are marked with this prefix on `from`. */
export const SPECTATOR_PREFIX = "spec:";
export const isSpectatorId = (from: string) => from.startsWith(SPECTATOR_PREFIX);

export interface ChatMessage {
  id: string;
  /** "host", a player id, or SPECTATOR_PREFIX + a spectator id */
  from: string;
  /** Spectators are not seated: their name and avatar travel with the line. */
  name?: string;
  avatar?: string;
  text: string;
  t: number;
  /** When in the game it was said (the chat shows a marker where the day changes). */
  stage?: ChatStage;
  /** The day (or night) number for "day" and "night". */
  n?: number;
  /** Which game in the room it was said in (the chat keeps every game's talk, marked by game). */
  g?: number;
}

export type ChatStage = "lobby" | "night" | "day" | "over";

/** Where the room is, for the markers between days in the chat. */
export function chatStage(room: Pick<Room, "game" | "phase" | "gameNo">): { stage: ChatStage; n: number; g: number } {
  const k = room.phase.kind;
  const g = room.gameNo ?? 1;
  if (!room.game || k === "lobby") return { stage: "lobby", n: 0, g };
  if (k === "gameOver") return { stage: "over", n: 0, g };
  if (k === "night" || k === "roleReveal") return { stage: "night", n: Math.max(1, room.phase.night), g };
  return { stage: "day", n: Math.max(1, room.phase.day), g };
}

/** True when a chat line starts a new part of the room's story (another game, day, night, lobby or game over). */
export function newStage(m: ChatMessage, prev: ChatMessage | undefined): boolean {
  if (!m.stage) return false;
  if (!prev) return m.stage !== "lobby" || (m.g ?? 1) > 1;
  return prev.stage !== m.stage || prev.n !== m.n || (prev.g ?? 1) !== (m.g ?? 1);
}

/** The chat lines of the game being played now (bots only read these). */
export const currentGameChat = (chat: ChatMessage[], gameNo: number | undefined) => chat.filter((m) => (m.g ?? 1) === (gameNo ?? 1));

export const socialOpen = (room: Room) => (SOCIAL_PHASES as readonly string[]).includes(room.phase.kind);

/**
 * The players on the stand keep the chat (and mic) during the verdict vote
 * too, so they can plead until the end. Everyone else reads and listens.
 */
export const defenderChat = (room: Pick<Room, "phase">) => room.phase.kind === "verdict";

/** null when the speaker may chat/draw now, otherwise an i18n error key. */
export function canSpeak(room: Room, who: Speaker): string | null {
  if (who.kind === "host") return null;
  if (who.kind === "spectator") return "err.spectatorReadOnly";
  const p = room.players.find((x) => x.id === who.playerId);
  if (!p) return "err.notInRoom";
  const defenders = room.phase.kind === "defense" || defenderChat(room);
  if (!socialOpen(room) && !defenderChat(room)) return "err.chatClosed";
  if (room.game && !p.alive && room.phase.kind !== "gameOver") return "err.deadNoChat";
  if (defenders && !room.game?.nominees.includes(p.id)) return "err.onlyNominees";
  if (silencedNow(room, p.id)) return "err.silenced";
  return null;
}

/**
 * The dead have a chat of their own while the game runs: only they, the
 * spectators (and a human host) read it, and the living never see it until the
 * game is over, when everyone can read it.
 */
export function canReadGhosts(room: Room, who: Speaker): boolean {
  if (!room.game) return false;
  if (who.kind !== "player" || room.phase.kind === "gameOver") return true;
  const p = room.players.find((x) => x.id === who.playerId);
  return !!p && !p.alive;
}

/** null when the speaker may post in the dead players' chat, otherwise an i18n error key. */
export function canGhostSpeak(room: Room, who: Speaker): string | null {
  if (who.kind === "host") return "err.ghostsOnly";
  if (who.kind === "spectator") return room.game && room.phase.kind !== "gameOver" ? null : "err.ghostsOnly";
  const p = room.players.find((x) => x.id === who.playerId);
  if (!p) return "err.notInRoom";
  if (!room.game || room.phase.kind === "gameOver" || p.alive) return "err.ghostsOnly";
  return null;
}

/** Voice is available in the social phases when the host allows it. Dead players listen only. */
export function voiceAccess(room: Room, who: Speaker): { ok: boolean; listenOnly: boolean; error?: string } {
  if (room.settings.voiceChat === false) return { ok: false, listenOnly: true, error: "err.voiceDisabled" };
  if (!socialOpen(room) && !defenderChat(room)) return { ok: false, listenOnly: true, error: "err.chatClosed" };
  if (who.kind === "host") return { ok: true, listenOnly: false };
  if (who.kind === "spectator") return { ok: false, listenOnly: true, error: "err.spectatorReadOnly" };
  const p = room.players.find((x) => x.id === who.playerId);
  if (!p) return { ok: false, listenOnly: true, error: "err.notInRoom" };
  const onlyNominees = (room.phase.kind === "defense" || defenderChat(room)) && !room.game?.nominees.includes(p.id);
  return { ok: true, listenOnly: (!!room.game && !p.alive && room.phase.kind !== "gameOver") || onlyNominees || silencedNow(room, p.id) };
}

export function sanitizeChat(text: unknown): string | null {
  const clean = String(text ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LEN);
  return clean || null;
}

/**
 * Slow mode: a player may send at most CHAT_BURST messages per CHAT_WINDOW_MS,
 * and never two within CHAT_MIN_GAP_MS, so a busy table stays readable.
 */
export const CHAT_BURST = 3;
export const CHAT_WINDOW_MS = 8000;
export const CHAT_MIN_GAP_MS = 400;

/** Drops send times that no longer count (older than the window). */
export const recentSends = (times: readonly number[], now: number) => times.filter((t) => now - t < CHAT_WINDOW_MS);

/** 0 when a player who sent at `times` may send now, otherwise how many ms they must wait. */
export function chatWaitMs(times: readonly number[], now: number): number {
  const recent = recentSends(times, now).sort((a, b) => a - b);
  let wait = 0;
  const last = recent[recent.length - 1];
  if (last !== undefined) wait = Math.max(wait, CHAT_MIN_GAP_MS - (now - last));
  if (recent.length >= CHAT_BURST) wait = Math.max(wait, CHAT_WINDOW_MS - (now - recent[recent.length - CHAT_BURST]));
  return Math.max(0, wait);
}

/**
 * Bots answer once a burst of messages settles (debounceMs of quiet), but never
 * wait longer than maxWaitMs after the first unanswered message, so a chat that
 * never pauses still gets answers. Returns how long to wait from now.
 */
export function answerDelay(firstAt: number, now: number, debounceMs: number, maxWaitMs: number): number {
  return Math.max(0, Math.min(debounceMs, firstAt + maxWaitMs - now));
}

/** While people talk a lot, a bot's turn to speak only comes up this often (instead of never). */
export const BUSY_TALK_CHANCE = 0.4;

/** People are talking a lot right now (4+ lines from humans in 10 s): bots slow down. */
export const BUSY_LINES = 4;
export const BUSY_WINDOW_MS = 10_000;
export function tableBusy(chat: readonly ChatMessage[], isHuman: (from: string) => boolean, now: number): boolean {
  let n = 0;
  for (let i = chat.length - 1; i >= 0 && now - chat[i].t < BUSY_WINDOW_MS; i--) if (isHuman(chat[i].from) && ++n >= BUSY_LINES) return true;
  return false;
}

/** True when `text` names the player `name` as a whole word ("An" is not in "Anh"), or as "@name". */
export function mentionsName(text: string, name: string): boolean {
  const n = name.trim();
  if ([...n].length < 2) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${esc}(?![\p{L}\p{N}])`, "iu").test(text);
}

// ---------------------------------------------------------------------------
// Server-wide chat (home page and online lobby, never inside a room)
// ---------------------------------------------------------------------------

/** One line in the server-wide chat. Only signed-in accounts can post. */
export interface GlobalMessage {
  id: string;
  t: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  style: PlayerStyle | null;
  text: string;
}

/** Lines kept (and sent to someone opening the chat). */
export const GLOBAL_CHAT_HISTORY = 100;
/** Least time between two lines from one account. */
export const GLOBAL_CHAT_WAIT_MS = 3000;

/** A signed-in account with the server chat open (the "Online" tab). */
export interface OnlineUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  style: PlayerStyle | null;
  /** Where they are right now (absent: on a page outside any room). */
  where?: Whereabouts;
}

/**
 * What someone online is doing. `code` only for a room listed in the lobby,
 * so a private room's code never leaks to the whole server.
 */
export interface Whereabouts {
  status: "waiting" | "playing" | "watching";
  code?: string;
}

export interface OnlineList {
  users: OnlineUser[];
  /** People reading without an account: counted, not listed. */
  guests: number;
  /** Listed rooms still waiting for players, and games being played anywhere. */
  rooms?: { open: number; playing: number };
}


/** A private line between two accounts, shown as a tab of the server chat. */
export interface DirectMessage {
  id: string;
  t: number;
  from: string;
  to: string;
  text: string;
}

/** Lines kept per pair of accounts. */
export const DM_HISTORY = 100;
/** Least time between two private lines from one account. */
export const DM_WAIT_MS = 1000;

/** The other account in a private line. */
export const dmPeer = (m: Pick<DirectMessage, "from" | "to">, me: string) => (m.from === me ? m.to : m.from);
/** One key per pair of accounts, the same whoever writes. */
export const dmKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
