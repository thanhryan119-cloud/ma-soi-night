"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, Stroke } from "@shared/social";
import { emitAck, getSocket } from "./socket";

/** Chat messages + board strokes of the current room, kept in sync with the server. */
export function useSocial(syncKey: string) {
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  /** Who is typing right now (player ids), each with when it expires. */
  const [typing, setTyping] = useState<Record<string, number>>({});

  useEffect(() => {
    const s = getSocket();
    let alive = true;
    const sync = async () => {
      const r = await emitAck<{ chat: ChatMessage[]; strokes: Stroke[] }>("social:sync");
      if (!alive || !r.ok) return;
      setChat(r.chat ?? []);
      setStrokes(r.strokes ?? []);
    };
    const onMsg = (m: ChatMessage) => {
      setChat((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs.slice(-199), m]));
      setTyping(({ [m.from]: _, ...rest }) => rest);
    };
    // "… is typing": shown until the message lands, they stop, or 15 s pass.
    const onTyping = (p: { from: string; on: boolean }) =>
      setTyping(({ [p.from]: _, ...rest }) => (p.on ? { ...rest, [p.from]: Date.now() + 15_000 } : rest));
    const onStroke = (st: Stroke) => setStrokes((xs) => [...xs, st]);
    const onClear = () => setStrokes([]);
    // The host started a new game: the old game's messages go away.
    const onChatClear = () => setChat([]);
    s.on("chat:new", onMsg);
    s.on("chat:typing", onTyping);
    s.on("chat:clear", onChatClear);
    s.on("board:stroke", onStroke);
    s.on("board:clear", onClear);
    s.on("connect", sync);
    sync();
    return () => {
      alive = false;
      s.off("chat:new", onMsg);
      s.off("chat:typing", onTyping);
      s.off("chat:clear", onChatClear);
      s.off("board:stroke", onStroke);
      s.off("board:clear", onClear);
      s.off("connect", sync);
    };
  }, [syncKey]);

  const sendChat = useCallback((text: string) => emitAck("chat:send", { text }), []);
  /** Tells the room this player is (or stopped) typing. */
  const sendTyping = useCallback((on: boolean) => getSocket().emit("chat:typing", { on }), []);
  // Drop typing marks that ran out (someone closed the tab mid-sentence).
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setInterval(() => setTyping((x) => Object.fromEntries(Object.entries(x).filter(([, until]) => until > Date.now()))), 3000);
    return () => clearInterval(t);
  }, [typing]);
  const typingIds = Object.keys(typing);
  const sendStroke = useCallback(async (stroke: Omit<Stroke, "id" | "by">) => {
    const r = await emitAck<{ stroke: Stroke }>("board:stroke", { stroke });
    if (r.ok && r.stroke) setStrokes((xs) => [...xs, r.stroke!]);
    return r;
  }, []);
  const clearBoard = useCallback(() => emitAck("board:clear"), []);

  return { chat, strokes, typingIds, sendChat, sendTyping, sendStroke, clearBoard };
}
