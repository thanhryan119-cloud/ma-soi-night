// Ma Sói Online — authoritative realtime server (Socket.IO).
// Holds every room in memory, validates every action through the shared engine,
// and sends each socket only the view it is allowed to see.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { Server, type Socket } from "socket.io";
import {
  ROOM_TTL_MS,
  addPlayer,
  createRoom,
  getPlayer,
  hostAction,
  makeRoomCode,
  playerAction,
} from "../shared/engine";
import { botDecide } from "../shared/bots";
import { buildView, type Viewer } from "../shared/views";
import type { ActionResult, HostAction, Locale, PlayerAction, Room } from "../shared/types";

// Port priority: --port CLI flag (used by `npm run dev`) > SOCKET_PORT > PORT (Railway/Render) > 4000
const argPort = process.argv.indexOf("--port");
const PORT =
  Number(argPort > -1 ? process.argv[argPort + 1] : NaN) ||
  Number(process.env.SOCKET_PORT) ||
  Number(process.env.PORT) ||
  4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? "*";

const rooms = new Map<string, Room>();
const botTimers = new Map<string, NodeJS.Timeout>();

// ---------------------------------------------------------------------------
// Persistence: rooms are snapshotted to a JSON file so a server restart
// (crash, redeploy, `tsx watch` reload) does not end the games in progress.
// ---------------------------------------------------------------------------
const DATA_FILE = process.env.DATA_FILE || join(process.cwd(), ".data", "rooms.json");
let saveTimer: NodeJS.Timeout | null = null;

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      const tmp = `${DATA_FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify([...rooms.values()]));
      renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.error("[persist] save failed", err);
    }
  }, 1000);
}

function loadRooms() {
  try {
    if (!existsSync(DATA_FILE)) return;
    const list = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Room[];
    const now = Date.now();
    for (const room of list) {
      if (now - room.lastActivity > ROOM_TTL_MS) continue;
      for (const p of room.players) p.connected = p.isBot;
      rooms.set(room.code, room);
    }
    console.log(`[persist] restored ${rooms.size} room(s)`);
  } catch (err) {
    console.error("[persist] load failed", err);
  }
}
loadRooms();

interface SocketData {
  code?: string;
  kind?: Viewer;
  playerId?: string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Events = Record<string, (...args: any[]) => void>;
type AppSocket = Socket<Events, Events, Events, SocketData>;
type Ack = (res: ActionResult & Record<string, unknown>) => void;

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  return out;
}

const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  if (req.url === "/info") return res.end(JSON.stringify({ lan: lanAddresses(), port: PORT }));
  res.statusCode = 404;
  res.end(JSON.stringify({ ok: false }));
});

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
  pingInterval: 10_000,
  pingTimeout: 8_000,
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
});

const channel = (code: string) => `room:${code}`;
const normCode = (code: unknown) => String(code ?? "").trim().toUpperCase().slice(0, 8);
const safeAck = (ack: unknown): Ack => (typeof ack === "function" ? (ack as Ack) : () => {});

function broadcast(room: Room) {
  const ids = io.sockets.adapter.rooms.get(channel(room.code));
  if (!ids) return;
  for (const id of ids) {
    const s = io.sockets.sockets.get(id) as AppSocket | undefined;
    if (!s?.data.kind) continue;
    s.emit("state", buildView(room, s.data.kind, s.data.playerId ?? null));
  }
}

function touch(room: Room) {
  room.lastActivity = Date.now();
  broadcast(room);
  scheduleBots(room);
  saveSoon();
}

/** One bot acts per tick, with a human-ish delay, until no bot has anything to do. */
function scheduleBots(room: Room) {
  if (botTimers.has(room.code)) return;
  const bots = room.players.filter((p) => p.isBot);
  if (!bots.length || !room.game) return;
  const ready = bots.filter((b) => botDecide(room, b.id));
  if (!ready.length) return;
  const delay = 600 + Math.random() * 1200;
  botTimers.set(
    room.code,
    setTimeout(() => {
      botTimers.delete(room.code);
      if (!rooms.has(room.code)) return;
      const bot = ready[Math.floor(Math.random() * ready.length)];
      const action = botDecide(room, bot.id);
      if (action && playerAction(room, bot.id, action).ok) touch(room);
      else scheduleBots(room);
    }, delay),
  );
}

function setConnected(room: Room, playerId: string) {
  const ids = io.sockets.adapter.rooms.get(channel(room.code)) ?? new Set();
  const online = [...ids].some((id) => (io.sockets.sockets.get(id) as AppSocket | undefined)?.data.playerId === playerId);
  const p = getPlayer(room, playerId);
  if (p && !p.isBot && p.connected !== online) {
    p.connected = online;
    broadcast(room);
  }
}

function attach(socket: AppSocket, room: Room, kind: Viewer, playerId?: string) {
  if (socket.data.code && socket.data.code !== room.code) socket.leave(channel(socket.data.code));
  socket.data = { code: room.code, kind, playerId };
  socket.join(channel(room.code));
}

function guard(fn: () => ActionResult & Record<string, unknown>, ack: Ack) {
  try {
    ack(fn());
  } catch (err) {
    console.error(err);
    ack({ ok: false, error: "err.server" });
  }
}

io.on("connection", (raw) => {
  const socket = raw as AppSocket;
  const on = (event: string, handler: (payload: Record<string, unknown>, ack: Ack) => void) =>
    socket.on(event, (payload: unknown, ack: unknown) =>
      handler((payload ?? {}) as Record<string, unknown>, safeAck(ack)));

  on("room:check", (p, ack) => {
    const room = rooms.get(normCode(p.code));
    ack(room ? { ok: true, phase: room.phase.kind, locale: room.locale } : { ok: false, error: "err.roomNotFound" });
  });

  on("host:create", (p, ack) =>
    guard(() => {
      const locale: Locale = p.locale === "en" ? "en" : "vi";
      const room = createRoom(makeRoomCode((c) => rooms.has(c)), locale);
      rooms.set(room.code, room);
      attach(socket, room, "host");
      touch(room);
      console.log(`[room ${room.code}] created`);
      return { ok: true, code: room.code, hostToken: room.hostToken };
    }, ack),
  );

  on("host:resume", (p, ack) =>
    guard(() => {
      const room = rooms.get(normCode(p.code));
      if (!room) return { ok: false, error: "err.roomNotFound" };
      if (p.hostToken !== room.hostToken) return { ok: false, error: "err.notHost" };
      attach(socket, room, "host");
      touch(room);
      return { ok: true };
    }, ack),
  );

  on("screen:watch", (p, ack) =>
    guard(() => {
      const room = rooms.get(normCode(p.code));
      if (!room) return { ok: false, error: "err.roomNotFound" };
      attach(socket, room, "screen");
      socket.emit("state", buildView(room, "screen"));
      return { ok: true };
    }, ack),
  );

  on("player:join", (p, ack) =>
    guard(() => {
      const room = rooms.get(normCode(p.code));
      if (!room) return { ok: false, error: "err.roomNotFound" };
      const res = addPlayer(room, {
        name: String(p.name ?? ""),
        avatar: String(p.avatar ?? ""),
        locale: p.locale === "en" ? "en" : "vi",
      });
      if (!res.ok || !res.player) return { ok: false, error: res.error, params: res.params };
      res.player.connected = true;
      attach(socket, room, "player", res.player.id);
      touch(room);
      return { ok: true, playerId: res.player.id, token: res.player.token };
    }, ack),
  );

  on("player:resume", (p, ack) =>
    guard(() => {
      const room = rooms.get(normCode(p.code));
      if (!room) return { ok: false, error: "err.roomNotFound" };
      const player = getPlayer(room, String(p.playerId ?? ""));
      if (!player || player.token !== p.token) return { ok: false, error: "err.sessionExpired" };
      attach(socket, room, "player", player.id);
      player.connected = true;
      touch(room);
      return { ok: true, playerId: player.id, locale: player.locale };
    }, ack),
  );

  on("player:action", (p, ack) =>
    guard(() => {
      const { code, kind, playerId } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room || kind !== "player" || !playerId) return { ok: false, error: "err.notInRoom" };
      const res = playerAction(room, playerId, p as unknown as PlayerAction);
      if (res.ok) touch(room);
      return res as ActionResult & Record<string, unknown>;
    }, ack),
  );

  on("host:action", (p, ack) =>
    guard(() => {
      const { code, kind } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room || kind !== "host") return { ok: false, error: "err.notHost" };
      const action = p as unknown as HostAction;
      const kickedId = action.type === "kick" ? action.playerId : null;
      const res = hostAction(room, action);
      if (res.ok && kickedId) {
        for (const id of io.sockets.adapter.rooms.get(channel(room.code)) ?? []) {
          const s = io.sockets.sockets.get(id) as AppSocket | undefined;
          if (s?.data.playerId === kickedId) {
            s.emit("kicked");
            s.leave(channel(room.code));
            s.data = {};
          }
        }
      }
      if (res.ok) touch(room);
      return res as ActionResult & Record<string, unknown>;
    }, ack),
  );

  socket.on("disconnect", () => {
    const { code, playerId } = socket.data;
    const room = code ? rooms.get(code) : undefined;
    if (room && playerId) setTimeout(() => setConnected(room, playerId), 0);
  });
});

// Rooms self-destruct after 12 hours of inactivity.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      io.to(channel(code)).emit("roomClosed");
      io.in(channel(code)).socketsLeave(channel(code));
      clearTimeout(botTimers.get(code));
      botTimers.delete(code);
      rooms.delete(code);
      saveSoon();
      console.log(`[room ${code}] expired`);
    }
  }
}, 5 * 60 * 1000).unref();

for (const room of rooms.values()) scheduleBots(room);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🐺 Ma Sói Online socket server on :${PORT}`);
  const lan = lanAddresses();
  if (lan.length) console.log(`   LAN: ${lan.map((a) => `http://${a}:${PORT}`).join("  ")}`);
});
