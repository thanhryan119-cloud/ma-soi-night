"use client";

// The server-wide chat: one channel everyone on the site can read, at any
// time. Outside a room it opens from a button in the corner of the page; in a
// room it is a tab of the chat box (SocialPanel). Posting needs a Google
// account; admins can remove a line.
//
// The same box has an "Online" tab (who has the chat open) and one tab per
// private conversation: signed-in players can write to each other there.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LEN, dmPeer, type DirectMessage, type GlobalMessage, type OnlineList, type OnlineUser } from "@shared/social";
import type { FriendRelation, FriendsState, RoomInvite } from "@shared/friends";
import { Avatar, StyledName, toast, useErrorToast } from "@/components/ui";
import { ProfileLink } from "@/components/Profile";
import { useOtherRoom } from "@/components/CreateRoomGate";
import { getAuth, loadLocalProfile, useAccount } from "@/lib/account";
import { useLocale, useT } from "@/lib/i18n";
import { emitAck, getDeviceId, getSocket, playerKey, storage } from "@/lib/socket";
import { WhereChip } from "@/components/Friends";

type Friends = FriendsState<OnlineUser>;
type Invite = RoomInvite<OnlineUser>;
const NO_FRIENDS: Friends = { friends: [], incoming: [], outgoing: [] };

const SEEN_KEY = "msn:globalChatSeen";
const DM_SEEN_KEY = "msn:dmSeen";
const OPEN_KEY = "msn:globalChatOpen";
/** How many components listen: the channel is only left when the last one goes. */
let listeners = 0;

