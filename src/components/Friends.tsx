"use client";

// Friends: add someone from their profile card or the Online list, then see
// on the home page when they are online and which room they are in.

import Link from "next/link";
import { useState } from "react";
import type { OnlineUser, Whereabouts } from "@shared/social";
import { useAccount } from "@/lib/account";
import { isFriend, setFriend, useFriends } from "@/lib/friends";
import { useT } from "@/lib/i18n";
import { useErrorToast } from "./ui";

/** "Add friend" / "Friends ✓". Hidden on your own card. */
export function FriendButton({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const t = useT();
  const me = useAccount()?.user.id;
  const friends = useFriends();
  const showError = useErrorToast();
  const [busy, setBusy] = useState(false);
  if (userId === me) return null;
  const on = isFriend(friends, userId);
  async function toggle() {
    if (!me) return showError({ ok: false, error: "err.signInForFriends" });
    setBusy(true);
    showError(await setFriend(userId, !on));
    setBusy(false);
  }
  const label = on ? t("friends.remove") : t("friends.add");
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={label}
      aria-pressed={on}
      className={`btn-sm shrink-0 ${on ? "btn-ghost text-emerald-300" : "btn-ghost border-gold/40 text-gold"} ${compact ? "px-2 text-xs" : ""}`}
    >
      {on ? "🤝" : "➕"}
      {compact ? <span className="sr-only">{label}</span> : <span>{on ? t("friends.isFriend") : t("friends.add")}</span>}
    </button>
  );
}

/** "Playing in ABCD", "Waiting in a room", "Watching", or "Online". */
export function WhereChip({ where }: { where?: Whereabouts }) {
  const t = useT();
  if (!where) return <span className="text-[11px] text-emerald-300/80">{t("friends.idle")}</span>;
  const text = t(`friends.${where.status}`);
  if (!where.code)
    return <span className="text-[11px] text-white/50">{text}</span>;
  // A listed room: one tap to go there (join while it waits, watch while it plays).
  const href = where.status === "waiting" ? `/join/${where.code}` : `/watch/${where.code}`;
  return (
    <Link href={href} className="text-[11px] font-semibold text-gold underline-offset-2 hover:underline">
      {text} · {where.code} →
    </Link>
  );
}

/** Online first (busiest first), then the rest by name. */
export function sortByPresence(list: (OnlineUser & { online?: boolean })[]) {
  const rank = (u: OnlineUser & { online?: boolean }) =>
    !u.online ? 0 : u.where?.status === "playing" ? 4 : u.where?.status === "waiting" ? 3 : u.where ? 2 : 1;
  return [...list].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
}
