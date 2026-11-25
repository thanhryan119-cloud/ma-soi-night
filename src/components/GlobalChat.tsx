"use client";

// The server-wide chat: one channel everyone on the site can read, at any
// time. Outside a room it opens from a button in the corner of the page; in a
// room it is a tab of the chat box (SocialPanel). Posting needs a Google
// account; admins can remove a line.
//
// The same box has an "Online" tab (who has the chat open) and one tab per
// private conversation: signed-in players can write to each other there.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LEN, dmPeer, type DirectMessage, type GlobalMessage, type OnlineList, type OnlineUser } from "@shared/social";
import { Avatar, StyledName, useErrorToast } from "@/components/ui";
import { ProfileLink } from "@/components/Profile";
import { getAuth, useAccount } from "@/lib/account";
import { useT } from "@/lib/i18n";
import { emitAck, getSocket, storage } from "@/lib/socket";

const SEEN_KEY = "msn:globalChatSeen";
const DM_SEEN_KEY = "msn:dmSeen";
const OPEN_KEY = "msn:globalChatOpen";
/** How many components listen: the channel is only left when the last one goes. */
let listeners = 0;

/** What the box shows: the server chat, who is online, or a private conversation (the other account's id). */
export type ChatView = "global" | "online" | { dm: string };

const lookOf = (u: Pick<OnlineUser, "name" | "avatarUrl" | "style">) => ({
  name: u.name,
  avatar: "👤",
  avatarUrl: u.avatarUrl,
  style: u.style ?? undefined,
  alive: true,
});

/**
 * The channel's messages, who is online, the private conversations and the
 * unread counts. `visible`: the box is on screen, so the open tab counts as read.
 */
export function useGlobalChat(visible: boolean) {
  const account = useAccount();
  const me = account?.user ?? null;
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [online, setOnline] = useState<OnlineList>({ users: [], guests: 0 });
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [peers, setPeers] = useState<Record<string, OnlineUser>>({});
  const [seen, setSeen] = useState(0);
  const [dmSeen, setDmSeen] = useState<Record<string, number>>({});
  const [view, setView] = useState<ChatView>("global");

  useEffect(() => {
    setSeen(storage.get<number>(SEEN_KEY) ?? 0);
    setDmSeen(storage.get<Record<string, number>>(DM_SEEN_KEY) ?? {});
  }, []);

  // Join (again whenever the account changes, so the server knows who this is).
  useEffect(() => {
    const s = getSocket();
    const join = () =>
      emitAck<{ messages: GlobalMessage[]; online: OnlineList; dms: DirectMessage[]; peers: Record<string, OnlineUser> }>("global:join", {
        authToken: getAuth()?.token,
      }).then((r) => {
        if (!r.ok) return;
        setMessages(r.messages ?? []);
        if (r.online) setOnline(r.online);
        setDms(r.dms ?? []);
        setPeers(r.peers ?? {});
      });
    join();
    s.on("connect", join);
    return () => {
      s.off("connect", join);
    };
  }, [me?.id]);

  useEffect(() => {
    const s = getSocket();
    const added = (m: GlobalMessage) => setMessages((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m].slice(-100)));
    const deleted = (e: { id: string }) => setMessages((xs) => xs.filter((x) => x.id !== e.id));
    const dm = (e: { msg: DirectMessage; peer: OnlineUser }) => {
      setDms((xs) => (xs.some((x) => x.id === e.msg.id) ? xs : [...xs, e.msg]));
      setPeers((ps) => ({ ...ps, [e.peer.id]: e.peer }));
    };
    listeners++;
    s.on("global:new", added);
    s.on("global:deleted", deleted);
    s.on("global:online", setOnline);
    s.on("dm:new", dm);
    return () => {
      s.off("global:new", added);
      s.off("global:deleted", deleted);
      s.off("global:online", setOnline);
      s.off("dm:new", dm);
      if (--listeners === 0) emitAck("global:leave");
    };
  }, []);

  // The tab on screen counts as read.
  const newest = messages[messages.length - 1]?.t ?? 0;
  useEffect(() => {
    if (!visible || view !== "global" || !newest) return;
    setSeen(newest);
    storage.set(SEEN_KEY, newest);
  }, [visible, view, newest]);
  const openPeer = typeof view === "object" ? view.dm : null;
  const newestDm = me && openPeer ? (dms.filter((m) => dmPeer(m, me.id) === openPeer).at(-1)?.t ?? 0) : 0;
  useEffect(() => {
    if (!visible || !openPeer || !newestDm) return;
    setDmSeen((s) => {
      const next = { ...s, [openPeer]: newestDm };
      storage.set(DM_SEEN_KEY, next);
      return next;
    });
  }, [visible, openPeer, newestDm]);

  const unreadGlobal = visible && view === "global" ? 0 : messages.filter((m) => m.t > seen && m.userId !== me?.id).length;
  const unreadDm = (peer: string) =>
    !me || (visible && openPeer === peer) ? 0 : dms.filter((m) => m.from === peer && m.to === me.id && m.t > (dmSeen[peer] ?? 0)).length;
  // Conversations, the most recent first.
  const conversations = me
    ? [...new Set(dms.map((m) => dmPeer(m, me.id)).reverse())].filter((id) => peers[id])
    : [];
  const unreadDms = conversations.reduce((n, id) => n + unreadDm(id), 0);

  /** Opens a private conversation (with someone from the Online list or a chat line). */
  const openDm = (u: OnlineUser) => {
    setPeers((ps) => ({ ...ps, [u.id]: ps[u.id] ?? u }));
    setView({ dm: u.id });
  };

  return {
    messages,
    online,
    dms,
    peers,
    me,
    view,
    setView,
    openDm,
    conversations,
    unreadDm,
    unreadGlobal,
    unread: unreadGlobal + unreadDms,
  };
}

