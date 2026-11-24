// Chat, drawing board and open-mic rules (pure, shared by server and client).
// Social features are open in the lobby, during the day discussion and after
// the game ends; during the game dead players can only watch and listen.

import type { Room } from "./types";

/** The Silencer's victim of the day (same rule as engine.isSilenced, kept here to stay import-free). */
function silencedNow(room: Room, id: string): boolean {
  const s = room.game?.silenced;
  return !!s && s.playerId === id && s.day === room.phase.day && room.phase.kind !== "night" && room.phase.kind !== "gameOver";
}

/** Chat is open in these phases; during the defense only the players on the stand may speak. */
export const SOCIAL_PHASES = ["lobby", "discussion", "defense", "gameOver"] as const;
export const CHAT_MAX_LEN = 200;
export const CHAT_HISTORY = 200;
export const BOARD_MAX_STROKES = 3000;
export const STROKE_MAX_POINTS = 600;
export const BOARD_COLORS = ["#f2f2f2", "#e5383b", "#f4c542", "#4cc9f0", "#57cc99", "#b388eb"] as const;
export const BRUSH_SIZES = [2, 5, 12] as const;

export type Speaker = { kind: "host" } | { kind: "player"; playerId: string };

export interface ChatMessage {
  id: string;
  /** "host" or a player id */
  from: string;
  text: string;
  t: number;
}

export interface Stroke {
  id: string;
  by: string;
  color: string;
  size: number;
  /** Flat list of x,y pairs normalised to 0..1 */
  points: number[];
}

export const socialOpen = (room: Room) => (SOCIAL_PHASES as readonly string[]).includes(room.phase.kind);

/**
 * Online rooms (machine host): the players on the stand keep the chat during
 * the verdict vote too, so they can plead until the end. Everyone else reads.
 */
export const defenderChat = (room: Pick<Room, "machineHost" | "phase">) => !!room.machineHost && room.phase.kind === "verdict";

/** null when the speaker may chat/draw now, otherwise an i18n error key. */
export function canSpeak(room: Room, who: Speaker): string | null {
  if (who.kind === "host") return null;
  const p = room.players.find((x) => x.id === who.playerId);
  if (!p) return "err.notInRoom";
  const defenders = room.phase.kind === "defense" || defenderChat(room);
  if (!socialOpen(room) && !defenderChat(room)) return "err.chatClosed";
  if (room.game && !p.alive && room.phase.kind !== "gameOver") return "err.deadNoChat";
  if (defenders && !room.game?.nominees.includes(p.id)) return "err.onlyNominees";
  if (silencedNow(room, p.id)) return "err.silenced";
  return null;
}

/** Voice is available in the social phases when the host allows it. Dead players listen only. */
export function voiceAccess(room: Room, who: Speaker): { ok: boolean; listenOnly: boolean; error?: string } {
  if (room.settings.voiceChat === false) return { ok: false, listenOnly: true, error: "err.voiceDisabled" };
  if (!socialOpen(room)) return { ok: false, listenOnly: true, error: "err.chatClosed" };
  if (who.kind === "host") return { ok: true, listenOnly: false };
  const p = room.players.find((x) => x.id === who.playerId);
  if (!p) return { ok: false, listenOnly: true, error: "err.notInRoom" };
  const onlyNominees = room.phase.kind === "defense" && !room.game?.nominees.includes(p.id);
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

/** People are talking a lot right now (4+ lines from humans in 10 s): bots hold back. */
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

export function sanitizeStroke(input: unknown, by: string, id: string): Stroke | null {
  const s = (input ?? {}) as Partial<Stroke>;
  if (!BOARD_COLORS.includes(s.color as (typeof BOARD_COLORS)[number])) return null;
  if (!BRUSH_SIZES.includes(s.size as (typeof BRUSH_SIZES)[number])) return null;
  if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length % 2 !== 0) return null;
  if (s.points.length > STROKE_MAX_POINTS * 2) return null;
  const points: number[] = [];
  for (const v of s.points) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    points.push(Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000);
  }
  return { id, by, color: s.color!, size: s.size!, points };
}
