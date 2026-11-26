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
  isSilenced,
  advance,
  AVATARS,
  autoReady,
  createRoom,
  getPlayer,
  hostAction,
  log,
  makeRoomCode,
  playerAction,
  randomToken,
  sanitizeName,
  fillVotesIfTimeUp,
  stepKey,
  timerOp,
  MAX_PLAYERS,
} from "../shared/engine";
import { botDecide, botTalks } from "../shared/bots";
import { DEFAULT_BOT_SPEED } from "../shared/roles";
import { botChatLine, botDefenseLine, botGameOverLine, botReplyLine, newBotChatMemory, type BotChatMemory } from "../shared/botChat";
import { linesPerDay, personaOf, typingMs } from "../shared/botPersona";
import { ingestChat, newChatIntel, type ChatIntel } from "../shared/botIntel";
import { createAiBots } from "./aiBots";
import { createAccounts } from "./accounts";
import { roleWins, tierReached, type AchievementNews } from "../shared/achievements";
import { lockedRolesAt } from "../shared/freeRoles";
import { payOSFromEnv } from "./payos";
import { createQuests } from "./quests";
import { createShop } from "./shop";
import { createSocial } from "./social";
import { createGlobalChat } from "./globalChat";
import { BUSY_TALK_CHANCE, tableBusy } from "../shared/social";
import { gameResults, type PublicProfile } from "../shared/stats";
import { gameRecord, newGameId } from "../shared/replay";
import { createGames } from "./games";
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
import type { ActionResult, HostAction, Locale, Player, PlayerAction, Room } from "../shared/types";

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
/** At night the countdown between role calls is shorter: nobody needs to get ready. */
const NIGHT_AUTO_DELAY_MS = 1500;
const botChatTimers = new Map<string, NodeJS.Timeout>();
const botChatMemory = new Map<string, BotChatMemory>();

// ---------------------------------------------------------------------------
// Persistence: rooms are snapshotted to a JSON file so a server restart
// (crash, redeploy, `tsx watch` reload) does not end the games in progress.
// ---------------------------------------------------------------------------
const DATA_FILE = process.env.DATA_FILE || join(process.cwd(), ".data", "rooms.json");
/** The rooms' chat is saved next to them, so a redeploy keeps the talk too. */
const CHAT_FILE = join(dirname(DATA_FILE), "room-chat.json");
let saveTimer: NodeJS.Timeout | null = null;
/** Set once the chat exists (further down). */
let chatSnapshot: (() => unknown) | null = null;

function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, file);
}

/** Writes the rooms and their chat to disk right now. */
function saveNow() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    writeJson(DATA_FILE, [...rooms.values()]);
    if (chatSnapshot) writeJson(CHAT_FILE, chatSnapshot());
  } catch (err) {
    console.error("[persist] save failed", err);
  }
}

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 1000);
}

// A redeploy stops the old server with SIGTERM: save everything before it goes.
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.once(sig, () => {
    console.log(`[persist] ${sig}: saving rooms and chat`);
    saveNow();
    process.exit(0);
  });

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
const shop = createShop({
  dataDir: dirname(DATA_FILE),
  corsOrigin: CORS_ORIGIN,
  payos: payOSFromEnv(),
  accounts,
  webUrl: process.env.PUBLIC_WEB_URL || undefined,
});
if (!shop.enabled) console.log("[shop] PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY not set: shop disabled");
const quests = createQuests({ dataDir: dirname(DATA_FILE), corsOrigin: CORS_ORIGIN, accounts });
const games = createGames(dirname(DATA_FILE), CORS_ORIGIN);

