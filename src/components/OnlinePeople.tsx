"use client";

// Home page: who is online right now, and your friends (online first, with
// the room they are in, one tap away when it is a public room). Friend
// requests can be sent and answered right here.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OnlineUser } from "@shared/social";
import type { useGlobalChat } from "./GlobalChat";
import { useT } from "@/lib/i18n";
import { WhereChip, sortByPresence } from "./Friends";
import { ProfileLink } from "./Profile";
import { Avatar, CardBackdrop, StyledName } from "./ui";

type Chat = ReturnType<typeof useGlobalChat>;
type Tab = "online" | "friends";
type Row = OnlineUser & { online?: boolean };

const lookOf = (u: OnlineUser) => ({ name: u.name, avatar: "👤", avatarUrl: u.avatarUrl, style: u.style ?? undefined, alive: true });

export function OnlinePeople({ chat, className = "" }: { chat: Chat; className?: string }) {
  const t = useT();
  const { online, friends, me } = chat;
  const [tab, setTab] = useState<Tab>("online");

  const byId = new Map(online.users.map((u) => [u.id, u]));
  const friendRows = sortByPresence<Row>(
    friends.friends.map((f) => (byId.has(f.id) ? { ...byId.get(f.id)!, online: true } : { ...f, online: false })),
  );
  const friendsOnline = friendRows.filter((f) => f.online).length;
  const onlineRows = sortByPresence<Row>(online.users.map((u) => ({ ...u, online: true })));

  // Friends online or a request waiting: open on the Friends tab, once.
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (!picked && (friendsOnline > 0 || friends.incoming.length > 0)) {
      setTab("friends");
      setPicked(true);
    }
  }, [friendsOnline, friends.incoming.length, picked]);

  const tabBtn = (id: Tab, label: string, count: string, alert = 0) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => {
        setTab(id);
        setPicked(true);
      }}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-bold transition ${
        tab === id ? "bg-gold text-night-950" : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === id ? "bg-night-950/20" : "bg-white/10"}`}>{count}</span>
      {alert > 0 && <span className="rounded-full bg-blood px-1.5 text-[10px] leading-4 font-bold text-white">{alert}</span>}
    </button>
  );

  const row = (u: Row, action?: React.ReactNode) => {
    const look = lookOf(u);
    return (
      <li key={u.id} className={`relative isolate flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 ${u.online === false ? "opacity-55" : ""}`}>
        <CardBackdrop card={u.style?.card} />
        <ProfileLink userId={u.id} className="shrink-0">
          <span className="relative">
            <Avatar p={look} size="sm" />
            {u.online !== undefined && (
              <span
                className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-800 ${u.online ? "bg-emerald-400" : "bg-white/30"}`}
                aria-hidden
              />
            )}
          </span>
        </ProfileLink>
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <ProfileLink userId={u.id} className="max-w-full">
            <StyledName p={look} className="truncate text-sm font-bold" />
            {u.id === me?.id && <span className="ml-1 shrink-0 text-[10px] text-white/40">({t("globalChat.you")})</span>}
          </ProfileLink>
          {u.online === true ? (
            <WhereChip where={u.where} />
          ) : u.online === false ? (
            <span className="text-[11px] text-white/40">{t("people.offline")}</span>
          ) : null}
        </span>
        {action}
      </li>
    );
  };

  /** Add friend / request sent / accept, depending on where we stand. */
  const friendAction = (u: OnlineUser) => {
    if (!me || u.id === me.id) return null;
    const rel = chat.relation(u.id);
    if (rel === "friend") return <span className="shrink-0 text-xs text-emerald-300" title={t("friends.isFriend")}>🤝</span>;
    if (rel === "sent") return <span className="shrink-0 text-[11px] text-white/40">{t("friends.outgoing")}</span>;
    if (rel === "received")
      return (
        <button type="button" className="btn-primary btn-sm shrink-0 text-xs" onClick={() => chat.answerFriend(u, true)}>
          {t("friends.accept")}
        </button>
      );
    return (
      <button type="button" className="btn-ghost btn-sm shrink-0 border-gold/40 text-xs text-gold" onClick={() => chat.addFriend(u)} title={t("friends.add")}>
        🤝 {t("friends.add")}
      </button>
    );
  };

  return (
    <section className={`card flex flex-col gap-3 p-5 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="live-dot" aria-hidden />
        <h2 className="text-xl font-bold">{t("people.title")}</h2>
      </div>
      <div className="flex gap-1 rounded-lg border border-white/10 bg-night-950/50 p-1" role="tablist">
        {tabBtn("online", `🟢 ${t("people.tabOnline")}`, String(online.users.length + online.guests))}
        {tabBtn("friends", `🤝 ${t("people.tabFriends")}`, me ? `${friendsOnline}/${friendRows.length}` : "0", friends.incoming.length)}
      </div>
      <div className="max-h-96 min-h-48 overflow-y-auto">
        {tab === "online" ? (
          <>
            {!onlineRows.length ? (
              <p className="py-8 text-center text-sm text-white/50">{t("people.emptyOnline")}</p>
            ) : (
              <ul className="flex flex-col gap-0.5">{onlineRows.map((u) => row(u, friendAction(u)))}</ul>
            )}
            {online.guests > 0 && <p className="mt-2 text-center text-xs text-white/40">{t("people.guests", { n: online.guests })}</p>}
          </>
        ) : !me ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-white/60">{t("people.signIn")}</p>
            <Link href="/profile" className="btn-primary btn-sm">
              {t("home.signInButton")}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {friends.incoming.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-xs font-bold text-gold">{t("friends.incoming")}</p>
                <ul className="flex flex-col gap-0.5">
                  {friends.incoming.map((u) =>
                    row(
                      u,
                      <span className="flex shrink-0 gap-1">
                        <button type="button" className="btn-primary btn-sm text-xs" onClick={() => chat.answerFriend(u, true)}>
                          {t("friends.accept")}
                        </button>
                        <button type="button" className="btn-ghost btn-sm text-xs" onClick={() => chat.answerFriend(u, false)}>
                          {t("friends.decline")}
                        </button>
                      </span>,
                    ),
                  )}
                </ul>
              </div>
            )}
            {!friendRows.length ? (
              <p className="px-4 py-8 text-center text-sm text-white/60">{t("people.noFriends")}</p>
            ) : (
              <div>
                <p className="mb-1 px-2 text-xs text-white/50">{t("people.friendsOnline", { online: friendsOnline, total: friendRows.length })}</p>
                <ul className="flex flex-col gap-0.5">{friendRows.map((u) => row(u))}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
