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
  advance,
  autoReady,
  createRoom,
  getPlayer,
  hostAction,
  log,
  makeRoomCode,
  playerAction,
  randomToken,
  stepKey,
  timerOp,
} from "../shared/engine";
import { botDecide } from "../shared/bots";
import { DEFAULT_BOT_SPEED } from "../shared/roles";
import { botChatLine, botDefenseLine, newBotChatMemory, type BotChatMemory } from "../shared/botChat";
import { ingestChat, newChatIntel, type ChatIntel } from "../shared/botIntel";
import { createAiBots } from "./aiBots";
import { createAccounts } from "./accounts";
import { createSocial } from "./social";
import { gameResults, type PublicProfile } from "../shared/stats";
import {
  AWAY_LIMIT_MS,
  cleanPassword,
  gameRunning,
  isOwner,
  leaveRoom,
  makeMachineRoom,
  nextOwner,
  ownerAction,
  type LeaveResult,
} from "../shared/multiplayer";
import { checkPassword, createLobby, hashPassword } from "./lobby";
import type { OwnerAction } from "../shared/types";
import { REJOIN_TTL_MS, buildView, type Viewer } from "../shared/views";
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
// Local dev: pick up GEMINI_API_KEY etc. from .env (Node 20.12+); production uses real env vars.
try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
} catch {
  /* no .env file */
}

const botTimers = new Map<string, NodeJS.Timeout>();
const autoTimers = new Map<string, { key: string; timer: NodeJS.Timeout }>();
const AUTO_DELAY_MS = 3000;
const botChatTimers = new Map<string, NodeJS.Timeout>();
const botChatMemory = new Map<string, BotChatMemory>();
const BOT_LINES_PER_DAY = 3;

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
const accounts = createAccounts(dirname(DATA_FILE), CORS_ORIGIN);
if (!accounts.enabled) console.log("[accounts] GOOGLE_CLIENT_ID not set: Google sign-in disabled");

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

