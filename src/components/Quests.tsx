"use client";

// Small pieces for gold and quests used on several pages.

import Link from "next/link";
import { useQuests } from "@/lib/account";
import { useLocale, useT } from "@/lib/i18n";

/** "1.250" in Vietnamese, "1,250" in English. */
export function useGoldFormat() {
  const { locale } = useLocale();
  return (n: number) => n.toLocaleString(locale === "en" ? "en-US" : "vi-VN");
}

/** The player's gold, e.g. "🪙 1.250" (nothing for guests). */
export function GoldChip({ className = "" }: { className?: string }) {
  const t = useT();
  const q = useQuests();
  const fmt = useGoldFormat();
  if (!q) return null;
  return (
    <span className={`chip border-gold/50 font-bold text-gold ${className}`} title={t("quests.goldTitle")}>
      🪙 {fmt(q.gold)}
    </span>
  );
}

/** Button to the quests page, with a dot counting rewards ready to collect. */
export function QuestsLink() {
  const t = useT();
  const q = useQuests();
  return (
    <Link href="/quests" className="btn-ghost btn-sm relative border-gold/50 text-gold" title={t("quests.open")}>
      {/* Just the icon on phones, so it fits next to the language switch. */}
      📜 <span className="max-sm:sr-only">{t("quests.open")}</span>
      {!!q?.ready && (
        <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-blood px-1 text-[11px] font-black text-white">
          {q.ready}
        </span>
      )}
    </Link>
  );
}
