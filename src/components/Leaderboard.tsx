"use client";

// Landing-page leaderboard: a podium for the top three, then a list. Ranks by
// overall win rate or by the win rate in one faction (wolves, village, solo),
// in casual or standard games.

import { Fragment, useEffect, useState } from "react";
import {
  LEADERBOARD_CATEGORIES,
  MIN_HUMANS_FOR_STATS,
  categoryLine,
  minGamesFor,
  rankCategory,
  type LeaderboardCategory,
  type LeaderboardRow,
  type StatsMode,
} from "@shared/stats";
import { useAccount } from "@/lib/account";
import { useT } from "@/lib/i18n";
import { fetchLeaderboard } from "@/lib/stats";
import { openProfile } from "./Profile";
import { Avatar, CardBackdrop, Spinner, StyledName } from "./ui";

/** Rows shown at first, and after "show more". Your own row is always added when it falls outside. */
const TOP_SHORT = 10;
const TOP_LONG = 20;

const CATEGORY_ICON: Record<LeaderboardCategory, string> = { all: "🏆", wolves: "🐺", village: "🏡", solo: "🎭" };
/** Gold, silver, bronze. */
const PLACE_COLOR = ["text-gold", "text-slate-300", "text-amber-600"];

const lookOf = (r: LeaderboardRow) => ({ name: r.name, avatar: "👤", avatarUrl: r.avatarUrl, style: r.style ?? undefined, alive: true });

export function Leaderboard({ className = "mt-10" }: { className?: string }) {
  const t = useT();
  const me = useAccount()?.user.id;
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<StatsMode>("standard");
  const [cat, setCat] = useState<LeaderboardCategory>("all");
  const [long, setLong] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchLeaderboard().then((r) => {
      if (!alive) return;
      if (r.ok) setRows(r.data);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const min = minGamesFor(cat);
  const ordered = rows ? rankCategory(rows, mode, cat) : [];
  const limit = long ? TOP_LONG : TOP_SHORT;
  const podium = ordered.slice(0, 3);
  const list = ordered.slice(3, limit).map((r, k) => ({ r, i: k + 3 }));
  const myIndex = me ? ordered.findIndex((r) => r.userId === me) : -1;
  if (myIndex >= limit) list.push({ r: ordered[myIndex], i: myIndex });
  const myRow = me && rows ? rows.find((r) => r.userId === me) : undefined;
  const myMissing = myRow && myIndex < 0 ? min - categoryLine(myRow, mode, cat).games : 0;

  const stat = (r: LeaderboardRow) => categoryLine(r, mode, cat);

  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">🏆 {t("leaderboard.title")}</h2>
        {rows && <span className="chip">{t("leaderboard.accounts", { count: rows.length })}</span>}
        <div className="ml-auto flex rounded-full border border-white/15 p-0.5 text-xs" role="tablist" aria-label={t("leaderboard.mode")}>
          {(["standard", "casual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 font-semibold whitespace-nowrap transition ${mode === m ? "bg-gold text-night-950" : "text-white/60 hover:text-white"}`}
            >
              {m === "casual" ? "🎲" : "🏆"} {t(`stats.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t("leaderboard.category")}>
        {LEADERBOARD_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition ${
              cat === c ? "border-gold/60 bg-gold/15 text-gold" : "border-white/10 bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            {CATEGORY_ICON[c]} {t(`leaderboard.categories.${c}`)}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-white/50">
        {t(mode === "casual" ? "stats.casualRule" : "stats.standardRule", { min: MIN_HUMANS_FOR_STATS })}.{" "}
        {t("leaderboard.minGames", { min })}
      </p>
      {failed ? (
        <p className="py-6 text-center text-white/50">{t("leaderboard.unavailable")}</p>
      ) : !rows ? (
        <Spinner />
      ) : !rows.length ? (
        <p className="py-6 text-center text-white/50">{t("leaderboard.empty")}</p>
      ) : !ordered.length ? (
        <p className="py-6 text-center text-white/50">{t("leaderboard.noneRanked", { min })}</p>
      ) : (
        <>
          {/* Second, first, third: the winner stands in the middle, a step higher. */}
          <div className="grid grid-cols-3 items-end gap-2">
            {[1, 0, 2].map((i) => {
              const r = podium[i];
              if (!r) return <div key={i} />;
              const s = stat(r);
              return (
                <button
                  key={r.userId}
                  type="button"
                  onClick={() => openProfile({ userId: r.userId })}
                  title={t("stats.viewProfile")}
                  className={`relative isolate flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-2 pb-3 transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-gold ${
                    i === 0 ? "border-gold/40 bg-gold/10 pt-7" : "border-white/10 bg-white/5 pt-5"
                  } ${r.userId === me ? "ring-2 ring-gold/60" : ""}`}
                >
                  <CardBackdrop card={r.style?.card} />
                  <span className={`absolute top-1.5 left-2.5 font-display text-xl font-black tabular-nums ${PLACE_COLOR[i]}`}>{i + 1}</span>
                  <Avatar p={lookOf(r)} size="lg" />
                  <StyledName p={lookOf(r)} className="w-full truncate text-center text-sm font-semibold" />
                  <span className="font-display text-2xl leading-none font-black tabular-nums">{Math.round(s.winRate * 100)}%</span>
                  <span className="text-[11px] text-white/50 tabular-nums">{t("leaderboard.record", { wins: s.wins, games: s.games })}</span>
                </button>
              );
            })}
          </div>
          {list.length > 0 && (
            <ol className="mt-3 flex flex-col gap-1.5">
              {list.map(({ r, i }, k) => {
                const s = stat(r);
                const gap = k > 0 && list[k - 1].i !== i - 1;
                return (
                  <Fragment key={r.userId}>
                    {gap && <li className="text-center text-xs leading-none text-white/30">⋯</li>}
                    <li>
                      <button
                        type="button"
                        onClick={() => openProfile({ userId: r.userId })}
                        title={t("stats.viewProfile")}
                        className={`relative isolate flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-gold ${
                          r.userId === me ? "border-gold/40 bg-gold/10" : "border-white/5 bg-white/5"
                        }`}
                      >
                        <CardBackdrop card={r.style?.card} />
                        <span className="w-6 shrink-0 text-center font-display text-lg font-black text-white/50 tabular-nums">{i + 1}</span>
                        <Avatar p={lookOf(r)} size="md" />
                        <StyledName p={lookOf(r)} className="min-w-0 flex-1 truncate font-semibold" />
                        {r.userId === me && <span className="chip hidden shrink-0 py-0 text-[10px] sm:inline-flex">{t("leaderboard.you")}</span>}
                        <span className="flex shrink-0 flex-col items-end leading-tight">
                          <span className="text-lg font-black tabular-nums">{Math.round(s.winRate * 100)}%</span>
                          <span className="text-[11px] text-white/50 tabular-nums">{t("leaderboard.record", { wins: s.wins, games: s.games })}</span>
                        </span>
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          )}
          {myMissing > 0 && <p className="mt-3 text-center text-xs text-white/50">{t("leaderboard.youNeed", { n: myMissing })}</p>}
          {ordered.length > TOP_SHORT && (
            <button type="button" className="btn-ghost btn-sm mx-auto mt-3" onClick={() => setLong((x) => !x)}>
              {long ? t("leaderboard.showLess") : t("leaderboard.showMore", { n: Math.min(TOP_LONG, ordered.length) })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
