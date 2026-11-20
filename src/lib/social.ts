"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, Stroke } from "@shared/social";
import { emitAck, getSocket } from "./socket";

/** Chat messages + board strokes of the current room, kept in sync with the server. */
export function useSocial(syncKey: string) {
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  useEffect(() => {
    const s = getSocket();
    let alive = true;
    const sync = async () => {
      const r = await emitAck<{ chat: ChatMessage[]; strokes: Stroke[] }>("social:sync");
      if (!alive || !r.ok) return;
      setChat(r.chat ?? []);
      setStrokes(r.strokes ?? []);
    };
    const onMsg = (m: ChatMessage) => setChat((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs.slice(-199), m]));
    const onStroke = (st: Stroke) => setStrokes((xs) => [...xs, st]);
    const onClear = () => setStrokes([]);
    // The host started a new game: the old game's messages go away.
    const onChatClear = () => setChat([]);
    s.on("chat:new", onMsg);
    s.on("chat:clear", onChatClear);
    s.on("board:stroke", onStroke);
    s.on("board:clear", onClear);
    s.on("connect", sync);
    sync();
    return () => {
      alive = false;
      s.off("chat:new", onMsg);
      s.off("chat:clear", onChatClear);
      s.off("board:stroke", onStroke);
      s.off("board:clear", onClear);
      s.off("connect", sync);
    };
  }, [syncKey]);

  const sendChat = useCallback((text: string) => emitAck("chat:send", { text }), []);
  const sendStroke = useCallback(async (stroke: Omit<Stroke, "id" | "by">) => {
    const r = await emitAck<{ stroke: Stroke }>("board:stroke", { stroke });
    if (r.ok && r.stroke) setStrokes((xs) => [...xs, r.stroke!]);
    return r;
  }, []);
  const clearBoard = useCallback(() => emitAck("board:clear"), []);

  return { chat, strokes, sendChat, sendStroke, clearBoard };
}
