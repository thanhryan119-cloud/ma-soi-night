import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "socket.io";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  INVITE_TTL_MS,
  MAX_PENDING,
  cleanFriendData,
  emptyFriendData,
  friendBook,
  liveInvites,
} from "../shared/friends";
import { createGlobalChat } from "../server/globalChat";

const lookup = (id: string) => ({ id, name: id.toUpperCase() });

describe("friend book", () => {
  it("a request waits until the other one accepts, then both are friends", () => {
    const data = emptyFriendData();
    const b = friendBook(data);
    expect(b.request("a", "b", 1)).toEqual({ ok: true, changed: true });
    expect(b.relation("a", "b")).toBe("sent");
    expect(b.relation("b", "a")).toBe("received");
    expect(b.stateOf("b", lookup).incoming).toEqual([{ id: "a", name: "A" }]);
    expect(b.answer("b", "a", true)).toMatchObject({ ok: true, nowFriends: true });
    expect(b.areFriends("a", "b") && b.areFriends("b", "a")).toBe(true);
    expect(data.requests).toEqual([]);
    expect(b.stateOf("a", lookup).friends.map((u) => u.id)).toEqual(["b"]);
  });

  it("declining drops the request and makes nobody friends", () => {
    const b = friendBook(emptyFriendData());
    b.request("a", "b", 1);
    expect(b.answer("b", "a", false)).toEqual({ ok: true, changed: true });
    expect(b.relation("a", "b")).toBe("none");
    expect(b.answer("b", "a", true)).toEqual({ ok: false, error: "err.friendNoRequest" });
  });

  it("asking someone who already asked you makes you friends at once", () => {
    const b = friendBook(emptyFriendData());
    b.request("a", "b", 1);
    expect(b.request("b", "a", 2)).toMatchObject({ ok: true, nowFriends: true });
    expect(b.relation("a", "b")).toBe("friend");
  });

  it("refuses yourself, friends twice, and too many requests", () => {
    const b = friendBook(emptyFriendData());
    expect(b.request("a", "a", 1)).toEqual({ ok: false, error: "err.friendSelf" });
    b.request("a", "b", 1);
    expect(b.request("a", "b", 2)).toEqual({ ok: true, changed: false });
    b.answer("b", "a", true);
    expect(b.request("a", "b", 3)).toEqual({ ok: false, error: "err.alreadyFriends" });
    for (let i = 0; i < MAX_PENDING; i++) b.request("c", `u${i}`, i);
    expect(b.request("c", "last", 99)).toEqual({ ok: false, error: "err.friendPendingFull" });
  });

  it("removing unfriends both ways, or takes back a request", () => {
    const b = friendBook(emptyFriendData());
    b.request("a", "b", 1);
    b.answer("b", "a", true);
    expect(b.remove("b", "a").changed).toBe(true);
    expect(b.relation("a", "b")).toBe("none");
    b.request("a", "c", 1);
    expect(b.remove("a", "c").changed).toBe(true);
    expect(b.relation("c", "a")).toBe("none");
    expect(b.remove("a", "c").changed).toBe(false);
  });

  it("leaves out accounts that no longer exist", () => {
    const b = friendBook(emptyFriendData());
    b.request("a", "gone", 1);
    expect(b.stateOf("a", (id) => (id === "gone" ? null : lookup(id))).outgoing).toEqual([]);
  });

  it("reads back what was saved and drops junk", () => {
    const data = emptyFriendData();
    const book = friendBook(data);
    book.request("a", "b", 1);
    book.request("c", "a", 2);
    book.answer("b", "a", true);
    const again = cleanFriendData(JSON.parse(JSON.stringify(data)));
    expect(again).toEqual(data);
    expect(cleanFriendData({ friends: { a: ["b", 3] }, requests: [{ from: "x" }, null] })).toEqual({ friends: { a: ["b"] }, requests: [] });
    expect(cleanFriendData("nonsense")).toEqual(emptyFriendData());
  });

  it("invites run out after a while", () => {
    expect(liveInvites([{ t: 0 }, { t: 1000 }], INVITE_TTL_MS + 500)).toEqual([{ t: 1000 }]);
  });
});

// ---------------------------------------------------------------------------
// Over a real socket: requests, the friends file, and room invites.
// ---------------------------------------------------------------------------

