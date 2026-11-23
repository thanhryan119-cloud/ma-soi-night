// Chat, drawing board and open-mic rules (pure, shared by server and client).
// Social features are open in the lobby, during the day discussion and after
// the game ends; during the game dead players can only watch and listen.

import type { Room } from "./types";

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
  return { ok: true, listenOnly: (!!room.game && !p.alive && room.phase.kind !== "gameOver") || onlyNominees };
}

export function sanitizeChat(text: unknown): string | null {
  const clean = String(text ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LEN);
  return clean || null;
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