type Global = ReturnType<typeof useGlobalChat>;

const Badge = ({ n }: { n: number }) =>
  n > 0 ? <span className="rounded-full bg-blood px-1.5 text-[10px] leading-4 font-bold text-white">{n > 99 ? "99+" : n}</span> : null;

/** The tabs (server chat, online, one per private conversation) and the open one. */
export function ServerChat({ chat, className = "" }: { chat: Global; className?: string }) {
  const t = useT();
  const { view, setView, conversations, peers, online } = chat;
  const openPeer = typeof view === "object" ? view.dm : null;
  // Someone just opened from the Online list has no line yet: they still get a tab.
  const tabs = openPeer && !conversations.includes(openPeer) ? [openPeer, ...conversations] : conversations;
  const tab = (active: boolean) =>
    `flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition ${
      active ? "border-gold bg-gold/15 text-gold" : "border-white/15 text-white/70 hover:border-white/40"
    }`;
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-0.5" role="tablist">
        <button role="tab" aria-selected={view === "global"} className={tab(view === "global")} onClick={() => setView("global")}>
          💬 {t("globalChat.tabGeneral")} <Badge n={chat.unreadGlobal} />
        </button>
        <button role="tab" aria-selected={view === "online"} className={tab(view === "online")} onClick={() => setView("online")}>
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden /> {t("globalChat.tabOnline")}{" "}
          <span className="font-normal tabular-nums">{online.users.length + online.guests}</span>
        </button>
        {tabs.map((id) => {
          const p = peers[id];
          if (!p) return null;
          return (
            <button key={id} role="tab" aria-selected={openPeer === id} className={tab(openPeer === id)} onClick={() => setView({ dm: id })}>
              ✉️ <span className="max-w-24 truncate">{p.name}</span> <Badge n={chat.unreadDm(id)} />
            </button>
          );
        })}
      </div>
      {view === "global" ? (
        <GlobalChatLog chat={chat} className="flex-1" />
      ) : view === "online" ? (
        <OnlineList chat={chat} className="flex-1" />
      ) : (
        <DirectChat chat={chat} peerId={view.dm} className="flex-1" />
      )}
    </div>
  );
}

