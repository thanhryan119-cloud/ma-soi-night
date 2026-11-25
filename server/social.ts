// Socket handlers for chat, the shared drawing board and open-mic voice
// (WebRTC mesh: the server only relays signaling, audio goes peer to peer).

import type { Server, Socket } from "socket.io";
import { randomId } from "../shared/engine";
import {
  BOARD_MAX_STROKES,
  CHAT_HISTORY,
  canGhostSpeak,
  canReadGhosts,
  canSpeak,
  chatStage,
  chatWaitMs,
  recentSends,
  sanitizeChat,
  sanitizeStroke,
  voiceAccess,
  type ChatMessage,
  type Speaker,
  type Spectator,
  SPECTATOR_PREFIX,
  type Stroke,
} from "../shared/social";
import type { Room } from "../shared/types";
import { describeIce, iceServers } from "./ice";

interface VoicePeer {
  socketId: string;
  from: string; // "host" or player id
  muted: boolean;
  listenOnly: boolean;
}

interface RoomSocial {
  chat: ChatMessage[];
  /** The dead players' own chat (read by the dead and the host until the game ends). */
  ghost: ChatMessage[];
  strokes: Stroke[];
  /** Recent send times per sender, for slow mode. */
  lastChat: Map<string, number[]>;
  voice: Map<string, VoicePeer>;
}

type Ack = (res: Record<string, unknown>) => void;
interface Data {
  code?: string;
  kind?: string;
  playerId?: string;
  spectator?: Spectator;
}

