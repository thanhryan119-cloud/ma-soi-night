"use client";

import { useEffect, useState } from "react";
import type { LobbyPerson, RoomSummary } from "@shared/multiplayer";
import type { LocalProfile } from "./account";
import { getAuth } from "./account";
import { emitAck, getSocket } from "./socket";

export interface LobbyState {
  online: LobbyPerson[];
  rooms: RoomSummary[];
}

/**
 * Keeps this tab in the online lobby while the page is open: announces the
 * player's name and look, and follows who is online and which rooms are open.
 */
export function useLobby(profile: LocalProfile | null) {
  const [state, setState] = useState<LobbyState | null>(null);
  const [connected, setConnected] = useState(true);
  const name = profile?.name.trim() ?? "";
  const avatar = profile?.avatar ?? "";

  useEffect(() => {
    if (!profile) return;
    const s = getSocket();
    const enter = async () => {
      const r = await emitAck<LobbyState>("lobby:enter", { profile: { name, avatar }, authToken: getAuth()?.token });
      if (r.ok && r.online && r.rooms) setState({ online: r.online, rooms: r.rooms });
    };
    // Typing a name: wait a moment before telling everyone.
    const t = setTimeout(enter, 300);
    const onState = (st: LobbyState) => setState(st);
    const onConnect = () => {
      setConnected(true);
      void enter();
    };
    const onDisconnect = () => setConnected(false);
    s.on("lobby:state", onState);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    setConnected(s.connected);
    return () => {
      clearTimeout(t);
      s.off("lobby:state", onState);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, avatar, !!profile]);

  // Leaving the page leaves the lobby (joining a room does it on the server too).
  useEffect(() => () => void getSocket().emit("lobby:leave"), []);

  return { state, connected };
}
