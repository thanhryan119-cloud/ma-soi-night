// Friends and room invites (pure, no IO: the server keeps the data on disk).
//
// A friend request waits until the other account accepts or declines it. When
// two accounts ask each other, the second request makes them friends at once.
// Invites are short-lived: someone in a room asks an online account to come in,
// and accepting lets them into that room (past its password) for a while.

/** At most this many friends per account. */
export const MAX_FRIENDS = 200;
/** At most this many requests waiting for an answer, per sender. */
export const MAX_PENDING = 50;
/** An invite can be accepted for this long. */
export const INVITE_TTL_MS = 10 * 60_000;
/** Least time between two invites from one account to the same account. */
export const INVITE_WAIT_MS = 15_000;

export interface FriendRequest {
  from: string;
  to: string;
  t: number;
}

/** What is kept on disk. */
export interface FriendData {
  /** userId -> their friends' ids (always both ways). */
  friends: Record<string, string[]>;
  requests: FriendRequest[];
}

export type FriendRelation = "none" | "friend" | "sent" | "received";

/** One account's side of it, for the client (who the others are comes with it). */
export interface FriendsState<U> {
  friends: U[];
  /** Requests to me, newest first. */
  incoming: U[];
  /** My requests still waiting. */
  outgoing: U[];
}

export interface RoomInvite<U> {
  id: string;
  from: U;
  code: string;
  t: number;
}

export const emptyFriendData = (): FriendData => ({ friends: {}, requests: [] });

/** Reads what was on disk, dropping anything malformed. */
export function cleanFriendData(raw: unknown): FriendData {
  const d = (raw ?? {}) as Partial<FriendData>;
  const friends: Record<string, string[]> = {};
  if (d.friends && typeof d.friends === "object")
    for (const [k, v] of Object.entries(d.friends)) if (Array.isArray(v)) friends[k] = v.filter((x) => typeof x === "string");
  const requests = Array.isArray(d.requests)
    ? d.requests.filter((r): r is FriendRequest => !!r && typeof r.from === "string" && typeof r.to === "string" && typeof r.t === "number")
    : [];
  return { friends, requests };
}

export type FriendResult = { ok: true; changed: boolean; nowFriends?: boolean } | { ok: false; error: string };

/** The friend list and requests, with every change kept consistent on both sides. */
export function friendBook(data: FriendData) {
  const listOf = (id: string) => data.friends[id] ?? [];
  const areFriends = (a: string, b: string) => listOf(a).includes(b);
  const findRequest = (from: string, to: string) => data.requests.findIndex((r) => r.from === from && r.to === to);

  function relation(me: string, other: string): FriendRelation {
    if (areFriends(me, other)) return "friend";
    if (findRequest(me, other) >= 0) return "sent";
    if (findRequest(other, me) >= 0) return "received";
    return "none";
  }

  function link(a: string, b: string) {
    data.friends[a] = [...listOf(a).filter((x) => x !== b), b];
    data.friends[b] = [...listOf(b).filter((x) => x !== a), a];
    data.requests = data.requests.filter((r) => !((r.from === a && r.to === b) || (r.from === b && r.to === a)));
  }

  /** `me` asks `other` to be friends (or accepts, when `other` asked first). */
  function request(me: string, other: string, now: number): FriendResult {
    if (!other || me === other) return { ok: false, error: "err.friendSelf" };
    const rel = relation(me, other);
    if (rel === "friend") return { ok: false, error: "err.alreadyFriends" };
    if (rel === "sent") return { ok: true, changed: false };
    if (listOf(me).length >= MAX_FRIENDS || listOf(other).length >= MAX_FRIENDS) return { ok: false, error: "err.friendsFull" };
    if (rel === "received") {
      link(me, other);
      return { ok: true, changed: true, nowFriends: true };
    }
    if (data.requests.filter((r) => r.from === me).length >= MAX_PENDING) return { ok: false, error: "err.friendPendingFull" };
    data.requests.push({ from: me, to: other, t: now });
    return { ok: true, changed: true };
  }

  /** `me` answers the request `other` sent. */
  function answer(me: string, other: string, accept: boolean): FriendResult {
    const i = findRequest(other, me);
    if (i < 0) return { ok: false, error: "err.friendNoRequest" };
    if (!accept) {
      data.requests.splice(i, 1);
      return { ok: true, changed: true };
    }
    if (listOf(me).length >= MAX_FRIENDS || listOf(other).length >= MAX_FRIENDS) return { ok: false, error: "err.friendsFull" };
    link(me, other);
    return { ok: true, changed: true, nowFriends: true };
  }

  /** Unfriends, or takes back a request `me` sent. */
  function remove(me: string, other: string): { ok: true; changed: boolean } {
    const before = JSON.stringify([listOf(me), data.requests.length]);
    data.friends[me] = listOf(me).filter((x) => x !== other);
    data.friends[other] = listOf(other).filter((x) => x !== me);
    data.requests = data.requests.filter((r) => !(r.from === me && r.to === other));
    return { ok: true, changed: JSON.stringify([listOf(me), data.requests.length]) !== before };
  }

  /** One account's view, with each id turned into what the client shows (unknown accounts are left out). */
  function stateOf<U>(me: string, lookup: (id: string) => U | null): FriendsState<U> {
    const known = (ids: string[]) => ids.map(lookup).filter((u): u is U => !!u);
    return {
      friends: known(listOf(me)),
      incoming: known(data.requests.filter((r) => r.to === me).sort((a, b) => b.t - a.t).map((r) => r.from)),
      outgoing: known(data.requests.filter((r) => r.from === me).map((r) => r.to)),
    };
  }

  return { relation, areFriends, request, answer, remove, stateOf };
}

/** Invites still open: drops the ones too old to accept. */
export const liveInvites = <I extends { t: number }>(list: I[], now: number) => list.filter((i) => now - i.t < INVITE_TTL_MS);