const httpServer = createServer(async (req, res) => {
  if (await accounts.handle(req, res)) return;
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

/** Sockets currently watching a room. */
function roomSockets(code: string): AppSocket[] {
  const ids = io.sockets.adapter.rooms.get(channel(code)) ?? new Set<string>();
  return [...ids].map((id) => io.sockets.sockets.get(id) as AppSocket | undefined).filter((s): s is AppSocket => !!s);
}

/** The online lobby: people not in a room yet, and the listed rooms someone is still in. */
const lobby = createLobby(io, {
  rooms: () => rooms.values(),
  isAlive: (room) =>
    room.players.some((p) => !p.isBot && p.connected) || (!room.machineHost && roomSockets(room.code).some((s) => s.data.kind === "host")),
  accountFor: (token) => {
    const u = accounts.userForToken(token);
    return u ? { id: u.id, avatarUrl: u.avatarUrl } : null;
  },
});
/** What bots have read in the chat, per game (a new game starts fresh). */
const chatIntel = new WeakMap<object, ChatIntel>();
function intelFor(room: Room): ChatIntel {
  const game = room.game;
  if (!game) return newChatIntel();
  let i = chatIntel.get(game);
  if (!i) chatIntel.set(game, (i = newChatIntel()));
  return i;
}
const social = createSocial(io, (code) => rooms.get(code), channel, (room, fromId, text) => {
  if (!room.game) return;
  ingestChat(room, intelFor(room), fromId, text);
  ai.onHumanChat(room, fromId, text);
});
/** Bots that read the chat and answer with Gemini (only when GEMINI_API_KEY is set). */
const ai = createAiBots({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  recentChat: (room) => social.recentChat(room.code),
  post: (room, botId, text) => social.postAs(room, botId, text),
  canTalk: (room) => room.phase.kind === "discussion" && rooms.get(room.code) === room,
});
console.log(`[ai] chat bots ${ai.enabled ? "ON (Gemini)" : "off — set GEMINI_API_KEY to enable"}`);
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

/** Adds a finished game to the signed-in players' stats, exactly once per game. */
function recordStats(room: Room) {
  const game = room.game;
  if (!game || game.statsRecorded || room.phase.kind !== "gameOver" || !game.winner) return;
  game.statsRecorded = true;
  try {
    accounts.recordGame(gameResults(room));
  } catch (err) {
    console.error("[stats] record failed", err);
  }
}

function touch(room: Room) {
  room.lastActivity = Date.now();
  recordStats(room);
  scheduleAuto(room);
  broadcast(room);
  social.afterChange(room);
  scheduleBots(room);
  scheduleBotChat(room);
  lobby.changed();
  saveSoon();
}

/**
 * During the day discussion, bots talk in the chat: one line every few
 * seconds from a random living bot, at most a few lines each per day.
 */
/** During the defense only bots on the stand talk: two lines of defence, then they end it. */
const botDefenseSaid = new Map<string, number>();
function scheduleBotDefense(room: Room) {
  const game = room.game!;
  const done = game.defenseDone ?? [];
  const speakers = room.players.filter((p) => p.isBot && p.alive && game.nominees.includes(p.id) && !done.includes(p.id));
  if (!speakers.length) return;
  botChatTimers.set(
    room.code,
    setTimeout(async () => {
      if (rooms.get(room.code) !== room || room.phase.kind !== "defense") return botChatTimers.delete(room.code);
      const bot = speakers[0];
      const key = `${room.code}:${room.phase.day}:${bot.id}`;
      const said = botDefenseSaid.get(key) ?? 0;
      const line = said < 2 ? ((await ai.defend(room, bot, said)) ?? botDefenseLine(room, bot, said, intelFor(room))) : null;
      botChatTimers.delete(room.code);
      if (rooms.get(room.code) !== room || room.phase.kind !== "defense") return;
      if (line) {
        botDefenseSaid.set(key, said + 1);
        social.postAs(room, bot.id, line);
        scheduleBotChat(room);
      } else if (playerAction(room, bot.id, { type: "endDefense" }).ok) touch(room);
    }, botDelay(room, 3000 + Math.random() * 3000)),
  );
}

function scheduleBotChat(room: Room) {
  if (room.phase.kind === "defense" && room.game) {
    if (!botChatTimers.has(room.code)) scheduleBotDefense(room);
    return;
  }
  if (room.phase.kind !== "discussion" || !room.game) {
    const t = botChatTimers.get(room.code);
    if (t) clearTimeout(t);
    botChatTimers.delete(room.code);
    return;
  }
  if (botChatTimers.has(room.code)) return;
  let mem = botChatMemory.get(room.code);
  if (!mem || mem.day !== room.phase.day) {
    const claims = mem?.claims ?? {};
    mem = { ...newBotChatMemory(), claims, day: room.phase.day };
    botChatMemory.set(room.code, mem);
  }
  const m = mem;
  const talkers = room.players.filter((p) => p.isBot && p.alive && (m.said[p.id] ?? 0) < BOT_LINES_PER_DAY);
  if (!talkers.length) return;
  botChatTimers.set(
    room.code,
    setTimeout(() => {
      botChatTimers.delete(room.code);
      if (rooms.get(room.code) !== room) return;
      if (room.phase.kind !== "discussion") return scheduleBotChat(room);
      const bot = talkers[Math.floor(Math.random() * talkers.length)];
      const line = botChatLine(room, bot, m, intelFor(room));
      if (line) social.postAs(room, bot.id, line);
      scheduleBotChat(room);
    }, botDelay(room, 2500 + Math.random() * 4500)),
  );
}

/**
 * Auto narrator: when the host turned it on and the current step has been
 * confirmed, move on by itself after a 3-second pause. Any change of step
 * (including the host pressing Next) cancels the pending move.
 */
interface StepTiming {
  key: string;
  startedAt: number;
  /** Night steps last at least this long, so a fast, slow or dead role sounds the same. */
  minMs: number;
  /** When the host finished reading this step's narration (null while still reading). */
  narratedAt: number | null;
  confirmedAt: number | null;
}
const stepTiming = new Map<string, StepTiming>();
const NIGHT_MIN_MS: [number, number] = [12_000, 20_000];
/** If the host never reports the narration (tab closed), assume it took this long. */
const NARRATION_FALLBACK_MS = 20_000;
const VOTE_SECONDS = 60;
/** Time to look at your role card before the first night. */
const ROLE_REVEAL_MS = 15_000;
/** Pause after reading a result (dawn, nomination, verdict, winner) before moving on. */
const AFTER_READING_MS = 2_000;
/** Machine-host rooms: how long the phones get to read each step's narration. */
const MACHINE_READ_MS = 6_000;
/** Machine-host rooms: how long the owner may be offline before someone else takes over. */
const OWNER_GRACE_MS = 30_000;

function timingFor(room: Room): StepTiming {
  const key = stepKey(room);
  let st = stepTiming.get(room.code);
  if (!st || st.key !== key) {
    const [lo, hi] = NIGHT_MIN_MS;
    st = {
      key,
      startedAt: Date.now(),
      minMs: room.phase.kind === "night" ? lo + Math.random() * (hi - lo) : 0,
      // Nobody reads aloud in a machine-host room: give every phone a moment to read the narration.
      narratedAt: room.machineHost ? Date.now() + MACHINE_READ_MS : null,
      confirmedAt: null,
    };
    stepTiming.set(room.code, st);
    // Votes get a countdown in auto mode; when it runs out, missing votes count as random.
    const k = room.phase.kind;
    if (room.settings.autoAdvance && (k === "nominate" || k === "verdict") && !room.timer.running && !room.timer.durationMs) {
      timerOp(room, "start", VOTE_SECONDS);
    }
  }
  return st;
}

/** When the running timer (discussion, defense, votes) hits zero, or null while paused/none. */
function timerEndsAt(room: Room, now: number): number | null {
  const t = room.timer;
  if (!t.durationMs) return null;
  if (t.running) return t.endsAt;
  return t.remainingMs <= 0 ? now : null;
}

/**
 * When the auto narrator may move on from the current step (before the final
 * 3-second countdown), or null when it must keep waiting. It always waits for
 * the narration to be read aloud, then:
 * - role reveal: a moment to look at your card;
 * - night: the role confirmed (dead/offline roles count as confirmed), and
 *   never sooner than a random minimum, so speed or a dead role can't be heard;
 * - dawn / results / winner: a short pause after reading;
 * - discussion / defense: the timer runs out;
 * - votes: everyone voted, or the vote timer runs out;
 * - hunter: the shot (an offline hunter is skipped).
 */
function dueAt(room: Room, st: StepTiming, now: number): number | null {
  const game = room.game;
  if (!game) return null;
  const read = st.narratedAt ?? st.startedAt + NARRATION_FALLBACK_MS;
  const kind = room.phase.kind;
  if (game.pendingWin && kind !== "night") return read + AFTER_READING_MS;
  const confirmed = autoReady(room) ? (st.confirmedAt ??= now) : ((st.confirmedAt = null), null);
  switch (kind) {
    case "roleReveal":
      return Math.max(read, st.startedAt + ROLE_REVEAL_MS);
    case "night":
      // Never before the role confirmed (a dead or offline role counts as confirmed).
      return confirmed === null ? null : Math.max(read, confirmed, st.startedAt + st.minMs);
    case "dawn":
    case "nominateResult":
    case "verdictResult":
      return read + AFTER_READING_MS;
    case "hunter":
      return confirmed === null ? null : Math.max(read, confirmed);
    case "discussion":
    case "defense": {
      const end = timerEndsAt(room, now);
      return end === null ? null : Math.max(read, end);
    }
    case "nominate":
    case "verdict": {
      const end = confirmed ?? timerEndsAt(room, now);
      return end === null ? null : Math.max(read, end);
    }
    default:
      return null;
  }
}

/** Takes the next step on the host's behalf. */
function autoStep(room: Room): boolean {
  const game = room.game;
  if (!game) return false;
  if (game.pendingWin && room.phase.kind !== "night") return hostAction(room, { type: "confirmWin" }).ok;
  return advance(room).ok;
}

/**
 * Auto narrator: runs the whole game once the host has started it. Each step
 * moves on 3 seconds after it is due (see dueAt). The 3-second countdown
 * (room.autoAt) only shows once everything else is satisfied.
 */
function scheduleAuto(room: Room) {
  const pending = autoTimers.get(room.code);
  if (pending) {
    clearTimeout(pending.timer);
    autoTimers.delete(room.code);
  }
  room.autoAt = null;
  if (!room.settings.autoAdvance || !room.game || room.phase.kind === "gameOver") return;
  const st = timingFor(room);
  const now = Date.now();
  const due = dueAt(room, st, now);
  // Nothing to wait for yet (e.g. a paused timer): look again in a few seconds.
  const goAt = due === null ? null : due + AUTO_DELAY_MS;
  const key = st.key;
  if (goAt === null || now < goAt - AUTO_DELAY_MS) {
    const wait = goAt === null ? 2_000 : goAt - AUTO_DELAY_MS - now;
    autoTimers.set(room.code, {
      key,
      timer: setTimeout(() => {
        autoTimers.delete(room.code);
        if (rooms.get(room.code) !== room) return;
        scheduleAuto(room);
        if (room.autoAt) broadcast(room);
      }, Math.max(250, wait)),
    });
    return;
  }
  room.autoAt = goAt;
  autoTimers.set(room.code, {
    key,
    timer: setTimeout(() => {
      autoTimers.delete(room.code);
      room.autoAt = null;
      if (rooms.get(room.code) !== room) return;
      if (room.settings.autoAdvance && stepKey(room) === key && autoStep(room)) touch(room);
      else {
        scheduleAuto(room);
        broadcast(room);
      }
    }, Math.max(0, goAt - now)),
  });
}

/** Bot pauses, shortened by the room's bot speed (×2 by default; older rooms without the setting too). */
const botDelay = (room: Room, ms: number) => ms / (room.settings.botSpeed || DEFAULT_BOT_SPEED);

/** One bot acts per tick, with a human-ish delay, until no bot has anything to do. */
function scheduleBots(room: Room) {
  if (botTimers.has(room.code)) return;
  const bots = room.players.filter((p) => p.isBot);
  if (!bots.length || !room.game) return;
  const ready = bots.filter((b) => botDecide(room, b.id, intelFor(room)));
  if (!ready.length) return;
  const delay = botDelay(room, 600 + Math.random() * 1200);
  botTimers.set(
    room.code,
    setTimeout(() => {
      botTimers.delete(room.code);
      if (!rooms.has(room.code)) return;
      const bot = ready[Math.floor(Math.random() * ready.length)];
      const action = botDecide(room, bot.id, intelFor(room));
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
    lobby.changed();
    if (!online && isOwner(room, p.id)) scheduleOwnerHandover(room, p.id);
    if (!online) scheduleAwayKick(room, p.id);
  }
}

/** One pending "away too long" check per offline player. */
const awayTimers = new Map<string, NodeJS.Timeout>();

/**
 * A player went offline during a game: if the room kicks absent players and
 * they are still gone after 5 minutes, they are out for good and a bot plays
 * their seat (a loss in their stats).
 */
/** How long a player may be offline during a game (AWAY_LIMIT_MS env to change it, e.g. for testing). */
const AWAY_MS = Number(process.env.AWAY_LIMIT_MS) || AWAY_LIMIT_MS;

function scheduleAwayKick(room: Room, playerId: string, delay = AWAY_MS) {
  if (!room.settings.autoKickAway || !gameRunning(room)) return;
  const key = `${room.code}:${playerId}`;
  clearTimeout(awayTimers.get(key));
  const game = room.game;
  awayTimers.set(
    key,
    setTimeout(() => {
      awayTimers.delete(key);
      const p = getPlayer(room, playerId);
      if (rooms.get(room.code) !== room || room.game !== game || !p || p.isBot || p.connected) return;
      if (!room.settings.autoKickAway || !gameRunning(room)) return;
      const res = leaveRoom(room, playerId, "away");
      if (!res.ok) return;
      recordAbandon(res);
      console.log(`[room ${room.code}] ${p.name} was away too long: a bot takes the seat`);
      touch(room);
    }, delay),
  );
  awayTimers.get(key)!.unref();
}

/** Adds a left game to the player's stats as a loss. */
function recordAbandon(res: LeaveResult) {
  if (!res.abandon) return;
  try {
    accounts.recordGame([res.abandon]);
  } catch (err) {
    console.error("[stats] abandon failed", err);
  }
}

/** The owner of a machine-host room went offline: after a grace period, the next player takes over. */
function scheduleOwnerHandover(room: Room, ownerId: string) {
  setTimeout(() => {
    if (rooms.get(room.code) !== room || room.ownerId !== ownerId) return;
    if (getPlayer(room, ownerId)?.connected) return;
    const next = nextOwner(room);
    if (!next) return;
    room.ownerId = next;
    log(room, "log.ownerChanged", { name: getPlayer(room, next)!.name });
    touch(room);
  }, OWNER_GRACE_MS).unref();
}

/** Sends a kicked player's sockets away from the room. */
function kickSockets(room: Room, playerId: string) {
  for (const s of roomSockets(room.code)) {
    if (s.data.playerId === playerId) {
      s.emit("kicked");
      s.leave(channel(room.code));
      s.data = {};
    }
  }
}

function attach(socket: AppSocket, room: Room, kind: Viewer, playerId?: string) {
  lobby.leave(socket);
  if (socket.data.code && socket.data.code !== room.code) socket.leave(channel(socket.data.code));
  socket.data = { code: room.code, kind, playerId };
  socket.join(channel(room.code));
}

// --- Rejoining a running game ------------------------------------------------

/** Seats someone could come back to: humans who are offline while a game runs. */
function rejoinable(room: Room) {
  if (room.phase.kind === "lobby" || !room.game) return [];
  return room.players.filter((p) => !p.isBot && !p.connected).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }));
}
/** `${code}:${playerId}` -> the socket waiting for the host's answer. */
const rejoinSockets = new Map<string, string>();
function dropRejoinRequest(room: Room, playerId: string) {
  room.rejoinRequests = (room.rejoinRequests ?? []).filter((r) => r.playerId !== playerId && r.t > Date.now() - REJOIN_TTL_MS);
  rejoinSockets.delete(`${room.code}:${playerId}`);
}
/** Gives the seat a fresh token (the old phone's session stops working). */
function grantSeat(room: Room, playerId: string): string {
  const p = getPlayer(room, playerId)!;
  p.token = randomToken();
  dropRejoinRequest(room, playerId);
  return p.token;
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
  social.register(raw);
  lobby.register(raw);
  const on = (event: string, handler: (payload: Record<string, unknown>, ack: Ack) => void) =>
    socket.on(event, (payload: unknown, ack: unknown) =>
      handler((payload ?? {}) as Record<string, unknown>, safeAck(ack)));

  on("room:check", (p, ack) => {
    const room = rooms.get(normCode(p.code));
    ack(
      room
        ? { ok: true, phase: room.phase.kind, locale: room.locale, rejoinable: rejoinable(room), locked: !!room.passwordHash }
        : { ok: false, error: "err.roomNotFound" },
    );
  });

  // Online lobby: make a room. With the machine as host the creator joins as
  // the room owner; otherwise they become the human host, as on the home page.
  on("lobby:createRoom", (p, ack) =>
    guard(() => {
      const locale: Locale = p.locale === "en" ? "en" : "vi";
      const profile = (p.profile ?? {}) as Record<string, unknown>;
      const user = accounts.userForToken(p.authToken);
      const name = String(profile.name ?? "") || user?.name || "";
      const room = createRoom(makeRoomCode((c) => rooms.has(c)), locale);
      room.listed = true;
      room.title = name.trim().slice(0, 24) || room.code;
      const password = p.withPassword ? cleanPassword(p.password) : null;
      room.passwordHash = password ? hashPassword(password) : null;
      if (p.settings && typeof p.settings === "object") hostAction(room, { type: "updateSettings", settings: p.settings as Partial<Room["settings"]> });

      if (!p.machine) {
        rooms.set(room.code, room);
        attach(socket, room, "host");
        touch(room);
        console.log(`[room ${room.code}] created from the lobby (human host)`);
        return { ok: true, code: room.code, hostToken: room.hostToken };
      }
      const res = addPlayer(room, {
        name,
        avatar: String(profile.avatar ?? ""),
        locale,
        avatarUrl: user?.avatarUrl ?? null,
        style: profile.style,
        userId: user?.id ?? null,
      });
      if (!res.ok || !res.player) return { ok: false, error: res.error, params: res.params };
      makeMachineRoom(room, res.player.id);
      res.player.connected = true;
      rooms.set(room.code, room);
      attach(socket, room, "player", res.player.id);
      touch(room);
      console.log(`[room ${room.code}] created from the lobby (machine host)`);
      return { ok: true, code: room.code, playerId: res.player.id, token: res.player.token };
    }, ack),
  );

  // The owner of a machine-host room sets it up (never sees roles).
  on("owner:action", (p, ack) =>
    guard(() => {
      const { code, kind, playerId } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room || kind !== "player" || !playerId) return { ok: false, error: "err.notInRoom" };
      const action = p as unknown as OwnerAction;
      const res = ownerAction(room, playerId, action);
      if (res.ok && action.type === "kick") kickSockets(room, action.playerId);
      if (res.ok && action.type === "newGame") social.clearForNewGame(room.code);
      if (res.ok) touch(room);
      return res as ActionResult & Record<string, unknown>;
    }, ack),
  );

  // Set or remove the room password (the host, or the owner of a machine-host room).
  on("room:setPassword", (p, ack) =>
    guard(() => {
      const { code, kind, playerId } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room) return { ok: false, error: "err.notInRoom" };
      if (kind !== "host" && !(kind === "player" && isOwner(room, playerId))) return { ok: false, error: "err.notOwner" };
      const password = p.withPassword ? cleanPassword(p.password) : null;
      if (p.withPassword && !password) return { ok: false, error: "err.passwordRequired" };
      room.passwordHash = password ? hashPassword(password) : null;
      touch(room);
      return { ok: true };
    }, ack),
  );

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
      if (!checkPassword(room.passwordHash, p.password))
        return { ok: false, error: p.password ? "err.wrongPassword" : "err.passwordRequired" };
      // Signed-in players get their photo from the account (never trusted from the client).
      const user = accounts.userForToken(p.authToken);
      const res = addPlayer(room, {
        name: String(p.name ?? "") || user?.name || "",
        avatar: String(p.avatar ?? ""),
        locale: p.locale === "en" ? "en" : "vi",
        avatarUrl: user?.avatarUrl ?? null,
        style: p.style,
        userId: user?.id ?? null,
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
      if (player && room.abandoned?.includes(player.id)) return { ok: false, error: "err.abandoned" };
      if (!player || player.token !== p.token) return { ok: false, error: "err.sessionExpired" };
      dropRejoinRequest(room, player.id);
      attach(socket, room, "player", player.id);
      player.connected = true;
      touch(room);
      return { ok: true, playerId: player.id, locale: player.locale };
    }, ack),
  );

  // Back into a running game from a new phone/tab: instant for the same Google
  // account, otherwise the host has to approve.
  on("player:rejoin", (p, ack) =>
    guard(() => {
      const room = rooms.get(normCode(p.code));
      if (!room) return { ok: false, error: "err.roomNotFound" };
      const player = getPlayer(room, String(p.playerId ?? ""));
      if (!player || !rejoinable(room).some((r) => r.id === player.id)) return { ok: false, error: "err.seatTaken" };
      const user = accounts.userForToken(p.authToken);
      if (user && player.userId && user.id === player.userId) {
        const token = grantSeat(room, player.id);
        touch(room);
        return { ok: true, playerId: player.id, token };
      }
      dropRejoinRequest(room, player.id);
      room.rejoinRequests = [...(room.rejoinRequests ?? []), { playerId: player.id, t: Date.now() }];
      rejoinSockets.set(`${room.code}:${player.id}`, socket.id);
      touch(room);
      return { ok: true, pending: true };
    }, ack),
  );

  on("host:rejoin", (p, ack) =>
    guard(() => {
      const { code, kind } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room || kind !== "host") return { ok: false, error: "err.notHost" };
      const playerId = String(p.playerId ?? "");
      const waiting = io.sockets.sockets.get(rejoinSockets.get(`${room.code}:${playerId}`) ?? "");
      const player = getPlayer(room, playerId);
      if (p.allow && player && !player.connected) waiting?.emit("rejoin:approved", { playerId, token: grantSeat(room, playerId) });
      else {
        dropRejoinRequest(room, playerId);
        waiting?.emit("rejoin:denied");
      }
      touch(room);
      return { ok: true };
    }, ack),
  );

  // Anyone in the room can open a player's profile card (from the avatar or the name).
  on("profile:get", (p, ack) =>
    guard(() => {
      const { code } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      const player = room ? getPlayer(room, String(p.playerId ?? "")) : undefined;
      if (!player) return { ok: false, error: "err.profileNotFound" };
      const account = player.isBot ? null : accounts.profileOf(player.userId);
      const profile: PublicProfile = {
        userId: account?.userId ?? null,
        // The name and look used in this room, the career from the account.
        name: player.name,
        avatar: player.avatar,
        avatarUrl: player.avatarUrl ?? null,
        style: player.style ?? null,
        isBot: player.isBot,
        memberSince: account?.memberSince ?? null,
        stats: account?.stats ?? null,
      };
      return { ok: true, profile };
    }, ack),
  );

  // Leave the room. During a game it is for good: a bot takes the seat and it counts as a loss.
  on("player:leave", (_p, ack) =>
    guard(() => {
      const { code, kind, playerId } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room || kind !== "player" || !playerId) return { ok: false, error: "err.notInRoom" };
      const res = leaveRoom(room, playerId, "left");
      if (!res.ok) return res as ActionResult & Record<string, unknown>;
      recordAbandon(res);
      clearTimeout(awayTimers.get(`${room.code}:${playerId}`));
      socket.leave(channel(room.code));
      socket.data = {};
      touch(room);
      return { ok: true, abandoned: !!res.abandon || !res.removed };
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

  // The host's voice-over started ({done:false}) or finished ({done:true}) reading the current step.
  on("host:narration", (p, ack) =>
    guard(() => {
      const { code, kind } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room || kind !== "host") return { ok: false, error: "err.notHost" };
      const st = timingFor(room);
      if (String(p.key ?? "") !== st.key) return { ok: true };
      st.narratedAt = p.done ? Date.now() : null;
      scheduleAuto(room);
      broadcast(room);
      return { ok: true };
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
      if (res.ok && kickedId) kickSockets(room, kickedId);
      if (res.ok && action.type === "newGame") social.clearForNewGame(room.code);
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
      social.dispose(code);
      lobby.changed();
      saveSoon();
      console.log(`[room ${code}] expired`);
    }
  }
}, 5 * 60 * 1000).unref();

for (const room of rooms.values()) {
  scheduleBots(room);
  // Restored games with the auto narrator would otherwise wait for a change that never comes.
  scheduleAuto(room);
  // After a restart, nobody is connected yet: give everyone the full 5 minutes to come back.
  for (const p of room.players) if (!p.isBot) scheduleAwayKick(room, p.id);
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🐺 Ma Sói Online socket server on :${PORT}`);
  const lan = lanAddresses();
  if (lan.length) console.log(`   LAN: ${lan.map((a) => `http://${a}:${PORT}`).join("  ")}`);
});