interface SocketData {
  code?: string;
  kind?: Viewer;
  playerId?: string;
  /** Set for a spectator: who they are in the dead players' chat. */
  spectator?: { id: string; name: string; avatar: string };
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
  if (await shop.handle(req, res)) return;
  if (await quests.handle(req, res)) return;
  if (await games.handle(req, res)) return;
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

/** Someone is in the room: a human player online, or the host of a human-host room. */
const roomAlive = (room: Room) =>
  room.players.some((p) => !p.isBot && p.connected) || (!room.machineHost && roomSockets(room.code).some((s) => s.data.kind === "host"));

/** The online lobby: people not in a room yet, and the listed rooms someone is still in. */
const lobby = createLobby(io, {
  rooms: () => rooms.values(),
  isAlive: roomAlive,
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
const globalChat = createGlobalChat(io, {
  dataDir: dirname(DATA_FILE),
  accountFor: (token) => {
    const u = accounts.userForToken(token);
    return u ? accounts.publicUser(u) : null;
  },
  userById: (id) => accounts.userById(id),
  // Two players of one running game must not talk privately (a wolf telling a friend).
  sameRunningGame: (a, b) => {
    for (const room of rooms.values()) {
      if (!room.game || room.phase.kind === "lobby" || room.phase.kind === "gameOver") continue;
      const seated = (id: string) => room.players.some((p) => !p.isBot && p.userId === id);
      if (seated(a) && seated(b)) return true;
    }
    return false;
  },
  // Invites go into the room the inviter is in, while it still waits for players.
  inviteRoom: (socket, to) => {
    const { code, kind } = (socket as AppSocket).data;
    const room = code ? rooms.get(code) : undefined;
    if (!room || (kind !== "player" && kind !== "host")) return { error: "err.inviteNoRoom" };
    if (room.phase.kind !== "lobby") return { error: "err.inviteStarted" };
    if (room.players.length >= MAX_PLAYERS) return { error: "err.inviteFull" };
    if (room.players.some((p) => !p.isBot && p.userId === to && !room.abandoned?.includes(p.id))) return { error: "err.inviteAlreadyIn" };
    return { code: room.code };
  },
});
const social = createSocial(io, (code) => rooms.get(code), channel, (room, fromId, text) => {
  if (!room.game) return;
  ingestChat(room, intelFor(room), fromId, text);
  ai.onHumanChat(room, fromId, text);
  botsReplyTo(room, fromId, text);
}, saveSoon);
chatSnapshot = social.snapshot;
// Chat from before a restart or redeploy comes back with its room.
try {
  if (existsSync(CHAT_FILE)) console.log(`[persist] restored chat for ${social.restore(JSON.parse(readFileSync(CHAT_FILE, "utf8")))} room(s)`);
} catch (err) {
  console.error("[persist] chat load failed", err);
}
/** Bots that read the chat and answer with Gemini (only when GEMINI_API_KEY is set). */
const ai = createAiBots({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  recentChat: (room) => social.recentChat(room.code),
  intel: (room) => intelFor(room),
  post: (room, botId, text) => {
    const bot = room.players.find((p) => p.id === botId);
    const day = room.phase.day;
    if (bot) typeThenPost(room, bot, text, () => room.phase.kind === "discussion" && room.phase.day === day && bot.alive);
  },
  canTalk: (room) => room.phase.kind === "discussion" && rooms.get(room.code) === room,
});
console.log(`[ai] chat bots ${ai.enabled ? "ON (Gemini)" : "off — set GEMINI_API_KEY to enable"}`);
const normCode = (code: unknown) => String(code ?? "").trim().toUpperCase().slice(0, 8);
const safeAck = (ack: unknown): Ack => (typeof ack === "function" ? (ack as Ack) : () => {});

/** Special roles the room cannot use today: not in the free rotation, and its creator has no card for them. */
function refreshLocks(room: Room) {
  room.lockedRoles = lockedRolesAt(Date.now(), room.creatorId ? accounts.ownedFor(room.creatorId) : []);
}

function broadcast(room: Room) {
  refreshLocks(room);
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
  game.recordId ??= newGameId();
  const results = gameResults(room);
  // Keep the whole story when someone signed in can open it again from their history.
  const record = results.length ? gameRecord(room, game.recordId) : null;
  if (record) {
    try {
      games.save(record);
    } catch (err) {
      console.error("[games] save failed", err);
    }
  }
  try {
    // Quests first: a player's first quest record starts from their stats before this game.
    quests.recordGame(results);
  } catch (err) {
    console.error("[quests] record failed", err);
  }
  const winsBefore = results.map((r) => roleWins(accounts.statsOf(r.userId), r.game.role));
  try {
    accounts.recordGame(results);
  } catch (err) {
    console.error("[stats] record failed", err);
  }
  // A role card that just went up a tier: tell that player, so their phone can show it off.
  results.forEach((r, i) => {
    const wins = roleWins(accounts.statsOf(r.userId), r.game.role);
    const tier = tierReached(winsBefore[i], wins);
    if (!tier) return;
    const news: AchievementNews = { role: r.game.role, tier, wins };
    for (const s of roomSockets(room.code)) {
      const p = room.players.find((q) => q.id === s.data.playerId);
      if (p && !p.isBot && p.userId === r.userId) s.emit("achievement", news);
    }
  });
}

/** Votes that already got their countdown (a revote is a new vote object). */
const timedVotes = new WeakSet<object>();
const voteTimers = new Map<string, NodeJS.Timeout>();

/**
 * Every vote, in every room, gets a countdown when it opens; when it ends,
 * whoever still hasn't voted votes at random (the host may pause or change it).
 */
function scheduleVotes(room: Room) {
  clearTimeout(voteTimers.get(room.code));
  voteTimers.delete(room.code);
  const vote = room.game?.vote;
  const k = room.phase.kind;
  if ((k !== "nominate" && k !== "verdict") || !vote || vote.closed) return;
  if (!timedVotes.has(vote)) {
    timedVotes.add(vote);
    if (!room.timer.running && !room.timer.durationMs) timerOp(room, "start", VOTE_SECONDS);
  }
  const end = room.timer.running ? room.timer.endsAt : null;
  if (!end) return; // paused: nothing runs out
  const timer = setTimeout(() => {
    voteTimers.delete(room.code);
    if (rooms.get(room.code) !== room || room.game?.vote !== vote) return;
    if (fillVotesIfTimeUp(room)) touch(room);
  }, Math.max(0, end - Date.now()) + 50);
  timer.unref();
  voteTimers.set(room.code, timer);
}

function touch(room: Room) {
  room.lastActivity = Date.now();
  scheduleVotes(room);
  scheduleStandIns(room);
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
 * Bots in the chat, paced like people: a bot "types" for as long as its line
 * would take a person at its own speed (shown as "… is typing"), chatty bots
 * jump in more often and quiet ones barely speak, and at most two type at
 * once. This runs in real time: the room's bot speed only hurries night
 * actions and votes, never the talk.
 */
const botTyping = new Map<string, Set<string>>();
const typingOf = (room: Room) => {
  let s = botTyping.get(room.code);
  if (!s) botTyping.set(room.code, (s = new Set()));
  return s;
};

/** A bot types `line` (or a line made when it finishes) and posts it, if the moment hasn't passed. */
function typeThenPost(room: Room, bot: Player, line: string, stillOk: () => boolean, after?: () => void) {
  const typing = typingOf(room);
  typing.add(bot.id);
  social.typing(room, bot.id, true);
  setTimeout(() => {
    typing.delete(bot.id);
    social.typing(room, bot.id, false);
    if (rooms.get(room.code) === room && stillOk()) social.postAs(room, bot.id, line);
    after?.();
  }, typingMs(line, personaOf(room, bot.id)));
}

function memoryFor(room: Room): BotChatMemory {
  let mem = botChatMemory.get(room.code);
  if (!mem || mem.day !== room.phase.day) {
    const verdicts = room.game?.verdicts.length ?? 0;
    mem = {
      ...newBotChatMemory(),
      claims: mem?.claims ?? {},
      fakeChecks: mem?.fakeChecks ?? {},
      told: mem?.told ?? {},
      day: room.phase.day,
      // Yesterday's verdict is new to react to; older ones were seen already.
      seenVerdicts: mem?.verdictsAtDayStart ?? 0,
      verdictsAtDayStart: verdicts,
    };
    botChatMemory.set(room.code, mem);
  }
  return mem;
}

/** During the defense only bots on the stand talk: two lines of defence, then they end it. */
const botDefenseSaid = new Map<string, number>();
function scheduleBotDefense(room: Room) {
  const game = room.game!;
  const done = game.defenseDone ?? [];
  const speakers = room.players.filter((p) => botTalks(p) && p.alive && !isSilenced(room, p.id) && game.nominees.includes(p.id) && !done.includes(p.id));
  if (!speakers.length) return;
  const bot = speakers[0];
  const onStand = () => room.phase.kind === "defense";
  botChatTimers.set(
    room.code,
    setTimeout(async () => {
      if (rooms.get(room.code) !== room || !onStand()) return botChatTimers.delete(room.code);
      const key = `${room.code}:${room.phase.day}:${bot.id}`;
      const said = botDefenseSaid.get(key) ?? 0;
      const line = said < 2 ? ((await ai.defend(room, bot, said)) ?? botDefenseLine(room, bot, said, intelFor(room))) : null;
      if (rooms.get(room.code) !== room || !onStand()) return botChatTimers.delete(room.code);
      if (!line) {
        botChatTimers.delete(room.code);
        if (playerAction(room, bot.id, { type: "endDefense" }).ok) touch(room);
        return;
      }
      botDefenseSaid.set(key, said + 1);
      typeThenPost(room, bot, line, onStand, () => {
        botChatTimers.delete(room.code);
        scheduleBotChat(room);
      });
    }, 1200 + Math.random() * 2000),
  );
}

/** Game over: a few bots say "gg" (winners cheer, losers sigh, a sneaky wolf gloats). */
const ggDone = new WeakSet<object>();
function scheduleGameOverChat(room: Room) {
  const game = room.game;
  if (!game || ggDone.has(game)) return;
  ggDone.add(game);
  const used = new Set<string>();
  for (const bot of room.players.filter(botTalks)) {
    if (Math.random() > 0.6) continue;
    const line = botGameOverLine(room, bot, Math.random, used);
    if (!line) continue;
    setTimeout(() => {
      if (rooms.get(room.code) === room && room.game === game) typeThenPost(room, bot, line, () => room.phase.kind === "gameOver" && room.game === game);
    }, 1500 + Math.random() * 9000);
  }
}

function scheduleBotChat(room: Room) {
  if (room.phase.kind === "gameOver") return scheduleGameOverChat(room);
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
  const mem = memoryFor(room);
  const typing = typingOf(room);
  const day = room.phase.day;
  const inDiscussion = () => room.phase.kind === "discussion" && room.phase.day === day;
  botChatTimers.set(
    room.code,
    setTimeout(() => {
      botChatTimers.delete(room.code);
      if (rooms.get(room.code) !== room) return;
      if (!inDiscussion()) return scheduleBotChat(room);
      const talkers = room.players.filter((p) => botTalks(p) && p.alive && !isSilenced(room, p.id) && !typing.has(p.id) && (mem.said[p.id] ?? 0) < linesPerDay(personaOf(room, p.id)));
      if (!talkers.length) return;
      // While people are talking fast, bots speak less often, but they still take part.
      const human = (from: string) => from === "host" || room.players.some((p) => p.id === from && !botTalks(p));
      const busy = tableBusy(social.recentChat(room.code), human, Date.now());
      if (typing.size < 2 && (!busy || Math.random() < BUSY_TALK_CHANCE)) {
        // Chatty bots are more likely to speak next.
        const weights = talkers.map((p) => personaOf(room, p.id).talk);
        let r = Math.random() * weights.reduce((a, b) => a + b, 0);
        const bot = talkers.find((_, i) => (r -= weights[i]) <= 0) ?? talkers[0];
        const line = botChatLine(room, bot, mem, intelFor(room));
        if (line) typeThenPost(room, bot, line, () => inDiscussion() && bot.alive);
      }
      scheduleBotChat(room);
    }, 1500 + Math.random() * 4500),
  );
}

/** Scripted bots answer the people who talk to them (when the AI bots are off). */
function botsReplyTo(room: Room, fromId: string, text: string) {
  const from = room.players.find((p) => p.id === fromId);
  if (!room.game || !from || botTalks(from) || room.phase.kind !== "discussion") return;
  if (ai.enabled && room.settings.aiBots !== false) return;
  const typing = typingOf(room);
  const lower = text.toLowerCase();
  const bots = room.players.filter((p) => botTalks(p) && p.alive && !isSilenced(room, p.id) && !typing.has(p.id));
  const named = bots.filter((b) => lower.includes(b.name.toLowerCase()));
  const responders = named.length ? named.slice(0, 2) : Math.random() < 0.55 ? [bots[Math.floor(Math.random() * bots.length)]].filter(Boolean) : [];
  const mem = memoryFor(room);
  const day = room.phase.day;
  for (const bot of responders) {
    const line = botReplyLine(room, bot, fromId, text, mem, intelFor(room));
    if (!line) continue;
    setTimeout(() => typeThenPost(room, bot, line, () => room.phase.kind === "discussion" && room.phase.day === day && bot.alive), 600 + Math.random() * 1800);
  }
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
/** Each night call lasts at least a random time in this range, so a quick (or dead) role can't be told apart. */
const NIGHT_MIN_MS: [number, number] = [6_000, 10_000];
/** If the host never reports the narration (tab closed), assume it took this long. */
const NARRATION_FALLBACK_MS = 20_000;
const VOTE_SECONDS = Number(process.env.VOTE_SECONDS) || 60;
/** Time to look at your role card before the first night. */
const ROLE_REVEAL_MS = 15_000;
/** Pause after reading a result (dawn, nomination, verdict, winner) before moving on. */
const AFTER_READING_MS = 2_000;
/**
 * Machine-host rooms: the least time the phones get for each step's narration.
 * The phones report how long the narration takes to read out (and when they
 * finished saying it), and the step waits for the longest, up to MACHINE_READ_MAX_MS.
 */
const MACHINE_READ_MS = 6_000;
/** Machine-host rooms: the longest a step waits for its narration. */
const MACHINE_READ_MAX_MS = 45_000;
/** Machine-host rooms: how long the owner may be offline before someone else takes over. */
const OWNER_GRACE_MS = 30_000;
/** Human-host rooms: how long the host may be gone before the machine takes over (HOST_GRACE_MS env for testing). */
const HOST_GRACE_MS = Number(process.env.HOST_GRACE_MS) || 2 * 60_000;

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
 * moves on 3 seconds after it is due (1.5 at night, see dueAt). The countdown
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
  const delay = room.phase.kind === "night" ? NIGHT_AUTO_DELAY_MS : AUTO_DELAY_MS;
  const goAt = due === null ? null : due + delay;
  const key = st.key;
  if (goAt === null || now < goAt - delay) {
    const wait = goAt === null ? 2_000 : goAt - delay - now;
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
  const bots = room.players.filter((p) => p.isBot || p.standIn);
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
    if (online && p.standIn) back(room, p);
    scheduleStandIns(room);
  }
}

/** How long someone may be offline, or idle on their turn, before a bot plays for them. */
const STAND_IN_MS = Number(process.env.STAND_IN_MS) || 60_000;
const standInTimers = new Map<string, { key: string; timer: NodeJS.Timeout }>();

/**
 * Anyone offline for a minute during a game, or online but not doing what
 * their turn asks for a minute, gets a bot playing for them. They take their
 * seat back by coming online again or doing anything.
 */
function scheduleStandIns(room: Room) {
  const running = gameRunning(room);
  for (const p of room.players) {
    const id = `${room.code}:${p.id}`;
    let key: string | null = null;
    if (running && !p.isBot && !p.standIn) {
      if (!p.connected) key = "offline";
      else if (botDecide(room, p.id, intelFor(room), true)) key = "idle:" + stepKey(room);
    }
    const cur = standInTimers.get(id);
    if (cur?.key === key) continue;
    if (cur) clearTimeout(cur.timer);
    standInTimers.delete(id);
    if (!key) continue;
    const game = room.game;
    const timer = setTimeout(() => {
      standInTimers.delete(id);
      const q = getPlayer(room, p.id);
      if (rooms.get(room.code) !== room || room.game !== game || !q || q.isBot || q.standIn || !gameRunning(room)) return;
      q.standIn = true;
      log(room, "log.standIn", { name: q.name }, true);
      console.log(`[room ${room.code}] ${q.name} is away: a bot plays for them`);
      touch(room);
    }, STAND_IN_MS);
    timer.unref();
    standInTimers.set(id, { key, timer });
  }
}

/** The player is back: the bot gives the seat back. */
function back(room: Room, p: Player) {
  if (!p.standIn) return;
  p.standIn = false;
  log(room, "log.standInBack", { name: p.name }, true);
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
    quests.recordGame([res.abandon]);
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
      s.emit("kicked", { code: room.code });
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

/** Shop items bought since the player joined count right away. */
function refreshOwned(room: Room, playerId: string) {
  const p = getPlayer(room, playerId);
  if (p?.userId) p.owned = accounts.ownedFor(p.userId);
}

/**
 * The room an account made and still runs: a human-host room it created, or a
 * machine-host room where it is still the owner (an owner who left or handed
 * the room over is free to make another).
 */
function roomOfCreator(userId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.creatorId !== userId) continue;
    if (!room.machineHost) return room;
    if (getPlayer(room, room.ownerId ?? "")?.userId === userId) return room;
  }
  return undefined;
}

/**
 * The human host is gone for good (left for a new room, or away too long):
 * the room carries on with the machine as host and the longest-seated online
 * player as its owner. The old host view stops working. False when nobody is
 * left to take it over.
 */
function hostHandOver(room: Room): boolean {
  if (room.machineHost) return false;
  const next = nextOwner(room);
  if (!next) return false;
  const owner = getPlayer(room, next)!;
  makeMachineRoom(room, next);
  room.creatorId = owner.userId ?? null;
  room.hostToken = randomToken();
  for (const s of roomSockets(room.code)) {
    if (s.data.kind !== "host") continue;
    s.emit("hostReplaced", { code: room.code });
    s.leave(channel(room.code));
    s.data = {};
  }
  // The old host will never finish reading this step aloud.
  stepTiming.delete(room.code);
  log(room, "log.hostLeft", { name: owner.name });
  console.log(`[room ${room.code}] host left: the machine runs it, ${owner.name} owns it`);
  touch(room);
  return true;
}

/** Hands the room over once its host has been gone for HOST_GRACE_MS. */
function scheduleHostCheck(room: Room) {
  setTimeout(() => {
    if (rooms.get(room.code) !== room || room.machineHost) return;
    if (roomSockets(room.code).some((s) => s.data.kind === "host")) return;
    hostHandOver(room);
  }, HOST_GRACE_MS).unref();
}

/**
 * The creator makes a new room and leaves this one: the next player takes it
 * over (the machine hosts it from then on). Closed only when nobody is left.
 */
function leaveCreatedRoom(room: Room, userId: string) {
  if (!room.machineHost) {
    if (!hostHandOver(room)) closeRoom(room.code);
    return;
  }
  const owner = getPlayer(room, room.ownerId ?? "");
  if (owner?.userId === userId) {
    const res = leaveRoom(room, owner.id, "left");
    if (res.ok) {
      recordAbandon(res);
      kickSockets(room, owner.id);
    }
  }
  if (!room.ownerId || !room.players.some((p) => !p.isBot && p.connected)) return closeRoom(room.code);
  room.creatorId = getPlayer(room, room.ownerId)?.userId ?? null;
  log(room, "log.ownerChanged", { name: getPlayer(room, room.ownerId)!.name });
  touch(room);
}

/** Where this person already sits in another room: by Google account, or by browser for guests. */
/** The seat this account (or this phone) already has in the room, if any. */
function seatHere(room: Room, userId: string | null | undefined, deviceId: unknown) {
  // A phone alone (a guest) only counts before the game: getting back into a running game without an account needs the owner.
  const device = typeof deviceId === "string" && deviceId && room.phase.kind === "lobby" ? deviceId : null;
  if (!userId && !device) return undefined;
  return room.players.find((p) => !p.isBot && !room.abandoned?.includes(p.id) && ((userId && p.userId === userId) || (device && p.deviceId === device)));
}

function seatElsewhere(userId: string | null | undefined, deviceId: unknown, except: string) {
  const device = typeof deviceId === "string" && deviceId ? deviceId : null;
  if (!userId && !device) return undefined;
  for (const room of rooms.values()) {
    if (room.code === except) continue;
    const player = room.players.find((p) => !p.isBot && ((userId && p.userId === userId) || (device && p.deviceId === device)));
    if (player) return { room, player };
  }
  return undefined;
}

/** Takes a player out of a room (a running game: a bot plays on and it counts as a loss). */
function leaveSeat(room: Room, playerId: string) {
  const wasOwner = isOwner(room, playerId);
  const res = leaveRoom(room, playerId, "left");
  if (!res.ok) return;
  recordAbandon(res);
  kickSockets(room, playerId);
  if (wasOwner && room.ownerId) log(room, "log.ownerChanged", { name: getPlayer(room, room.ownerId)!.name });
  touch(room);
}

/**
 * One room at a time: someone seated in another room leaves it once they get
 * the new seat (`leave`). A room that hasn't started or is over is left
 * without asking; leaving a running game (a loss) needs `leaveOther`,
 * otherwise `error` asks them first.
 */
function otherSeat(p: Record<string, unknown>, userId: string | null | undefined, except: string) {
  const seat = seatElsewhere(userId, p.deviceId, except);
  const error =
    seat && gameRunning(seat.room) && !p.leaveOther
      ? { ok: false as const, error: "err.inOtherRoom", params: { code: seat.room.code } }
      : null;
  const leave = () => {
    if (!seat || rooms.get(seat.room.code) !== seat.room) return;
    console.log(`[room ${seat.room.code}] ${seat.player.name} moved to another room`);
    leaveSeat(seat.room, seat.player.id);
  };
  return { error, leave };
}

/** Ends a room for everyone in it (expired, or replaced by its creator's new room). */
function closeRoom(code: string) {
  io.to(channel(code)).emit("roomClosed", { code });
  io.in(channel(code)).socketsLeave(channel(code));
  clearTimeout(botTimers.get(code));
  botTimers.delete(code);
  rooms.delete(code);
  social.dispose(code);
  lobby.changed();
  saveSoon();
}

/**
 * Who may make a room: a signed-in Google account without another open room.
 * `replace` leaves that other room first (the next player takes it over). Without Google sign-in set up on the
 * server (local play), anyone may.
 */
function creatorFor(p: Record<string, unknown>): { ok: true; userId: string | null } | { ok: false; error: string; params?: Record<string, string> } {
  if (!accounts.enabled) return { ok: true, userId: null };
  const user = accounts.userForToken(p.authToken);
  if (!user) return { ok: false, error: "err.signInToCreate" };
  const old = roomOfCreator(user.id);
  if (old && !p.replace) return { ok: false, error: "err.oneRoom", params: { code: old.code } };
  if (old) {
    console.log(`[room ${old.code}] its creator left to make a new room`);
    leaveCreatedRoom(old, user.id);
  }
  return { ok: true, userId: user.id };
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
  globalChat.register(raw);
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
      const creator = creatorFor(p);
      if (!creator.ok) return creator;
      const locale: Locale = p.locale === "en" ? "en" : "vi";
      const profile = (p.profile ?? {}) as Record<string, unknown>;
      const user = accounts.userForToken(p.authToken);
      const name = String(profile.name ?? "") || user?.name || "";
      const room = createRoom(makeRoomCode((c) => rooms.has(c)), locale);
      room.listed = true;
      room.creatorId = creator.userId;
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
      const other = otherSeat(p, user?.id, room.code);
      if (other.error) return other.error;
      const res = addPlayer(room, {
        name,
        avatar: String(profile.avatar ?? ""),
        locale,
        avatarUrl: user?.avatarUrl ?? null,
        style: profile.style,
        owned: accounts.ownedFor(user?.id),
        userId: user?.id ?? null,
        deviceId: p.deviceId,
      });
      if (!res.ok || !res.player) return { ok: false, error: res.error, params: res.params };
      other.leave();
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
      refreshOwned(room, playerId);
      refreshLocks(room);
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
      const creator = creatorFor(p);
      if (!creator.ok) return creator;
      const locale: Locale = p.locale === "en" ? "en" : "vi";
      const room = createRoom(makeRoomCode((c) => rooms.has(c)), locale);
      room.creatorId = creator.userId;
      rooms.set(room.code, room);
      attach(socket, room, "host");
      touch(room);
      console.log(`[room ${room.code}] created`);
      return { ok: true, code: room.code, hostToken: room.hostToken };
    }, ack),
  );

