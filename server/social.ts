// Socket handlers for chat, the shared drawing board and open-mic voice
// (WebRTC mesh: the server only relays signaling, audio goes peer to peer).

import type { Server, Socket } from "socket.io";
import { randomId } from "../shared/engine";
import {
  BOARD_MAX_STROKES,
  CHAT_HISTORY,
  canSpeak,
  sanitizeChat,
  sanitizeStroke,
  voiceAccess,
  type ChatMessage,
  type Speaker,
  type Stroke,
} from "../shared/social";
import type { Room } from "../shared/types";

interface VoicePeer {
  socketId: string;
  from: string; // "host" or player id
  muted: boolean;
  listenOnly: boolean;
}

interface RoomSocial {
  chat: ChatMessage[];
  strokes: Stroke[];
  lastChat: Map<string, number>;
  voice: Map<string, VoicePeer>;
}

type Ack = (res: Record<string, unknown>) => void;
interface Data {
  code?: string;
  kind?: string;
  playerId?: string;
}

export function createSocial(
  io: Server,
  getRoom: (code: string) => Room | undefined,
  channel: (code: string) => string,
  /** Called for every player/bot chat line (bots learn from the table talk). */
  onChat: (room: Room, fromId: string, text: string) => void = () => {},
) {
  const social = new Map<string, RoomSocial>();
  const of = (code: string) => {
    let s = social.get(code);
    if (!s) social.set(code, (s = { chat: [], strokes: [], lastChat: new Map(), voice: new Map() }));
    return s;
  };

  const speakerOf = (d: Data): Speaker | null =>
    d.kind === "host" ? { kind: "host" } : d.kind === "player" && d.playerId ? { kind: "player", playerId: d.playerId } : null;
  const fromKey = (who: Speaker) => (who.kind === "host" ? "host" : who.playerId);

  function leaveVoice(socket: Socket) {
    const code = (socket.data as Data).code;
    if (!code) return;
    const s = social.get(code);
    if (s?.voice.delete(socket.id)) io.to(channel(code)).emit("voice:peer-left", { socketId: socket.id });
  }

  function register(socket: Socket) {
    const on = (event: string, fn: (p: Record<string, unknown>, ack: Ack) => void) =>
      socket.on(event, (p: unknown, ack: unknown) => {
        try {
          fn((p ?? {}) as Record<string, unknown>, typeof ack === "function" ? (ack as Ack) : () => {});
        } catch (err) {
          console.error("[social]", err);
        }
      });
    const ctx = () => {
      const d = socket.data as Data;
      const room = d.code ? getRoom(d.code) : undefined;
      const who = speakerOf(d);
      return room && who ? { room, who, s: of(room.code) } : null;
    };

    on("social:sync", (_p, ack) => {
      const c = ctx();
      const d = socket.data as Data;
      const s = d.code ? of(d.code) : null;
      if (!s) return ack({ ok: false });
      ack({
        ok: true,
        chat: s.chat,
        strokes: s.strokes,
        voice: [...s.voice.values()],
        canSpeak: c ? canSpeak(c.room, c.who) === null : false,
      });
    });

    on("chat:send", (p, ack) => {
      const c = ctx();
      if (!c) return ack({ ok: false, error: "err.notInRoom" });
      const err = canSpeak(c.room, c.who);
      if (err) return ack({ ok: false, error: err });
      const text = sanitizeChat(p.text);
      if (!text) return ack({ ok: false, error: "err.chatEmpty" });
      const key = fromKey(c.who);
      const now = Date.now();
      if (now - (c.s.lastChat.get(key) ?? 0) < 400) return ack({ ok: false, error: "err.tooFast" });
      c.s.lastChat.set(key, now);
      const msg: ChatMessage = { id: randomId(10), from: key, text, t: now };
      c.s.chat.push(msg);
      if (c.who.kind === "player") onChat(c.room, key, text);
      if (c.s.chat.length > CHAT_HISTORY) c.s.chat.splice(0, c.s.chat.length - CHAT_HISTORY);
      io.to(channel(c.room.code)).emit("chat:new", msg);
      ack({ ok: true });
    });

    on("board:stroke", (p, ack) => {
      const c = ctx();
      if (!c) return ack({ ok: false, error: "err.notInRoom" });
      const err = canSpeak(c.room, c.who);
      if (err) return ack({ ok: false, error: err });
      const stroke = sanitizeStroke(p.stroke, fromKey(c.who), randomId(10));
      if (!stroke) return ack({ ok: false, error: "err.unknownAction" });
      c.s.strokes.push(stroke);
      if (c.s.strokes.length > BOARD_MAX_STROKES) c.s.strokes.splice(0, c.s.strokes.length - BOARD_MAX_STROKES);
      socket.to(channel(c.room.code)).emit("board:stroke", stroke);
      ack({ ok: true, stroke });
    });

    on("board:clear", (_p, ack) => {
      const c = ctx();
      if (!c || c.who.kind !== "host") return ack({ ok: false, error: "err.notHost" });
      c.s.strokes = [];
      io.to(channel(c.room.code)).emit("board:clear");
      ack({ ok: true });
    });

    // ------------------------------------------------------------- voice --
    on("voice:join", (p, ack) => {
      const c = ctx();
      if (!c) return ack({ ok: false, error: "err.notInRoom" });
      const access = voiceAccess(c.room, c.who);
      if (!access.ok) return ack({ ok: false, error: access.error });
      const peer: VoicePeer = {
        socketId: socket.id,
        from: fromKey(c.who),
        muted: access.listenOnly || !!p.muted,
        listenOnly: access.listenOnly,
      };
      const others = [...c.s.voice.values()].filter((v) => v.socketId !== socket.id);
      c.s.voice.set(socket.id, peer);
      socket.to(channel(c.room.code)).emit("voice:peer-joined", peer);
      ack({ ok: true, self: peer, peers: others });
    });

    on("voice:leave", (_p, ack) => {
      leaveVoice(socket);
      ack({ ok: true });
    });

    on("voice:state", (p) => {
      const c = ctx();
      const peer = c?.s.voice.get(socket.id);
      if (!c || !peer) return;
      peer.muted = peer.listenOnly || !!p.muted;
      io.to(channel(c.room.code)).emit("voice:peer-state", peer);
    });

    on("voice:signal", (p) => {
      const c = ctx();
      if (!c || !c.s.voice.has(socket.id)) return;
      const to = String(p.to ?? "");
      if (!c.s.voice.has(to)) return; // only relay between peers of the same call
      io.to(to).emit("voice:signal", { from: socket.id, data: p.data });
    });

    socket.on("disconnect", () => leaveVoice(socket));
  }

  /** Called after every room change: ends the call when the phase no longer allows voice. */
  function afterChange(room: Room) {
    const s = social.get(room.code);
    if (!s || !s.voice.size) return;
    if (!voiceAccess(room, { kind: "host" }).ok) {
      s.voice.clear();
      io.to(channel(room.code)).emit("voice:end");
    }
  }

  /** Posts a chat line on behalf of a bot (server-side, no socket). */
  function postAs(room: Room, playerId: string, raw: string) {
    const text = sanitizeChat(raw);
    if (!text) return;
    const s = of(room.code);
    const msg: ChatMessage = { id: randomId(10), from: playerId, text, t: Date.now() };
    s.chat.push(msg);
    onChat(room, playerId, text);
    if (s.chat.length > CHAT_HISTORY) s.chat.splice(0, s.chat.length - CHAT_HISTORY);
    io.to(channel(room.code)).emit("chat:new", msg);
  }

  function dispose(code: string) {
    social.delete(code);
  }

  /** A new game starts with an empty chat and a blank board (the old game's talk stays with it). */
  function clearForNewGame(code: string) {
    const s = social.get(code);
    if (!s) return;
    s.chat = [];
    s.strokes = [];
    s.lastChat.clear();
    io.to(channel(code)).emit("chat:clear");
    io.to(channel(code)).emit("board:clear");
  }

  /** The room's recent chat (for the AI bots' context). */
  const recentChat = (code: string) => social.get(code)?.chat ?? [];

  return { register, afterChange, dispose, postAs, recentChat, clearForNewGame };
}
