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
  type Whereabouts,
} from "../shared/social";
import type { PlayerStyle } from "../shared/cosmetics";
import {
  INVITE_WAIT_MS,
  cleanFriendData,
  friendBook,
  liveInvites,
  type FriendsState,
  type RoomInvite,
} from "../shared/friends";

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
    /**
     * The room this socket can invite `to` into: its code, or why not (not in a
     * room, the game started, the room is full, they are in it already).
     */
    inviteRoom: (socket: Socket, to: string) => { code: string } | { error: string };
    /** Where the person on this socket is (null: outside any room). */
    whereIs?: (socketId: string) => Whereabouts | null;
    /** Listed rooms waiting for players, and games being played. */
    roomCounts?: () => { open: number; playing: number };
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

  // Friends, kept on disk (requests too, so they wait for someone who is away).
  const friendsFile = join(opts.dataDir, "friends.json");
  let friendData = cleanFriendData(null);
  try {
    if (existsSync(friendsFile)) friendData = cleanFriendData(JSON.parse(readFileSync(friendsFile, "utf8")));
  } catch (err) {
    console.error("[friends] load failed", err);
  }
  const book = friendBook(friendData);
  let friendsTimer: NodeJS.Timeout | null = null;
  const saveFriendsSoon = () => {
    if (friendsTimer) return;
    friendsTimer = setTimeout(() => {
      friendsTimer = null;
      try {
        writeFileSync(`${friendsFile}.tmp`, JSON.stringify(friendData));
        renameSync(`${friendsFile}.tmp`, friendsFile);
      } catch (err) {
        console.error("[friends] save failed", err);
      }
    }, 500);
  };
  const lookup = (id: string) => {
    const a = opts.userById(id);
    return a ? pub(a) : null;
  };
  const friendsOf = (userId: string): FriendsState<OnlineUser> => book.stateOf(userId, lookup);

  // Room invites live in memory only: they are worth something for a few minutes.
  interface Invite {
    id: string;
    from: string;
    to: string;
    code: string;
    t: number;
  }
  let invites: Invite[] = [];
  const invitesFor = (userId: string): RoomInvite<OnlineUser>[] => {
    invites = liveInvites(invites, Date.now());
    return invites
      .filter((i) => i.to === userId)
      .map((i) => ({ id: i.id, code: i.code, t: i.t, from: lookup(i.from) }))
      .filter((i): i is RoomInvite<OnlineUser> => !!i.from);
  };

  // Who has the channel open: socket id -> account (null for a guest).
  const present = new Map<string, Account | null>();
  const RANK: Record<Whereabouts["status"], number> = { playing: 3, waiting: 2, watching: 1 };
  function onlineList(): OnlineList {
    const users = new Map<string, OnlineUser>();
    let guests = 0;
    for (const [sid, a] of present) {
      if (!a) {
        guests++;
        continue;
      }
      const u = users.get(a.id) ?? pub(a);
      // One account on several tabs: show the busiest one.
      const w = opts.whereIs?.(sid);
      if (w && (!u.where || RANK[w.status] > RANK[u.where.status])) u.where = w;
      users.set(a.id, u);
    }
    return { users: [...users.values()].sort((x, y) => x.name.localeCompare(y.name)), guests, rooms: opts.roomCounts?.() };
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
  /** Sends each account its new friend list. */
  const pushFriends = (...ids: string[]) => {
    for (const id of ids) {
      const state = friendsOf(id);
      for (const sid of socketsOf(id)) io.to(sid).emit("friends:state", state);
    }
  };

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
      ack({
        ok: true,
        messages,
        online: onlineList(),
        ...(user ? dmsOf(user.id) : { dms: [], peers: {} }),
        friends: user ? friendsOf(user.id) : null,
        invites: user ? invitesFor(user.id) : [],
      });
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

    // ----------------------------------------------------------- friends --
    type Run = (me: string, other: string) => ReturnType<typeof book.request>;
    const friendAction = (p: Record<string, unknown>, ack: Ack, isRequest: boolean, run: Run) => {
      const user = opts.accountFor(p.authToken);
      if (!user) return ack({ ok: false, error: "err.signInForFriends" });
      const other = typeof p.id === "string" ? p.id : "";
      if (other === user.id) return ack({ ok: false, error: "err.friendSelf" });
      if (!other || !opts.userById(other)) return ack({ ok: false, error: "err.dmNoUser" });
      const res = run(user.id, other);
      if (!res.ok) return ack(res);
      if (res.changed) {
        saveFriendsSoon();
        pushFriends(user.id, other);
        const note = res.nowFriends ? "friends:accepted" : isRequest ? "friends:request" : null;
        if (note) for (const sid of socketsOf(other)) io.to(sid).emit(note, { user: pub(user) });
      }
      ack({ ok: true, nowFriends: !!res.nowFriends, friends: friendsOf(user.id) });
    };
    on("friend:request", (p, ack) => friendAction(p, ack, true, (me, other) => book.request(me, other, Date.now())));
    on("friend:answer", (p, ack) => friendAction(p, ack, false, (me, other) => book.answer(me, other, p.accept === true)));
    on("friend:remove", (p, ack) => friendAction(p, ack, false, (me, other) => book.remove(me, other)));

    // ----------------------------------------------------------- invites --
    on("invite:send", (p, ack) => {
      const user = opts.accountFor(p.authToken);
      if (!user) return ack({ ok: false, error: "err.signInToInvite" });
      const to = typeof p.to === "string" ? p.to : "";
      if (!to || to === user.id || !opts.userById(to)) return ack({ ok: false, error: "err.dmNoUser" });
      if (!socketsOf(to).length) return ack({ ok: false, error: "err.inviteOffline" });
      const room = opts.inviteRoom(socket, to);
      if ("error" in room) return ack({ ok: false, error: room.error });
      const now = Date.now();
      invites = liveInvites(invites, now);
      const last = invites.find((i) => i.from === user.id && i.to === to && i.code === room.code);
      if (last && now - last.t < INVITE_WAIT_MS)
        return ack({ ok: false, error: "err.inviteSlow", params: { seconds: Math.ceil((last.t + INVITE_WAIT_MS - now) / 1000) } });
      invites = invites.filter((i) => !(i.from === user.id && i.to === to));
      const invite: Invite = { id: newId(now), from: user.id, to, code: room.code, t: now };
      invites.push(invite);
      const out: RoomInvite<OnlineUser> = { id: invite.id, from: pub(user), code: invite.code, t: now };
      for (const sid of socketsOf(to)) io.to(sid).emit("invite:new", out);
      ack({ ok: true });
    });

    // Turning it down (accepting is joining the room, see takeInvite).
    on("invite:decline", (p, ack) => {
      const user = opts.accountFor(p.authToken);
      if (!user) return ack({ ok: false, error: "err.signInToInvite" });
      const invite = invites.find((i) => i.id === p.id && i.to === user.id);
      invites = invites.filter((i) => i !== invite);
      if (invite) for (const sid of socketsOf(invite.to)) io.to(sid).emit("invite:gone", { id: invite.id });
      ack({ ok: true });
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

  /** True when `userId` has an open invite to room `code` (it lets them past the room password). */
  const invitedTo = (userId: string, code: string) => liveInvites(invites, Date.now()).some((i) => i.to === userId && i.code === code);

  /** They joined the room: their invites to it are used up. */
  function takeInvite(userId: string, code: string) {
    const used = invites.filter((i) => i.to === userId && i.code === code);
    if (!used.length) return;
    invites = invites.filter((i) => !used.includes(i));
    for (const i of used) for (const sid of socketsOf(userId)) io.to(sid).emit("invite:gone", { id: i.id });
  }

  /** Someone moved between rooms or a game changed phase: tell the channel (throttled, only if it differs). */
  return { register, invitedTo, takeInvite, presenceChanged: broadcastOnline };
}
