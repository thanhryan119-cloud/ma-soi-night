"use client";

// Where someone online is: waiting in a room, playing, watching, or just
// online. A public room is one tap away from the home page.

import Link from "next/link";
import type { OnlineUser, Whereabouts } from "@shared/social";
import { useT } from "@/lib/i18n";

/** "Playing · ABCD →", "Waiting in a room", "Watching", or "Online". `link`: make a public room tappable. */
export function WhereChip({ where, link = true }: { where?: Whereabouts; link?: boolean }) {
  const t = useT();
  if (!where) return <span className="text-[11px] text-emerald-300/80">{t("presence.idle")}</span>;
  const text = t(`presence.${where.status}`);
  if (!where.code || !link) return <span className="text-[11px] text-white/50">{where.code ? `${text} · ${where.code}` : text}</span>;
  // Join while it waits, watch while it plays.
  const href = where.status === "waiting" ? `/join/${where.code}` : `/watch/${where.code}`;
  return (
    <Link href={href} className="text-[11px] font-semibold text-gold underline-offset-2 hover:underline">
      {text} · {where.code} →
    </Link>
  );
}

/** Online first (busiest first), then the rest by name. */
export function sortByPresence<U extends OnlineUser & { online?: boolean }>(list: U[]): U[] {
  const rank = (u: U) => (!u.online ? 0 : u.where?.status === "playing" ? 4 : u.where?.status === "waiting" ? 3 : u.where ? 2 : 1);
  return [...list].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
}
