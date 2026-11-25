// The server-wide chat: one channel everyone on the home page or in the online
// lobby can read. Posting needs a Google account (a name others can see on
// the profile card), one line every few seconds; admins may remove a line.
// The last lines are kept on disk so a redeploy doesn't wipe the talk.
//
// The same channel knows who has it open: signed-in accounts are listed in
// the "Online" tab, guests only counted. Accounts can also write to each
// other privately; those lines go only to the two of them and are kept on
// disk per pair, so they are there when the other one comes back.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import {
  DM_HISTORY,
  DM_WAIT_MS,
  GLOBAL_CHAT_HISTORY,
  GLOBAL_CHAT_WAIT_MS,
  dmKey,
  dmPeer,
  sanitizeChat,
  type DirectMessage,
  type GlobalMessage,
  type OnlineList,
  type OnlineUser,
} from "../shared/social";
import type { PlayerStyle } from "../shared/cosmetics";

const CHANNEL = "global-chat";

interface Account {
  id: string;
  name: string;
  avatarUrl: string | null;
  style: PlayerStyle | null;
  isAdmin: boolean;
}

type Ack = (res: Record<string, unknown>) => void;

const pub = (a: Account): OnlineUser => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl, style: a.style });

export function createGlobalChat(
  io: Server,
  opts: {
    dataDir: string;
    accountFor: (token: unknown) => Account | null;
    userById: (userId: string) => Account | null;
    /** Both accounts sit in the same game that is still running (no private talk there). */
    sameRunningGame: (a: string, b: string) => boolean;
  },
) {
  const file = join(opts.dataDir, "global-chat.json");
  let messages: GlobalMessage[] = [];
  try {
    if (existsSync(file)) messages = (JSON.parse(readFileSync(file, "utf8")) as GlobalMessage[]).slice(-GLOBAL_CHAT_HISTORY);
  } catch (err) {
    console.error("[global chat] load failed", err);
  }
  let saveTimer: NodeJS.Timeout | null = null;
  const saveSoon = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        writeFileSync(`${file}.tmp`, JSON.stringify(messages));
        renameSync(`${file}.tmp`, file);
      } catch (err) {
        console.error("[global chat] save failed", err);
      }
    }, 1000);
  };
  /** userId -> when they last posted. */
  const lastPost = new Map<string, number>();
  let seq = 0;
  const newId = (now: number) => `${now.toString(36)}${(seq++).toString(36)}`;

  // Private lines, per pair of accounts.
  const dmFile = join(opts.dataDir, "direct-messages.json");
  let dms: Record<string, DirectMessage[]> = {};
  try {
    if (existsSync(dmFile)) dms = JSON.parse(readFileSync(dmFile, "utf8")) as Record<string, DirectMessage[]>;
  } catch (err) {
    console.error("[direct messages] load failed", err);
  }
  let dmTimer: NodeJS.Timeout | null = null;
  const saveDmsSoon = () => {
    if (dmTimer) return;
    dmTimer = setTimeout(() => {
      dmTimer = null;
      try {
        writeFileSync(`${dmFile}.tmp`, JSON.stringify(dms));
        renameSync(`${dmFile}.tmp`, dmFile);
      } catch (err) {
        console.error("[direct messages] save failed", err);
      }
    }, 1000);
  };
  const lastDm = new Map<string, number>();
  /** Every private line of one account, oldest first, and who the others are. */
  function dmsOf(userId: string) {
    const lines: DirectMessage[] = [];
    const peers: Record<string, OnlineUser> = {};
    for (const [key, list] of Object.entries(dms)) {
      if (!key.split("|").includes(userId)) continue;
      const peer = dmPeer(list[0], userId);
      const acc = opts.userById(peer);
      if (!acc) continue;
      peers[peer] = pub(acc);
      lines.push(...list);
    }
    lines.sort((a, b) => a.t - b.t);
    return { dms: lines, peers };
  }

  // Who has the channel open: socket id -> account (null for a guest).
  const present = new Map<string, Account | null>();
  function onlineList(): OnlineList {
    const users = new Map<string, OnlineUser>();
    let guests = 0;
    for (const a of present.values()) {
      if (a) users.set(a.id, pub(a));
      else guests++;
    }
    return { users: [...users.values()].sort((x, y) => x.name.localeCompare(y.name)), guests };
  }
  let lastOnline = "";
  let onlineTimer: NodeJS.Timeout | null = null;
  /** Tells the channel who is online, at most every 300 ms and only when it changed. */
  const broadcastOnline = () => {
    if (onlineTimer) return;
    onlineTimer = setTimeout(() => {
      onlineTimer = null;
      const list = onlineList();
      const json = JSON.stringify(list);
      if (json === lastOnline) return;
      lastOnline = json;
      io.to(CHANNEL).emit("global:online", list);
    }, 300);
  };
  const socketsOf = (userId: string) => [...present].filter(([, a]) => a?.id === userId).map(([sid]) => sid);

  function register(socket: Socket) {
    const on = (event: string, fn: (p: Record<string, unknown>, ack: Ack) => void) =>
      socket.on(event, (p: unknown, ack: unknown) => {
        try {
          fn((p ?? {}) as Record<string, unknown>, typeof ack === "function" ? (ack as Ack) : () => {});
        } catch (err) {
          console.error(err);
          if (typeof ack === "function") (ack as Ack)({ ok: false, error: "err.server" });
        }
      });

    // Joining again (after signing in or out) just updates who this socket is.
    on("global:join", (p, ack) => {
      const user = opts.accountFor(p.authToken);
      socket.join(CHANNEL);
      present.set(socket.id, user);
      broadcastOnline();
      ack({ ok: true, messages, online: onlineList(), ...(user ? dmsOf(user.id) : { dms: [], peers: {} }) });
    });

    const leave = () => {
      if (present.delete(socket.id)) broadcastOnline();
    };
    on("global:leave", (_p, ack) => {
      socket.leave(CHANNEL);
      leave();
      ack({ ok: true });
    });
    socket.on("disconnect", leave);

    on("dm:send", (p, ack) => {
      const user = opts.accountFor(p.authToken);
      if (!user) return ack({ ok: false, error: "err.signInToChat" });
      const to = typeof p.to === "string" ? p.to : "";
      const peer = to && to !== user.id ? opts.userById(to) : null;
      if (!peer) return ack({ ok: false, error: "err.dmNoUser" });
      if (opts.sameRunningGame(user.id, peer.id)) return ack({ ok: false, error: "err.dmSameGame" });
      const text = sanitizeChat(p.text);
      if (!text) return ack({ ok: false, error: "err.chatEmpty" });
      const now = Date.now();
      const wait = (lastDm.get(user.id) ?? 0) + DM_WAIT_MS - now;
      if (wait > 0) return ack({ ok: false, error: "err.chatSlow", params: { seconds: Math.ceil(wait / 1000) } });
      lastDm.set(user.id, now);
      const msg: DirectMessage = { id: newId(now), t: now, from: user.id, to: peer.id, text };
      const key = dmKey(user.id, peer.id);
      const list = (dms[key] ??= []);
      list.push(msg);
      if (list.length > DM_HISTORY) list.splice(0, list.length - DM_HISTORY);
      saveDmsSoon();
      // Both sides get the line and who the other one is.
      for (const sid of socketsOf(peer.id)) io.to(sid).emit("dm:new", { msg, peer: pub(user) });
      for (const sid of socketsOf(user.id)) io.to(sid).emit("dm:new", { msg, peer: pub(peer) });
      ack({ ok: true, msg, peer: pub(peer) });
    });

    on("global:send", (p, ack) => {
      const user = opts.accountFor(p.authToken);
      if (!user) return ack({ ok: false, error: "err.signInToChat" });
      const text = sanitizeChat(p.text);
      if (!text) return ack({ ok: false, error: "err.chatEmpty" });
      const now = Date.now();
      const wait = (lastPost.get(user.id) ?? 0) + GLOBAL_CHAT_WAIT_MS - now;
      if (wait > 0) return ack({ ok: false, error: "err.chatSlow", params: { seconds: Math.ceil(wait / 1000) } });
      lastPost.set(user.id, now);
      const msg: GlobalMessage = {
        id: newId(now),
        t: now,
        userId: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        style: user.style,
        text,
      };
      messages.push(msg);
      if (messages.length > GLOBAL_CHAT_HISTORY) messages.splice(0, messages.length - GLOBAL_CHAT_HISTORY);
      io.to(CHANNEL).emit("global:new", msg);
      saveSoon();
      ack({ ok: true });
    });

    on("global:delete", (p, ack) => {
      const user = opts.accountFor(p.authToken);
      if (!user?.isAdmin) return ack({ ok: false, error: "err.notAdmin" });
      const before = messages.length;
      messages = messages.filter((m) => m.id !== p.id);
      if (messages.length !== before) {
        io.to(CHANNEL).emit("global:deleted", { id: p.id });
        saveSoon();
      }
      ack({ ok: true });
    });
  }

  return { register };
}