export function createSocial(
  io: Server,
  getRoom: (code: string) => Room | undefined,
  channel: (code: string) => string,
  /** Called for every player/bot chat line (bots learn from the table talk). */
  onChat: (room: Room, fromId: string, text: string) => void = () => {},
) {
  console.log(`[voice] ICE: ${describeIce()}`);
  const social = new Map<string, RoomSocial>();
  const of = (code: string) => {
    let s = social.get(code);
    if (!s) social.set(code, (s = { chat: [], ghost: [], strokes: [], lastChat: new Map(), voice: new Map() }));
    return s;
  };

  const speakerOf = (d: Data): Speaker | null =>
    d.kind === "host"
      ? { kind: "host" }
      : d.kind === "player" && d.playerId
        ? { kind: "player", playerId: d.playerId }
        : d.kind === "spectator" && d.spectator
          ? { kind: "spectator", ...d.spectator }
          : null;
  const fromKey = (who: Speaker) =>
    who.kind === "host" ? "host" : who.kind === "spectator" ? SPECTATOR_PREFIX + who.id : who.playerId;

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

    // "So-and-so is typing…": relayed to the rest of the room while the player may chat.
    on("chat:typing", (p) => {
      const c = ctx();
      if (!c || c.who.kind !== "player" || canSpeak(c.room, c.who)) return;
      socket.to(channel(c.room.code)).emit("chat:typing", { from: c.who.playerId, on: !!p.on });
    });

    on("ghost:sync", (_p, ack) => {
      const c = ctx();
      if (!c || !canReadGhosts(c.room, c.who)) return ack({ ok: true, allowed: false, messages: [] });
      ack({ ok: true, allowed: true, messages: c.s.ghost, canSpeak: canGhostSpeak(c.room, c.who) === null });
    });

    on("ghost:send", (p, ack) => {
      const c = ctx();
      if (!c) return ack({ ok: false, error: "err.notInRoom" });
      const err = canGhostSpeak(c.room, c.who);
      if (err) return ack({ ok: false, error: err });
      const text = sanitizeChat(p.text);
      if (!text) return ack({ ok: false, error: "err.chatEmpty" });
      const key = "ghost:" + fromKey(c.who);
      const now = Date.now();
      const sent = recentSends(c.s.lastChat.get(key) ?? [], now);
      const retryMs = chatWaitMs(sent, now);
      if (retryMs > 0) return ack({ ok: false, error: "err.chatSlow", retryMs, params: { seconds: Math.ceil(retryMs / 1000) } });
      c.s.lastChat.set(key, [...sent, now]);
      const msg: ChatMessage = { id: randomId(10), from: fromKey(c.who), text, t: now, ...chatStage(c.room) };
      if (c.who.kind === "spectator") Object.assign(msg, { name: c.who.name, avatar: c.who.avatar });
      c.s.ghost.push(msg);
      if (c.s.ghost.length > CHAT_HISTORY) c.s.ghost.splice(0, c.s.ghost.length - CHAT_HISTORY);
      // Only to the sockets allowed to read it (never to the living).
      for (const id of io.sockets.adapter.rooms.get(channel(c.room.code)) ?? []) {
        const sock = io.sockets.sockets.get(id);
        const who = sock && speakerOf(sock.data as Data);
        if (sock && who && canReadGhosts(c.room, who)) sock.emit("ghost:new", msg);
      }
      ack({ ok: true });
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
      // Slow mode for players (the host may always speak).
      const sent = recentSends(c.s.lastChat.get(key) ?? [], now);
      const retryMs = c.who.kind === "player" ? chatWaitMs(sent, now) : 0;
      if (retryMs > 0) return ack({ ok: false, error: "err.chatSlow", retryMs, params: { seconds: Math.ceil(retryMs / 1000) } });
      c.s.lastChat.set(key, [...sent, now]);
      const msg: ChatMessage = { id: randomId(10), from: key, text, t: now, ...chatStage(c.room) };
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
    // Joining the call means listening; the mic is a separate switch (voice:state).
    on("voice:join", async (p, ack) => {
      const first = ctx();
      if (!first) return ack({ ok: false, error: "err.notInRoom" });
      if (!voiceAccess(first.room, first.who).ok) return ack({ ok: false, error: voiceAccess(first.room, first.who).error });
      const ice = await iceServers();
      // The room may have moved on while the TURN credentials were fetched.
      const c = ctx();
      if (!c) return ack({ ok: false, error: "err.notInRoom" });
      const access = voiceAccess(c.room, c.who);
      if (!access.ok) return ack({ ok: false, error: access.error });
      const peer: VoicePeer = {
        socketId: socket.id,
        from: fromKey(c.who),
        muted: access.listenOnly || p.muted !== false,
        listenOnly: access.listenOnly,
      };
      const others = [...c.s.voice.values()].filter((v) => v.socketId !== socket.id);
      c.s.voice.set(socket.id, peer);
      socket.to(channel(c.room.code)).emit("voice:peer-joined", peer);
      ack({ ok: true, self: peer, peers: others, iceServers: ice });
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

  /**
   * Called after every room change: ends the call when the phase no longer allows
   * voice, and mutes anyone who may only listen now (e.g. not on the stand, or dead).
   */
  function afterChange(room: Room) {
    const s = social.get(room.code);
    if (!s || !s.voice.size) return;
    if (!voiceAccess(room, { kind: "host" }).ok) {
      s.voice.clear();
      io.to(channel(room.code)).emit("voice:end");
      return;
    }
    for (const peer of s.voice.values()) {
      const who: Speaker = peer.from === "host" ? { kind: "host" } : { kind: "player", playerId: peer.from };
      const access = voiceAccess(room, who);
      const listenOnly = !access.ok || access.listenOnly;
      if (listenOnly === peer.listenOnly) continue;
      peer.listenOnly = listenOnly;
      if (listenOnly) peer.muted = true;
      io.to(channel(room.code)).emit("voice:peer-state", peer);
    }
  }

  /** Shows or hides "… is typing" for a bot. */
  function typing(room: Room, playerId: string, on: boolean) {
    io.to(channel(room.code)).emit("chat:typing", { from: playerId, on });
  }

  /** Posts a chat line on behalf of a bot (server-side, no socket). */
  function postAs(room: Room, playerId: string, raw: string) {
    const text = sanitizeChat(raw);
    if (!text) return;
    const s = of(room.code);
    const msg: ChatMessage = { id: randomId(10), from: playerId, text, t: Date.now(), ...chatStage(room) };
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
    s.ghost = [];
    s.strokes = [];
    s.lastChat.clear();
    io.to(channel(code)).emit("chat:clear");
    io.to(channel(code)).emit("ghost:clear");
    io.to(channel(code)).emit("board:clear");
  }

  /** The room's recent chat (for the AI bots' context). */
  const recentChat = (code: string) => social.get(code)?.chat ?? [];

  return { register, afterChange, dispose, postAs, typing, recentChat, clearForNewGame };
}
