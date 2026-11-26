"use client";

// A window that pops up when a win just took one of your role cards up a tier
// (bronze, silver, gold, rainbow). The server sends "achievement" right after
// the finished game is added to your stats.

import { useEffect, useState } from "react";
import { nextTier, type AchievementNews } from "@shared/achievements";
import { ROLES } from "@shared/roles";
import { RoleArt } from "@/components/art/Tarot";
import { TierChip } from "@/components/RoleCollection";
import { getSocket } from "@/lib/socket";
import { useT } from "@/lib/i18n";

export function AchievementPopup() {
  const t = useT();
  const [queue, setQueue] = useState<AchievementNews[]>([]);

  useEffect(() => {
    const s = getSocket();
    const got = (n: AchievementNews) => setQueue((q) => [...q, n]);
    s.on("achievement", got);
    return () => {
      s.off("achievement", got);
    };
  }, []);

  const news = queue[0];
  const close = () => setQueue((q) => q.slice(1));
  useEffect(() => {
    if (!news) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setQueue((q) => q.slice(1));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [news]);
  if (!news) return null;

  const role = t(`roles.${news.role}.name`);
  const tier = t(`collection.tier.${news.tier}`);
  const next = nextTier(news.wins);
  return (
    <div
      className="page-enter fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t("achievement.title")}
    >
      <div
        className="rise flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-gold/50 bg-night-950 p-5 text-center shadow-2xl"
        style={{ boxShadow: `0 0 60px ${ROLES[news.role].color}55` }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-xs font-bold tracking-[0.2em] text-gold uppercase">🏆 {t("achievement.title")}</p>
        <RoleArt role={news.role} tier={news.tier} className="w-36" />
        <TierChip tier={news.tier} />
        <p className="font-bold">{t("achievement.reached", { role, tier })}</p>
        <p className="text-xs text-white/60">
          {t("collection.wins", { n: news.wins })}
          {" · "}
          {next ? t("achievement.next", { n: next.wins - news.wins, tier: t(`collection.tier.${next.tier}`) }) : t("achievement.maxedNow")}
        </p>
        <button type="button" className="btn-gold w-full" onClick={close} autoFocus>
          {t("achievement.ok")}
        </button>
      </div>
    </div>
  );
}