  // Back to the room this account made (e.g. from another device): the host
  // view of a human-host room, or the owner's seat in a machine-host room.
  on("room:reclaim", (p, ack) =>
    guard(() => {
      const user = accounts.userForToken(p.authToken);
      if (!user) return { ok: false, error: "err.signInToCreate" };
      const room = roomOfCreator(user.id);
      if (!room) return { ok: false, error: "err.roomNotFound" };
      if (!room.machineHost) return { ok: true, code: room.code, hostToken: room.hostToken };
      const playerId = room.ownerId!;
      return { ok: true, code: room.code, playerId, token: grantSeat(room, playerId) };
    }, ack),
  );

  on("host:resume", (p, ack) =>
    guard(() => {
      const room = rooms.get(normCode(p.code));
      if (!room) return { ok: false, error: "err.roomNotFound" };
      if (p.hostToken !== room.hostToken) return { ok: false, error: room.machineHost ? "err.hostHandedOver" : "err.notHost" };
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

  // Watching a running game: what the shared screen shows, plus the dead players' chat.
  on("spectator:watch", (p, ack) =>
    guard(() => {
      const room = rooms.get(normCode(p.code));
      if (!room) return { ok: false, error: "err.roomNotFound" };
      if (!room.game || room.phase.kind === "lobby") return { ok: false, error: "err.notPlayingYet" };
      if (!checkPassword(room.passwordHash, p.password))
        return { ok: false, error: p.password ? "err.wrongPassword" : "err.passwordRequired" };
      const user = accounts.userForToken(p.authToken);
      const name = sanitizeName(p.name) || user?.name || "";
      if (!name) return { ok: false, error: "err.nameRequired" };
      const avatar = AVATARS.includes(String(p.avatar)) ? String(p.avatar) : "👁️";
      attach(socket, room, "spectator");
      socket.data.spectator = { id: randomToken().slice(0, 10), name, avatar };
      socket.emit("state", buildView(room, "spectator"));
      return { ok: true };
    }, ack),
  );

  on("player:join", (p, ack) =>
    guard(() => {
      const room = rooms.get(normCode(p.code));
      if (!room) return { ok: false, error: "err.roomNotFound" };
      // Signed-in players get their photo from the account (never trusted from the client).
      const user = accounts.userForToken(p.authToken);
      // Someone invited into the room comes in without its password.
      const invited = !!user && globalChat.invitedTo(user.id, room.code);
      if (!invited && !checkPassword(room.passwordHash, p.password))
        return { ok: false, error: p.password ? "err.wrongPassword" : "err.passwordRequired" };
      // One seat per account (and per phone) in a room: joining again hands back the seat you already have.
      const mine = seatHere(room, user?.id, p.deviceId);
      if (mine) {
        const token = grantSeat(room, mine.id);
        refreshOwned(room, mine.id);
        mine.connected = true;
        attach(socket, room, "player", mine.id);
        back(room, mine);
        if (user) globalChat.takeInvite(user.id, room.code);
        touch(room);
        return { ok: true, playerId: mine.id, token };
      }
      const other = otherSeat(p, user?.id, room.code);
      if (other.error) return other.error;
      const res = addPlayer(room, {
        deviceId: p.deviceId,
        name: String(p.name ?? "") || user?.name || "",
        avatar: String(p.avatar ?? ""),
        locale: p.locale === "en" ? "en" : "vi",
        avatarUrl: user?.avatarUrl ?? null,
        style: p.style,
        owned: accounts.ownedFor(user?.id),
        userId: user?.id ?? null,
      });
      if (!res.ok || !res.player) return { ok: false, error: res.error, params: res.params };
      other.leave();
      res.player.connected = true;
      attach(socket, room, "player", res.player.id);
      if (user) globalChat.takeInvite(user.id, room.code);
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
      refreshOwned(room, player.id);
      attach(socket, room, "player", player.id);
      player.connected = true;
      back(room, player); // coming back takes the seat back from the stand-in bot
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
      // Items bought since joining count right away.
      const me = getPlayer(room, playerId);
      if (me?.userId && (p as { type?: string })?.type === "updateProfile") me.owned = accounts.ownedFor(me.userId);
      // "I'm back": the stand-in bot gives the seat back.
      if ((p as { type?: string })?.type === "back") {
        if (!me?.standIn) return { ok: true };
        back(room, me);
        touch(room);
        return { ok: true };
      }
      const wasAway = !!me?.standIn;
      const res = playerAction(room, playerId, p as unknown as PlayerAction);
      if (res.ok && me && wasAway && (p as { type?: string })?.type !== "updateProfile") back(room, me);
      if (res.ok || wasAway !== !!me?.standIn) touch(room);
      return res as ActionResult & Record<string, unknown>;
    }, ack),
  );

  // Machine-host rooms: a phone says how long this step's narration takes to read
  // ({ms}) or that it just finished saying it ({done:true}); the step waits for the longest.
  on("player:narration", (p, ack) =>
    guard(() => {
      const { code, kind } = socket.data;
      const room = code ? rooms.get(code) : undefined;
      if (!room || kind !== "player" || !room.machineHost || !room.game) return { ok: false, error: "err.notInRoom" };
      const st = timingFor(room);
      if (String(p.key ?? "") !== st.key) return { ok: true };
      const ms = Math.max(0, Number(p.ms) || 0);
      const until = Math.min(st.startedAt + MACHINE_READ_MAX_MS, p.done ? Date.now() : st.startedAt + ms);
      if (until > (st.narratedAt ?? 0)) {
        st.narratedAt = until;
        scheduleAuto(room);
        broadcast(room);
      }
      return { ok: true };
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
      refreshLocks(room);
      const res = hostAction(room, action);
      if (res.ok && kickedId) kickSockets(room, kickedId);
      if (res.ok && action.type === "newGame") social.clearForNewGame(room.code);
      if (res.ok) touch(room);
      return res as ActionResult & Record<string, unknown>;
    }, ack),
  );

  socket.on("disconnect", () => {
    const { code, playerId, kind } = socket.data;
    const room = code ? rooms.get(code) : undefined;
    if (room && playerId) setTimeout(() => setConnected(room, playerId), 0);
    if (room && kind === "host" && !room.machineHost) scheduleHostCheck(room);
  });
});

/** A finished game's room closes this long after the end, unless a new game starts (OVER_CLOSE_MS env for testing). */
const OVER_CLOSE_MS = Number(process.env.OVER_CLOSE_MS) || 10 * 60_000;
/** A room with nobody in it closes after this long (EMPTY_CLOSE_MS env for testing). */
const EMPTY_CLOSE_MS = Number(process.env.EMPTY_CLOSE_MS) || 5 * 60_000;
const overSince = new Map<string, number>();
const emptySince = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.phase.kind === "gameOver") overSince.set(code, overSince.get(code) ?? now);
    else overSince.delete(code);
    if (roomAlive(room)) emptySince.delete(code);
    else emptySince.set(code, emptySince.get(code) ?? now);
    const over = now - (overSince.get(code) ?? now) > OVER_CLOSE_MS;
    const empty = now - (emptySince.get(code) ?? now) > EMPTY_CLOSE_MS;
    if (!over && !empty) continue;
    overSince.delete(code);
    emptySince.delete(code);
    closeRoom(code);
    console.log(`[room ${code}] closed: ${over ? "the game ended a while ago" : "everyone left"}`);
  }
}, Number(process.env.SWEEP_MS) || 15_000).unref();

// Rooms self-destruct after 12 hours of inactivity.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      closeRoom(code);
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
  if (!room.machineHost) scheduleHostCheck(room);
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🐺 Ma Sói Online socket server on :${PORT}`);
  const lan = lanAddresses();
  if (lan.length) console.log(`   LAN: ${lan.map((a) => `http://${a}:${PORT}`).join("  ")}`);
});
