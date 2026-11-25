"use client";

// The dead players' own chat. While the game runs only the dead (and a human
// host) can read it; when the game is over everyone can.

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
function GhostLog({
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
                  <li className="flex gap-2">
                    {p ? (
                      <Avatar p={p} size="sm" />
                    ) : (
                      <span className="text-xl">👻</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        {p ? (
                          <StyledName
                            p={p}
                            className="truncate text-sm font-bold"
                          />
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

/**
 * A player's button for the dead players' chat (shown once they died, and for
 * everyone after the game if anything was said), opening a floating panel.
 */
export function GhostChatButton({
  state,
  viewer,
}: {
  state: ClientState;
  viewer: string;
}) {
  const t = useT();
  const ghost = useGhostChat(state, viewer);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const count = ghost.messages.length;
  useEffect(() => {
    if (open) setSeen(count);
  }, [open, count]);
  const over = state.phase.kind === "gameOver";
  if (!ghost.allowed || (over && !count)) return null;
  const unread = open
    ? 0
    : ghost.messages.slice(seen).filter((m) => m.from !== viewer).length;

  return (
    <>
      <button
        type="button"
        className="btn-ghost btn-sm relative shrink-0 gap-1.5"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={t("ghostChat.title")}
      >
        👻{" "}
        <span className="hidden sm:inline">
          {over ? t("ghostChat.endTitle") : t("ghostChat.button")}
        </span>
        {unread > 0 && (
          <span className="rounded-full bg-blood px-1.5 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          className="rise fixed inset-x-2 top-14 z-[70] flex h-[min(480px,65dvh)] flex-col gap-2 rounded-lg border border-violet-300/40 bg-night-800/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.6),inset_0_0_0_3px_#1a153d] backdrop-blur sm:inset-x-auto sm:right-4 sm:w-96"
          aria-label={t("ghostChat.title")}
        >
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate font-display text-lg font-black text-moon">
              👻 {over ? t("ghostChat.endTitle") : t("ghostChat.title")}
            </h2>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
            >
              ✕
            </button>
          </div>
          {!over && (
            <p className="text-xs text-white/50">{t("ghostChat.hint")}</p>
          )}
          <GhostLog state={state} ghost={ghost} className="flex-1" />
        </section>
      )}
    </>
  );
}

/** The human host's read-only view of the dead players' chat. */
export function HostGhostChat({ state }: { state: ClientState }) {
  const t = useT();
  const ghost = useGhostChat(state, "host");
  const dead = state.players.some((p) => !p.alive);
  if (!ghost.allowed || (!dead && !ghost.messages.length)) return null;
  return (
    <section className="card flex max-h-[40dvh] min-h-[160px] flex-col gap-2">
      <h3 className="font-bold">👻 {t("ghostChat.title")}</h3>
      <p className="text-xs text-white/50">{t("ghostChat.hostHint")}</p>
      <GhostLog state={state} ghost={ghost} className="flex-1" />
    </section>
  );
}