/** The hint, the messages and (signed in) the box to write in. */
export function GlobalChatLog({ chat, className = "" }: { chat: Global; className?: string }) {
  const t = useT();
  const showError = useErrorToast();
  const { messages, me } = chat;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const newest = messages[messages.length - 1]?.id;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [newest]);

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
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <p className="shrink-0 text-xs text-white/50">{t("globalChat.hint")}</p>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-night-950/60 p-2">
        {!messages.length ? (
          <p className="py-8 text-center text-sm text-white/40">{t("globalChat.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const look = lookOf(m);
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
                      <span className="ml-auto flex shrink-0 gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                        {me && m.userId !== me.id && (
                          <button
                            className="text-[10px] text-gold"
                            onClick={() => chat.openDm({ id: m.userId, name: m.name, avatarUrl: m.avatarUrl, style: m.style })}
                          >
                            ✉️ {t("globalChat.message")}
                          </button>
                        )}
                        {me?.isAdmin && (
                          <button className="text-[10px] text-blood-light" onClick={() => remove(m.id)}>
                            {t("globalChat.remove")}
                          </button>
                        )}
                      </span>
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
        <ChatInput placeholder={t("globalChat.placeholder")} text={text} setText={setText} busy={busy} onSubmit={send} />
      ) : (
        <SignInLine text={t("globalChat.signIn")} />
      )}
    </div>
  );
}

