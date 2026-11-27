"use client";

// The dead players' own chat, a tab of the room chat box (SocialPanel). While
// the game runs only the dead (and a human host) can read it; when the game is
// over everyone can. The server decides who may read and who may write.

import { Fragment, useEffect, useRef, useState } from "react";
import { CHAT_MAX_LEN, type ChatMessage } from "@shared/social";
import type { ClientState } from "@shared/views";
import { Avatar, StyledName, useErrorToast } from "@/components/ui";
import { ChatMilestone, newStage } from "@/components/SocialPanel";
import { useT } from "@/lib/i18n";
import { emitAck, getSocket } from "@/lib/socket";

/** The dead players' chat of the current room, kept in sync with the server. */
export function useGhostChat(state: ClientState, viewer: "host" | string) {
  const me =
    viewer === "host" ? null : state.players.find((p) => p.id === viewer);
  const over = state.phase.kind === "gameOver";
  // What decides whether this viewer may read it: re-asked when it changes.
  const access = `${state.code}:${viewer}:${me?.alive ?? "-"}:${over}:${state.phase.kind === "lobby"}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);

  useEffect(() => {
    const s = getSocket();
    let alive = true;
    const sync = async () => {
      const r = await emitAck<{
        allowed: boolean;
        messages: ChatMessage[];
        canSpeak?: boolean;
      }>("ghost:sync");
      if (!alive || !r.ok) return;
      setAllowed(!!r.allowed);
      setMessages(r.messages ?? []);
      setCanSpeak(!!r.canSpeak);
    };
    const added = (m: ChatMessage) =>
      setMessages((xs) =>
        xs.some((x) => x.id === m.id) ? xs : [...xs.slice(-199), m],
      );
    const cleared = () => setMessages([]);
    s.on("ghost:new", added);
    s.on("ghost:clear", cleared);
    s.on("connect", sync);
    sync();
    return () => {
      alive = false;
      s.off("ghost:new", added);
      s.off("ghost:clear", cleared);
      s.off("connect", sync);
    };
  }, [access]);

  const send = (text: string) => emitAck("ghost:send", { text });
  return { allowed, messages, canSpeak, send };
}

type Ghost = ReturnType<typeof useGhostChat>;

/** The list of messages and (for the dead) the box to write in. */
export function GhostLog({
  state,
  ghost,
  className = "",
}: {
  state: ClientState;
  ghost: Ghost;
  className?: string;
}) {
  const t = useT();
  const showError = useErrorToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const players = new Map(state.players.map((p) => [p.id, p]));
  const newest = ghost.messages[ghost.messages.length - 1]?.id;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [newest]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await ghost.send(text);
    setBusy(false);
    if (showError(res)) setText("");
  }

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div
        ref={list}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-night-950/60 p-2"
      >
        {!ghost.messages.length ? (
          <p className="py-6 text-center text-sm text-white/40">
            {t("ghostChat.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ghost.messages.map((m, i) => {
              const p = players.get(m.from);
              return (
                <Fragment key={m.id}>
                  {newStage(m, ghost.messages[i - 1]) && (
                    <li>
                      <ChatMilestone m={m} />
                    </li>
                  )}
                  {m.sys ? (
                    <li className="rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-center text-xs font-semibold text-violet-100">
                      {t(m.sys.key, m.sys.params)}
                    </li>
                  ) : (
                  <li className="flex gap-2">
                    {p ? (
                      <Avatar p={p} size="sm" />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-night-700 text-base">
                        {m.avatar ?? "👻"}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        {p ? (
                          <StyledName
                            p={p}
                            className="truncate text-sm font-bold"
                          />
                        ) : m.name ? (
                          <span className="truncate text-sm font-bold text-sky-200">
                            {m.name} <span className="text-[10px] font-normal text-white/50">👁️ {t("ghostChat.spectator")}</span>
                          </span>
                        ) : (
                          <b className="text-sm">?</b>
                        )}
                        <span className="shrink-0 text-[10px] text-white/40">
                          {new Date(m.t).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm leading-snug break-words text-white/85">
                        {m.text}
                      </p>
                    </div>
                  </li>
                  )}
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
      {ghost.canSpeak && (
        <form onSubmit={submit} className="flex shrink-0 gap-2">
          <input
            className="ui-input min-w-0 flex-1 py-2 text-base"
            value={text}
            maxLength={CHAT_MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("ghostChat.placeholder")}
            aria-label={t("ghostChat.placeholder")}
          />
          <button className="btn-primary px-4" disabled={busy || !text.trim()}>
            {t("ghostChat.send")}
          </button>
        </form>
      )}
    </div>
  );
}
