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

/** Re-renders every `ms` milliseconds. */
export function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
