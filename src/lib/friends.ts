"use client";

// The signed-in account's friends (one way, like a follow). The list comes
// with joining the server chat (useGlobalChat) and is kept here so any
// component (the profile card, the Online list, the home page) can read it
// and add or remove someone.

import { useSyncExternalStore } from "react";
import type { OnlineUser } from "@shared/social";
import { getAuth } from "./account";
import { emitAck, getSocket } from "./socket";

let friends: OnlineUser[] = [];
const subs = new Set<() => void>();

export function setFriendList(list: OnlineUser[]) {
  friends = list;
  for (const fn of subs) fn();
}

let listening = false;
/** Other tabs of the same account changed the list. */
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  getSocket().on("friend:list", setFriendList);
}

const subscribe = (fn: () => void) => {
  listen();
  subs.add(fn);
  return () => void subs.delete(fn);
};
const EMPTY: OnlineUser[] = [];

export function useFriends(): OnlineUser[] {
  return useSyncExternalStore(
    subscribe,
    () => friends,
    () => EMPTY,
  );
}

export const isFriend = (list: OnlineUser[], userId: string) => list.some((f) => f.id === userId);

/** Adds or removes a friend; resolves with the server's answer. */
export async function setFriend(userId: string, on: boolean) {
  const r = await emitAck<{ friends: OnlineUser[] }>("friend:set", { authToken: getAuth()?.token, userId, on });
  if (r.ok && r.friends) setFriendList(r.friends);
  return r;
}
