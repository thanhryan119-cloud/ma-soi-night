"use client";

// The server-wide chat: a button in the corner of the site's pages (or,
// `compact`, a small button in a room's header, during the game too) opens one
// channel everyone on the site can read, at any time. Posting needs a Google
// account; admins can remove a line.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LEN, type GlobalMessage } from "@shared/social";
import { Avatar, StyledName, useErrorToast } from "@/components/ui";
import { ProfileLink } from "@/components/Profile";
import { getAuth, useAccount } from "@/lib/account";
import { useT } from "@/lib/i18n";
import { emitAck, getSocket, storage } from "@/lib/socket";

const SEEN_KEY = "msn:globalChatSeen";

export function GlobalChat({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const showError = useErrorToast();
  const account = useAccount();
  const me = account?.user ?? null;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [seen, setSeen] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  // Listen all the time (for the unread count), from the page's first render.
  useEffect(() => {
    setSeen(storage.get<number>(SEEN_KEY) ?? 0);
    const s = getSocket();
    const join = () => emitAck<{ messages: GlobalMessage[] }>("global:join").then((r) => r.ok && setMessages(r.messages ?? []));
    const added = (m: GlobalMessage) => setMessages((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m].slice(-100)));
    const deleted = (e: { id: string }) => setMessages((xs) => xs.filter((x) => x.id !== e.id));
    join();
    s.on("connect", join);
    s.on("global:new", added);
    s.on("global:deleted", deleted);
    return () => {
      s.off("connect", join);
      s.off("global:new", added);
      s.off("global:deleted", deleted);
      emitAck("global:leave");
    };
  }, []);

  // While open: everything counts as read, and the list follows new lines.
  const newest = messages[messages.length - 1]?.t ?? 0;
  useEffect(() => {
    if (!open || !newest) return;
    setSeen(newest);
    storage.set(SEEN_KEY, newest);
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, newest]);

  const unread = open ? 0 : messages.filter((m) => m.t > seen && m.userId !== me?.id).length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await emitAck("global:send", { text, authToken: getAuth()?.token });
    setBusy(false);
    if (showError(res)) setText("");
  }

  const remove = (id: string) => emitAck("global:delete", { id, authToken: getAuth()?.token }).then(showError);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={compact ? "btn-ghost btn-sm relative shrink-0 gap-1.5" : "btn-gold fixed right-4 bottom-4 z-40 gap-2 rounded-full px-4 py-3 shadow-xl"}
        title={t("globalChat.title")}
        aria-expanded={open}
      >
        {compact ? (
          <>
            🌐 <span className="hidden sm:inline">{t("globalChat.button")}</span>
          </>
        ) : (
          <>💬 {t("globalChat.button")}</>
        )}
        {unread > 0 && <span className="rounded-full bg-blood px-1.5 text-xs font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <section
          className={`rise fixed inset-x-2 ${compact ? "top-14 z-50" : "bottom-20 z-40"} flex h-[min(520px,70dvh)] flex-col gap-2 rounded-lg border border-gold/40 bg-night-800/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.6),inset_0_0_0_3px_#1a153d] backdrop-blur sm:inset-x-auto sm:right-4 sm:w-96`}
          aria-label={t("globalChat.title")}
        >
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate font-display text-lg font-black text-moon">💬 {t("globalChat.title")}</h2>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label={t("common.close")}>
              ✕
            </button>
          </div>
          <p className="text-xs text-white/50">{t("globalChat.hint")}</p>

          <div ref={list} className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-night-950/60 p-2">
            {!messages.length ? (
              <p className="py-8 text-center text-sm text-white/40">{t("globalChat.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {messages.map((m) => {
                  const look = { name: m.name, avatar: "👤", avatarUrl: m.avatarUrl, style: m.style ?? undefined, alive: true };
                  return (
                    <li key={m.id} className="group flex gap-2">
                      <ProfileLink userId={m.userId} className="shrink-0">
                        <Avatar p={look} size="sm" />
                      </ProfileLink>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <ProfileLink userId={m.userId} className="min-w-0">
                            <StyledName p={look} className="truncate text-sm font-bold" />
                          </ProfileLink>
                          <span className="shrink-0 text-[10px] text-white/40">
                            {new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {me?.isAdmin && (
                            <button
                              className="ml-auto shrink-0 text-[10px] text-blood-light opacity-0 group-hover:opacity-100 focus:opacity-100"
                              onClick={() => remove(m.id)}
                            >
                              {t("globalChat.remove")}
                            </button>
                          )}
                        </div>
                        <p className="text-sm leading-snug break-words text-white/85">{m.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {me ? (
            <form onSubmit={send} className="flex gap-2">
              <input
                className="ui-input min-w-0 flex-1 py-2 text-base"
                value={text}
                maxLength={CHAT_MAX_LEN}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("globalChat.placeholder")}
                aria-label={t("globalChat.placeholder")}
              />
              <button className="btn-primary px-4" disabled={busy || !text.trim()}>
                {t("globalChat.send")}
              </button>
            </form>
          ) : (
            <p className="text-center text-sm text-gold">
              🔐 {t("globalChat.signIn")}{" "}
              <Link href="/profile" className="underline">
                {t("profile.open")}
              </Link>
            </p>
          )}
        </section>
      )}
    </>
  );
}