function ChatInput({
  placeholder,
  text,
  setText,
  busy,
  onSubmit,
}: {
  placeholder: string;
  text: string;
  setText: (v: string) => void;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const t = useT();
  return (
    <form onSubmit={onSubmit} className="flex shrink-0 gap-2">
      <input
        className="ui-input min-w-0 flex-1 py-2 text-base"
        value={text}
        maxLength={CHAT_MAX_LEN}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <button className="btn-primary px-4" disabled={busy || !text.trim()}>
        {t("globalChat.send")}
      </button>
    </form>
  );
}

function SignInLine({ text }: { text: string }) {
  const t = useT();
  return (
    <p className="shrink-0 text-center text-sm text-gold">
      🔐 {text}{" "}
      <Link href="/profile" className="underline">
        {t("profile.open")}
      </Link>
    </p>
  );
}

/** Who has the server chat open: accounts listed, guests counted. */
function OnlineList({ chat, className = "" }: { chat: Global; className?: string }) {
  const t = useT();
  const { online, me } = chat;
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-night-950/60 p-2">
        {!online.users.length ? (
          <p className="py-6 text-center text-sm text-white/40">{t("globalChat.onlineEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {online.users.map((u) => {
              const look = lookOf(u);
              const self = u.id === me?.id;
              return (
                <li key={u.id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/5">
                  <ProfileLink userId={u.id} className="min-w-0 flex-1 gap-2">
                    <span className="relative shrink-0">
                      <Avatar p={look} size="sm" />
                      <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-900 bg-emerald-400" aria-hidden />
                    </span>
                    <StyledName p={look} className="truncate text-sm font-bold" />
                    {self && <span className="shrink-0 text-[10px] text-white/40">({t("globalChat.you")})</span>}
                  </ProfileLink>
                  {me && !self && (
                    <button className="btn-ghost btn-sm shrink-0 border-gold/40 text-xs text-gold" onClick={() => chat.openDm(u)}>
                      ✉️ {t("globalChat.message")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {online.guests > 0 && <p className="mt-2 text-center text-xs text-white/40">{t("globalChat.guests", { n: online.guests })}</p>}
      </div>
      {!me && <SignInLine text={t("globalChat.dmSignIn")} />}
    </div>
  );
}

/** One private conversation. */
function DirectChat({ chat, peerId, className = "" }: { chat: Global; peerId: string; className?: string }) {
  const t = useT();
  const showError = useErrorToast();
  const { me, dms, peers, online } = chat;
  const peer = peers[peerId];
  const lines = me ? dms.filter((m) => dmPeer(m, me.id) === peerId) : [];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const newest = lines.at(-1)?.id;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [newest, peerId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await emitAck("dm:send", { to: peerId, text, authToken: getAuth()?.token });
    setBusy(false);
    if (showError(res)) setText("");
  }

  if (!peer) return null;
  const look = lookOf(peer);
  const isOnline = online.users.some((u) => u.id === peerId);
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="flex shrink-0 items-center gap-2">
        <ProfileLink userId={peerId} className="min-w-0 flex-1 gap-2">
          <Avatar p={look} size="sm" />
          <StyledName p={look} className="truncate text-sm font-bold" />
          <span className={`shrink-0 text-[10px] ${isOnline ? "text-emerald-300" : "text-white/40"}`}>
            {isOnline ? `● ${t("globalChat.tabOnline")}` : t("globalChat.offline")}
          </span>
        </ProfileLink>
        <button className="btn-ghost btn-sm shrink-0 text-xs" onClick={() => chat.setView("global")} aria-label={t("common.close")}>
          ✕
        </button>
      </div>
      <p className="shrink-0 text-xs text-white/50">🔒 {t("globalChat.dmHint")}</p>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-night-950/60 p-2">
        {!lines.length ? (
          <p className="py-8 text-center text-sm text-white/40">{t("globalChat.dmEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lines.map((m) => {
              const mine = m.from === me?.id;
              return (
                <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm leading-snug break-words ${
                      mine ? "rounded-br-sm bg-gold/20 text-moon" : "rounded-bl-sm bg-white/10 text-white/90"
                    }`}
                  >
                    {m.text}
                    <span className="ml-2 align-bottom text-[9px] text-white/40">
                      {new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {me ? (
        <ChatInput placeholder={t("globalChat.dmPlaceholder", { name: peer.name })} text={text} setText={setText} busy={busy} onSubmit={send} />
      ) : (
        <SignInLine text={t("globalChat.dmSignIn")} />
      )}
    </div>
  );
}

/**
 * Outside a room: the panel in the corner of the page, open by default. Closing
 * it leaves a button, and the choice is remembered.
 */
export function GlobalChat() {
  const t = useT();
  const [open, setOpenState] = useState(false);
  useEffect(() => setOpenState(storage.get<boolean>(OPEN_KEY) ?? true), []);
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenState((o) => {
      const v = typeof next === "function" ? next(o) : next;
      storage.set(OPEN_KEY, v);
      return v;
    });
  const chat = useGlobalChat(open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-gold fixed right-4 bottom-4 z-40 gap-2 rounded-full px-4 py-3 shadow-xl"
        aria-expanded={open}
        title={t("globalChat.title")}
      >
        💬 {t("globalChat.button")}
        {chat.unread > 0 && <span className="rounded-full bg-blood px-1.5 text-xs font-bold text-white">{chat.unread > 99 ? "99+" : chat.unread}</span>}
      </button>

      {open && (
        <section
          className="rise fixed inset-x-2 bottom-20 z-40 flex h-[min(560px,72dvh)] flex-col gap-2 rounded-lg border border-gold/40 bg-night-800/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.6),inset_0_0_0_3px_#1a153d] backdrop-blur sm:inset-x-auto sm:right-4 sm:w-96"
          aria-label={t("globalChat.title")}
        >
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate font-display text-lg font-black text-moon">💬 {t("globalChat.title")}</h2>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label={t("common.close")}>
              ✕
            </button>
          </div>
          <ServerChat chat={chat} className="flex-1" />
        </section>
      )}
    </>
  );
}