/** What the box shows: the server chat, who is online, friends, or a private conversation (the other account's id). */
export type ChatView = "global" | "online" | "friends" | { dm: string };

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
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const showError = useErrorToast();
  const account = useAccount();
  const me = account?.user ?? null;
  const [friends, setFriends] = useState<Friends>(NO_FRIENDS);
  const [invites, setInvites] = useState<Invite[]>([]);
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
      emitAck<{
        messages: GlobalMessage[];
        online: OnlineList;
        dms: DirectMessage[];
        peers: Record<string, OnlineUser>;
        friends: Friends | null;
        invites: Invite[];
      }>("global:join", {
        authToken: getAuth()?.token,
      }).then((r) => {
        if (!r.ok) return;
        setMessages(r.messages ?? []);
        if (r.online) setOnline(r.online);
        setDms(r.dms ?? []);
        setPeers(r.peers ?? {});
        setFriends(r.friends ?? NO_FRIENDS);
        setInvites(r.invites ?? []);
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
    const asked = (e: { user: OnlineUser }) => toast(tRef.current("friends.requestToast", { name: e.user.name }), "info");
    const accepted = (e: { user: OnlineUser }) => toast(tRef.current("friends.acceptedToast", { name: e.user.name }), "info");
    const invited = (i: Invite) => setInvites((xs) => [...xs.filter((x) => x.id !== i.id && x.from.id !== i.from.id), i]);
    const inviteGone = (e: { id: string }) => setInvites((xs) => xs.filter((x) => x.id !== e.id));
    listeners++;
    s.on("global:new", added);
    s.on("global:deleted", deleted);
    s.on("global:online", setOnline);
    s.on("dm:new", dm);
    s.on("friends:state", setFriends);
    s.on("friends:request", asked);
    s.on("friends:accepted", accepted);
    s.on("invite:new", invited);
    s.on("invite:gone", inviteGone);
    return () => {
      s.off("global:new", added);
      s.off("global:deleted", deleted);
      s.off("global:online", setOnline);
      s.off("dm:new", dm);
      s.off("friends:state", setFriends);
      s.off("friends:request", asked);
      s.off("friends:accepted", accepted);
      s.off("invite:new", invited);
      s.off("invite:gone", inviteGone);
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

  /** Where `id` stands with me: friends, a request either way, or nothing. */
  const relation = (id: string): FriendRelation =>
    friends.friends.some((u) => u.id === id)
      ? "friend"
      : friends.outgoing.some((u) => u.id === id)
        ? "sent"
        : friends.incoming.some((u) => u.id === id)
          ? "received"
          : "none";
  const friendCall = async (event: string, payload: Record<string, unknown>) => {
    const res = await emitAck<{ friends: Friends; nowFriends: boolean }>(event, { ...payload, authToken: getAuth()?.token });
    if (!showError(res)) return res;
    if (res.friends) setFriends(res.friends);
    return res;
  };
  const addFriend = async (u: OnlineUser) => {
    const res = await friendCall("friend:request", { id: u.id });
    if (res.ok) toast(t(res.nowFriends ? "friends.acceptedToast" : "friends.sentToast", { name: u.name }), "info");
  };
  const answerFriend = (u: OnlineUser, accept: boolean) => friendCall("friend:answer", { id: u.id, accept });
  const removeFriend = (u: OnlineUser) => friendCall("friend:remove", { id: u.id });
  /** Asks someone online into the room this player is in. */
  const invite = async (u: OnlineUser) => {
    const res = await emitAck("invite:send", { to: u.id, authToken: getAuth()?.token });
    if (showError(res)) toast(t("friends.inviteSent", { name: u.name }), "info");
  };
  const declineInvite = (i: Invite) => {
    setInvites((xs) => xs.filter((x) => x.id !== i.id));
    emitAck("invite:decline", { id: i.id, authToken: getAuth()?.token });
  };
  const dropInvite = (i: Invite) => setInvites((xs) => xs.filter((x) => x.id !== i.id));

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
    friends,
    relation,
    addFriend,
    answerFriend,
    removeFriend,
    invites,
    invite,
    declineInvite,
    dropInvite,
    unread: unreadGlobal + unreadDms + friends.incoming.length,
  };
}

type Global = ReturnType<typeof useGlobalChat>;

const Badge = ({ n }: { n: number }) =>
  n > 0 ? <span className="rounded-full bg-blood px-1.5 text-[10px] leading-4 font-bold text-white">{n > 99 ? "99+" : n}</span> : null;

/**
 * The tabs (server chat, online, friends, one per private conversation) and the open one.
 * `canInvite`: this player sits in a room that waits for players, so others can be asked in.
 */
export function ServerChat({ chat, canInvite = false, className = "" }: { chat: Global; canInvite?: boolean; className?: string }) {
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
        <button role="tab" aria-selected={view === "friends"} className={tab(view === "friends")} onClick={() => setView("friends")}>
          👥 {t("friends.tab")} <Badge n={chat.friends.incoming.length} />
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
        <OnlineList chat={chat} canInvite={canInvite} className="flex-1" />
      ) : view === "friends" ? (
        <FriendsList chat={chat} canInvite={canInvite} className="flex-1" />
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
                           title={t("globalChat.message")}>
                            ✉️<span className="sr-only">{t("globalChat.message")}</span>
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

const iconBtn = "btn-ghost btn-sm shrink-0 border-gold/40 px-2 text-xs text-gold";

/** The buttons next to another account: invite into my room, add as a friend, message. */
function PersonActions({ chat, u, canInvite }: { chat: Global; u: OnlineUser; canInvite: boolean }) {
  const t = useT();
  const rel = chat.relation(u.id);
  return (
    <span className="flex shrink-0 items-center gap-1">
      {canInvite && (
        <button className={iconBtn} onClick={() => chat.invite(u)} title={t("friends.invite")} aria-label={t("friends.invite")}>
          ➕
        </button>
      )}
      {rel === "none" ? (
        <button className={iconBtn} onClick={() => chat.addFriend(u)} title={t("friends.add")} aria-label={t("friends.add")}>
          🤝
        </button>
      ) : rel === "received" ? (
        <button className={iconBtn} onClick={() => chat.answerFriend(u, true)} title={t("friends.accept")} aria-label={t("friends.accept")}>
          ✔️
        </button>
      ) : rel === "sent" ? (
        <span className="px-1 text-[10px] text-white/40" title={t("friends.pending")}>
          ⏳
        </span>
      ) : (
        <span className="px-1 text-xs" title={t("friends.isFriend")} aria-label={t("friends.isFriend")}>
          👥
        </span>
      )}
      <button className={iconBtn} onClick={() => chat.openDm(u)} title={t("globalChat.message")} aria-label={t("globalChat.message")}>
        ✉️
      </button>
    </span>
  );
}

/** One account in a list: photo, name, online dot, and what to do with them. */
function PersonRow({ chat, u, online, children }: { chat: Global; u: OnlineUser; online?: boolean; children?: React.ReactNode }) {
  const t = useT();
  const look = lookOf(u);
  const self = u.id === chat.me?.id;
  return (
    <li className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/5">
      <ProfileLink userId={u.id} className="min-w-0 flex-1 gap-2">
        <span className="relative shrink-0">
          <Avatar p={look} size="sm" />
          {online !== undefined && (
            <span
              className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-900 ${online ? "bg-emerald-400" : "bg-white/30"}`}
              aria-hidden
            />
          )}
        </span>
        <span className="flex min-w-0 flex-col items-start">
          <span className="flex max-w-full items-center gap-1">
            <StyledName p={look} className="truncate text-sm font-bold" />
            {self && <span className="shrink-0 text-[10px] text-white/40">({t("globalChat.you")})</span>}
          </span>
          {online && u.where && <WhereChip where={u.where} link={false} />}
        </span>
      </ProfileLink>
      {children}
    </li>
  );
}

/** Friends, the requests waiting for an answer, and the ones I sent. */
function FriendsList({ chat, canInvite, className = "" }: { chat: Global; canInvite: boolean; className?: string }) {
  const t = useT();
  const { me, friends, online } = chat;
  const isOnline = (id: string) => online.users.some((u) => u.id === id);
  // Online friends first.
  const list = [...friends.friends].sort((a, b) => Number(isOnline(b.id)) - Number(isOnline(a.id)) || a.name.localeCompare(b.name));
  const heading = "mt-2 mb-1 px-1 text-[11px] font-bold tracking-wide text-gold/80 uppercase first:mt-0";
  if (!me) return <div className={`flex min-h-0 flex-col justify-end ${className}`}><SignInLine text={t("friends.signIn")} /></div>;
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-night-950/60 p-2">
        {friends.incoming.length > 0 && (
          <>
            <h3 className={heading}>{t("friends.incoming")}</h3>
            <ul className="flex flex-col gap-1">
              {friends.incoming.map((u) => (
                <PersonRow key={u.id} chat={chat} u={u} online={isOnline(u.id)}>
                  <button className="btn-primary btn-sm shrink-0 px-2 text-xs" onClick={() => chat.answerFriend(u, true)}>
                    {t("friends.accept")}
                  </button>
                  <button className="btn-ghost btn-sm shrink-0 px-2 text-xs" onClick={() => chat.answerFriend(u, false)}>
                    {t("friends.decline")}
                  </button>
                </PersonRow>
              ))}
            </ul>
          </>
        )}
        <h3 className={heading}>{t("friends.title", { n: list.length })}</h3>
        {!list.length ? (
          <p className="py-4 text-center text-sm text-white/40">{t("friends.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((u) => (
              <PersonRow key={u.id} chat={chat} u={u} online={isOnline(u.id)}>
                {canInvite && isOnline(u.id) && (
                  <button className={iconBtn} onClick={() => chat.invite(u)} title={t("friends.invite")} aria-label={t("friends.invite")}>
                    ➕
                  </button>
                )}
                <button className={iconBtn} onClick={() => chat.openDm(u)} title={t("globalChat.message")} aria-label={t("globalChat.message")}>
                  ✉️
                </button>
                <button
                  className="btn-ghost btn-sm shrink-0 px-2 text-xs text-white/50 hover:text-blood-light"
                  onClick={() => window.confirm(t("friends.removeConfirm", { name: u.name })) && chat.removeFriend(u)}
                  title={t("friends.remove")}
                  aria-label={t("friends.remove")}
                >
                  ✕
                </button>
              </PersonRow>
            ))}
          </ul>
        )}
        {friends.outgoing.length > 0 && (
          <>
            <h3 className={heading}>{t("friends.outgoing")}</h3>
            <ul className="flex flex-col gap-1">
              {friends.outgoing.map((u) => (
                <PersonRow key={u.id} chat={chat} u={u}>
                  <button className="btn-ghost btn-sm shrink-0 px-2 text-xs" onClick={() => chat.removeFriend(u)}>
                    {t("friends.cancel")}
                  </button>
                </PersonRow>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="shrink-0 text-xs text-white/50">{t("friends.hint")}</p>
    </div>
  );
}

/**
 * Invites to someone's room, as cards at the top of the page: going in joins
 * that room right away (past its password), "Later" turns it down.
 */
export function InviteCards({ chat }: { chat: Global }) {
  const t = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const showError = useErrorToast();
  const other = useOtherRoom();
  const [busy, setBusy] = useState<string | null>(null);

  async function accept(i: Invite, leaveOther = false) {
    const auth = getAuth();
    const profile = loadLocalProfile();
    setBusy(i.id);
    const res = await emitAck<{ playerId: string; token: string }>("player:join", {
      code: i.code,
      name: profile.name || auth?.user.name || i.from.name,
      avatar: profile.avatar,
      style: profile.style,
      authToken: auth?.token,
      deviceId: getDeviceId(),
      leaveOther,
      locale,
      password: "",
    });
    setBusy(null);
    if (other.caught(res, () => accept(i, true))) return;
    chat.dropInvite(i);
    if (!showError(res) || !res.playerId || !res.token) return;
    storage.set(playerKey(i.code), { playerId: res.playerId, token: res.token });
    router.push(`/join/${i.code}`);
  }

  if (!chat.invites.length && !other.dialog) return null;
  return (
    <>
      {other.dialog}
      <div className="pointer-events-none fixed inset-x-2 top-14 z-50 flex flex-col items-center gap-2" role="status">
        {chat.invites.slice(-3).map((i) => {
          const look = lookOf(i.from);
          return (
            <div
              key={i.id}
              className="rise pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-gold/60 bg-night-800/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur"
            >
              <Avatar p={look} size="sm" />
              <p className="min-w-0 flex-1 text-sm leading-snug text-white/90">
                {t("friends.inviteCard", { name: i.from.name, code: i.code })}
              </p>
              <div className="flex shrink-0 flex-col gap-1">
                <button className="btn-primary btn-sm px-3 text-xs" disabled={busy === i.id} onClick={() => accept(i)}>
                  {t("friends.inviteJoin")}
                </button>
                <button className="btn-ghost btn-sm px-3 text-xs" onClick={() => chat.declineInvite(i)}>
                  {t("friends.inviteLater")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Who has the server chat open: accounts listed, guests counted. */
function OnlineList({ chat, canInvite, className = "" }: { chat: Global; canInvite: boolean; className?: string }) {
  const t = useT();
  const { online, me } = chat;
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-night-950/60 p-2">
        {!online.users.length ? (
          <p className="py-6 text-center text-sm text-white/40">{t("globalChat.onlineEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {online.users.map((u) => (
              <PersonRow key={u.id} chat={chat} u={u} online>
                {me && u.id !== me.id && <PersonActions chat={chat} u={u} canInvite={canInvite} />}
              </PersonRow>
            ))}
          </ul>
        )}
        {online.guests > 0 && <p className="mt-2 text-center text-xs text-white/40">{t("globalChat.guests", { n: online.guests })}</p>}
      </div>
      {me && canInvite && <p className="shrink-0 text-xs text-white/50">➕ {t("friends.inviteHint")}</p>}
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
        {me && chat.relation(peerId) === "none" && (
          <button className={iconBtn} onClick={() => chat.addFriend(peer)} title={t("friends.add")} aria-label={t("friends.add")}>
            🤝
          </button>
        )}
        {me && chat.relation(peerId) === "received" && (
          <button className={iconBtn} onClick={() => chat.answerFriend(peer, true)} title={t("friends.accept")} aria-label={t("friends.accept")}>
            ✔️ 🤝
          </button>
        )}
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
export function GlobalChat({ render }: { render?: (chat: Global) => React.ReactNode } = {}) {
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
      {/* The page can show the same online list and friends (one connection, one set of toasts). */}
      {render?.(chat)}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-gold fixed right-4 bottom-4 z-40 gap-2 rounded-full px-4 py-3 shadow-xl"
        aria-expanded={open}
        title={t("globalChat.title")}
      >
        💬<span className="sr-only">{t("globalChat.button")}</span>
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
      <InviteCards chat={chat} />
    </>
  );
}
