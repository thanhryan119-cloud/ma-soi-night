// The online lobby: who is online but not in a room yet, and the open rooms.
// Everyone on the lobby page joins the "lobby" channel and gets the whole
// picture again (throttled) whenever someone comes or goes or a room changes.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { lobbyPerson, roomSummary, sortRooms, type LobbyPerson, type RoomSummary } from "../shared/multiplayer";
import type { Room } from "../shared/types";

const CHANNEL = "lobby";
const THROTTLE_MS = 300;

export function hashPassword(password: string): string {
  const salt = randomBytes(8).toString("hex");
  return `${salt}:${createHash("sha256").update(`${salt}:${password}`).digest("hex")}`;
}

export function checkPassword(hash: string | null | undefined, password: unknown): boolean {
  if (!hash) return true;
  const [salt, want] = hash.split(":");
  const got = createHash("sha256").update(`${salt}:${String(password ?? "")}`).digest("hex");
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export function createLobby(
  io: Server,
  opts: {
    rooms: () => Iterable<Room>;
    /** Someone is still there to play: a human online, or the human host. */
    isAlive: (room: Room) => boolean;
    accountFor: (authToken: unknown) => { id: string; avatarUrl: string | null } | null;
  },
) {
  const people = new Map<string, LobbyPerson>();
  let timer: NodeJS.Timeout | null = null;
  let last = "";

  function snapshot(): { online: LobbyPerson[]; rooms: RoomSummary[] } {
    const rooms = [...opts.rooms()].filter((r) => r.listed && opts.isAlive(r)).map(roomSummary);
    return { online: [...people.values()], rooms: sortRooms(rooms) };
  }

  /** Something changed: send the new picture to the lobby (at most every 300 ms, only when it differs). */
  function changed() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const snap = snapshot();
      const json = JSON.stringify(snap);
      if (json === last) return;
      last = json;
      io.to(CHANNEL).emit("lobby:state", snap);
    }, THROTTLE_MS);
  }

  function leave(socket: Socket) {
    socket.leave(CHANNEL);
    if (people.delete(socket.id)) changed();
  }

  function register(socket: Socket) {
    socket.on("lobby:enter", (p: unknown, ack: unknown) => {
      const body = (p ?? {}) as { profile?: unknown; authToken?: unknown };
      const person = lobbyPerson(socket.id, body.profile, opts.accountFor(body.authToken));
      socket.join(CHANNEL);
      if (person) people.set(socket.id, person);
      else people.delete(socket.id);
      changed();
      if (typeof ack === "function") ack({ ok: true, ...snapshot() });
    });
    socket.on("lobby:leave", () => leave(socket));
    socket.on("disconnect", () => leave(socket));
  }

  return { register, changed, leave };
}
