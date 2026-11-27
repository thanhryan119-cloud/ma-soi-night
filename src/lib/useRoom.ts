"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientState } from "@shared/views";
import { getSocket } from "./socket";
import { useGameSfx } from "./useGameSfx";

/**
 * Subscribes to the room state pushed by the server. `onConnect` runs on every
 * (re)connection so the client can re-authenticate (resume) automatically.
 */
export function useRoomState(onConnect: () => void) {
  const [state, setState] = useState<ClientState | null>(null);
  const [connected, setConnected] = useState(false);
  const [offset, setOffset] = useState(0);
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  useEffect(() => {
    const s = getSocket();
    const handleState = (st: ClientState) => {
      setState(st);
      setOffset(st.serverNow - Date.now());
    };
    const handleConnect = () => {
      setConnected(true);
      onConnectRef.current();
    };
    const handleDisconnect = () => setConnected(false);
    s.on("state", handleState);
    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    if (s.connected) handleConnect();
    return () => {
      s.off("state", handleState);
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
    };
  }, []);

  useGameSfx(state, offset);

  return { state, setState, connected, offset };
}

/** Touching the page is reported at most this often. */
const ACTIVE_EVERY_MS = 20_000;

/**
 * While `on` (in the lobby), tells the server the page is being used, so a
 * room owner or host who walked away can be spotted and replaced. Also shows
 * the "add bots" nudges other players send to whoever runs the room.
 */
export function useLobbyPresence(on: boolean, onNudged: (name: string) => void) {
  const nudgedRef = useRef(onNudged);
  nudgedRef.current = onNudged;
  useEffect(() => {
    if (!on) return;
    const s = getSocket();
    let last = 0;
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < ACTIVE_EVERY_MS) return;
      last = Date.now();
      s.emit("room:active");
    };
    ping();
    const opts = { capture: true, passive: true } as const;
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, ping, opts));
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("focus", ping);
    const nudged = (p: { name?: string }) => nudgedRef.current(String(p?.name ?? ""));
    s.on("room:nudged", nudged);
    return () => {
      events.forEach((e) => window.removeEventListener(e, ping, opts));
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("focus", ping);
      s.off("room:nudged", nudged);
    };
  }, [on]);
}

/** Re-renders every `ms` milliseconds. */
export function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