describe("friends and invites over the server chat", () => {
  let http: HttpServer | null = null;
  let clients: ClientSocket[] = [];
  afterEach(async () => {
    for (const c of clients) c.disconnect();
    clients = [];
    await new Promise<void>((r) => (http ? http.close(() => r()) : r()));
    http = null;
  });

  const users: Record<string, { id: string; name: string; avatarUrl: null; style: null; isAdmin: boolean }> = {
    ua: { id: "ua", name: "An", avatarUrl: null, style: null, isAdmin: false },
    ub: { id: "ub", name: "Bình", avatarUrl: null, style: null, isAdmin: false },
  };

  async function start(inviteRoom: (to: string) => { code: string } | { error: string }) {
    const dataDir = mkdtempSync(join(tmpdir(), "msn-friends-"));
    http = createServer();
    const io = new Server(http);
    const chat = createGlobalChat(io, {
      dataDir,
      accountFor: (token) => (typeof token === "string" ? (users[token.replace("tok-", "u")] ?? null) : null),
      userById: (id) => users[id] ?? null,
      sameRunningGame: () => false,
      inviteRoom: (_socket, to) => inviteRoom(to),
    });
    io.on("connection", (s) => chat.register(s));
    await new Promise<void>((r) => http!.listen(0, r));
    const port = (http.address() as AddressInfo).port;
    const client = async (token: string) => {
      const c = connect(`http://localhost:${port}`, { transports: ["websocket"] });
      clients.push(c);
      const join = await c.emitWithAck("global:join", { authToken: token });
      return { c, join, call: (event: string, p: Record<string, unknown> = {}) => c.emitWithAck(event, { ...p, authToken: token }) };
    };
    return { dataDir, chat, client };
  }

  const next = (c: ClientSocket, event: string) => new Promise<unknown>((r) => c.once(event, r));

  it("sends a request, accepts it, and keeps the friends on disk", async () => {
    const { dataDir, client } = await start(() => ({ error: "err.inviteNoRoom" }));
    const a = await client("tok-a");
    const b = await client("tok-b");
    expect(a.join.friends).toEqual({ friends: [], incoming: [], outgoing: [] });

    const asked = next(b.c, "friends:request");
    expect(await a.call("friend:request", { id: "ub" })).toMatchObject({ ok: true, nowFriends: false });
    expect(await asked).toMatchObject({ user: { id: "ua", name: "An" } });

    const bState = next(b.c, "friends:state");
    const aNote = next(a.c, "friends:accepted");
    const res = await b.call("friend:answer", { id: "ua", accept: true });
    expect(res).toMatchObject({ ok: true, nowFriends: true, friends: { friends: [{ id: "ua" }], incoming: [] } });
    expect(await bState).toMatchObject({ friends: [{ id: "ua" }] });
    expect(await aNote).toMatchObject({ user: { id: "ub" } });

    await new Promise((r) => setTimeout(r, 700));
    const file = join(dataDir, "friends.json");
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ friends: { ua: ["ub"], ub: ["ua"] }, requests: [] });

    // Guests can't.
    const g = await client("nobody");
    expect(await g.call("friend:request", { id: "ua" })).toEqual({ ok: false, error: "err.signInForFriends" });
  });

  it("invites someone online into the room, which lets them past the password", async () => {
    const { chat, client } = await start((to) => (to === "ub" ? { code: "ROOM1" } : { error: "err.inviteNoRoom" }));
    const a = await client("tok-a");
    const b = await client("tok-b");
    const got = next(b.c, "invite:new");
    expect(await a.call("invite:send", { to: "ub" })).toEqual({ ok: true });
    const invite = (await got) as { id: string; code: string; from: { id: string } };
    expect(invite).toMatchObject({ code: "ROOM1", from: { id: "ua", name: "An" } });
    expect(chat.invitedTo("ub", "ROOM1")).toBe(true);
    expect(chat.invitedTo("ua", "ROOM1")).toBe(false);

    // Asking again right away is too soon.
    expect(await a.call("invite:send", { to: "ub" })).toMatchObject({ ok: false, error: "err.inviteSlow" });

    // Coming back to the site still shows the open invite.
    const b2 = await client("tok-b");
    expect(b2.join.invites).toMatchObject([{ id: invite.id, code: "ROOM1" }]);

    // Joining uses it up.
    const gone = next(b.c, "invite:gone");
    chat.takeInvite("ub", "ROOM1");
    expect(await gone).toEqual({ id: invite.id });
    expect(chat.invitedTo("ub", "ROOM1")).toBe(false);
  });

  it("declining drops the invite, and nobody offline or outside a room can be invited", async () => {
    const { chat, client } = await start(() => ({ code: "ROOM2" }));
    const a = await client("tok-a");
    expect(await a.call("invite:send", { to: "ub" })).toEqual({ ok: false, error: "err.inviteOffline" });
    const b = await client("tok-b");
    const got = next(b.c, "invite:new");
    await a.call("invite:send", { to: "ub" });
    const invite = (await got) as { id: string };
    expect(await b.call("invite:decline", { id: invite.id })).toEqual({ ok: true });
    expect(chat.invitedTo("ub", "ROOM2")).toBe(false);
  });

  it("passes on why the room can't take anyone", async () => {
    const { client } = await start(() => ({ error: "err.inviteStarted" }));
    const a = await client("tok-a");
    await client("tok-b");
    expect(await a.call("invite:send", { to: "ub" })).toEqual({ ok: false, error: "err.inviteStarted" });
  });
});
