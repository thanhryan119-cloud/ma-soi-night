"use client";

// Home page: who is online right now, and which of your friends are (with
// the room they are in, one tap away when it is a public room).

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OnlineList, OnlineUser } from "@shared/social";
import { useAccount } from "@/lib/account";
import { useFriends } from "@/lib/friends";
import { useT } from "@/lib/i18n";
import { FriendButton, WhereChip, sortByPresence } from "./Friends";
import { ProfileLink } from "./Profile";
import { Avatar, StyledName } from "./ui";

type Tab = "online" | "friends";

const lookOf = (u: OnlineUser) => ({ name: u.name, avatar: "👤", avatarUrl: u.avatarUrl, style: u.style ?? undefined, alive: true });

export function OnlinePeople({ online, className = "" }: { online: OnlineList; className?: string }) {
  const t = useT();
  const me = useAccount()?.user.id ?? null;
  const friends = useFriends();
  const [tab, setTab] = useState<Tab>("online");

  const byId = new Map(online.users.map((u) => [u.id, u]));
  const friendRows = sortByPresence(friends.map((f) => (byId.has(f.id) ? { ...byId.get(f.id)!, online: true } : { ...f, online: false })));
  const friendsOnline = friendRows.filter((f) => f.online).length;
  const onlineRows = sortByPresence(online.users.map((u) => ({ ...u, online: true })));

  // Signed in with friends online: open on the Friends tab, once.
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (!picked && friendsOnline > 0) {
      setTab("friends");
      setPicked(true);
    }
  }, [friendsOnline, picked]);

  const tabBtn = (id: Tab, label: string, count: string) => (
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
    </button>
  );

  const row = (u: OnlineUser & { online?: boolean }) => {
    const look = lookOf(u);
    return (
      <li key={u.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 ${u.online ? "" : "opacity-55"}`}>
        <ProfileLink userId={u.id} className="min-w-0 shrink-0 gap-2">
          <span className="relative shrink-0">
            <Avatar p={look} size="sm" />
            <span
              className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-800 ${u.online ? "bg-emerald-400" : "bg-white/30"}`}
              aria-hidden
            />
          </span>
        </ProfileLink>
        <span className="flex min-w-0 flex-1 flex-col">
          <ProfileLink userId={u.id} className="min-w-0 justify-start">
            <StyledName p={look} className="truncate text-sm font-bold" />
            {u.id === me && <span className="ml-1 shrink-0 text-[10px] text-white/40">({t("globalChat.you")})</span>}
          </ProfileLink>
          {u.online ? <WhereChip where={u.where} /> : <span className="text-[11px] text-white/40">{t("people.offline")}</span>}
        </span>
        {me && <FriendButton userId={u.id} compact />}
      </li>
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
        {tabBtn("friends", `🤝 ${t("people.tabFriends")}`, me ? `${friendsOnline}/${friends.length}` : "0")}
      </div>
      <div className="max-h-96 min-h-48 overflow-y-auto">
        {tab === "online" ? (
          <>
            {!onlineRows.length ? (
              <p className="py-8 text-center text-sm text-white/50">{t("people.emptyOnline")}</p>
            ) : (
              <ul className="flex flex-col gap-0.5">{onlineRows.map(row)}</ul>
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
        ) : !friendRows.length ? (
          <p className="px-4 py-8 text-center text-sm text-white/60">{t("people.noFriends")}</p>
        ) : (
          <>
            <p className="mb-1 px-2 text-xs text-white/50">{t("people.friendsOnline", { online: friendsOnline, total: friendRows.length })}</p>
            <ul className="flex flex-col gap-0.5">{friendRows.map(row)}</ul>
          </>
        )}
      </div>
    </section>
  );
}
