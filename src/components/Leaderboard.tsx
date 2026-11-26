"use client";

// Landing-page list of every account: ranked players by win rate on top, then
// the rest, newest account first. Casual (opens first) or standard numbers.

import { useEffect, useState } from "react";
import { MIN_HUMANS_FOR_STATS, MIN_RANKED_GAMES, isRanked, lineOf, rankLeaderboard, type LeaderboardRow, type StatsMode } from "@shared/stats";
import { Fragment } from "react";
import { useAccount } from "@/lib/account";
import { useT } from "@/lib/i18n";
import { fetchLeaderboard } from "@/lib/stats";
import { ProfileLink } from "./Profile";
import { Avatar, Spinner, StyledName } from "./ui";

const MEDALS = ["🥇", "🥈", "🥉"];
/** Rows shown at first, and after "show more". Your own row is always added when it falls outside. */
const TOP_SHORT = 10;
const TOP_LONG = 20;

export function Leaderboard({ className = "mt-10" }: { className?: string }) {
  const t = useT();
  const me = useAccount()?.user.id;
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<StatsMode>("standard");
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

  const ordered = rows ? rankLeaderboard(rows, mode) : [];
  const limit = long ? TOP_LONG : TOP_SHORT;
  const top = ordered.slice(0, limit);
  const myIndex = me ? ordered.findIndex((r) => r.userId === me) : -1;
  /** Rows on screen with their place in the whole ranking. */
  const shown = top.map((r, i) => ({ r, i }));
  if (myIndex >= limit) shown.push({ r: ordered[myIndex], i: myIndex });
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
      <p className="-mt-2 mb-3 text-xs text-white/50">
        {t(mode === "casual" ? "stats.casualRule" : "stats.standardRule", { min: MIN_HUMANS_FOR_STATS })}
      </p>
      {failed ? (
        <p className="py-6 text-center text-white/50">{t("leaderboard.unavailable")}</p>
      ) : !rows ? (
        <Spinner />
      ) : !rows.length ? (
        <p className="py-6 text-center text-white/50">{t("leaderboard.empty")}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs text-white/60">
                <tr>
                  <th className="w-10 py-2 pl-3 text-left font-semibold">#</th>
                  <th className="py-2 text-left font-semibold">{t("leaderboard.player")}</th>
                  <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">🐺 {t("leaderboard.wolf")}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t("stats.games")}</th>
                  <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">{t("stats.wins")}</th>
                  <th className="py-2 pr-3 pl-2 text-right font-semibold">{t("stats.winRate")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ r, i }, k) => {
                  const look = { name: r.name, avatar: "👤", avatarUrl: r.avatarUrl, style: r.style ?? undefined, alive: true };
                  const line = lineOf(r, mode);
                  const ranked = isRanked(line);
                  const firstUnranked = !ranked && (k === 0 || isRanked(lineOf(shown[k - 1].r, mode)));
                  const gap = k > 0 && shown[k - 1].i !== i - 1;
                  return (
                    <Fragment key={r.userId}>
                    {gap && (
                      <tr className="border-t border-white/10">
                        <td colSpan={6} className="py-0.5 text-center text-xs text-white/30">⋯</td>
                      </tr>
                    )}
                    {firstUnranked && (
                      <tr className="border-t border-white/10 bg-white/[0.03]">
                        <td colSpan={6} className="px-3 py-1.5 text-xs text-white/50">
                          {t("leaderboard.unranked", { min: MIN_RANKED_GAMES })}
                        </td>
                      </tr>
                    )}
                    <tr className={`border-t border-white/5 ${r.userId === me ? "bg-gold/10" : ""}`}>
                      <td className="py-2 pl-3 font-display text-lg font-black text-gold tabular-nums">
                        {ranked ? (MEDALS[i] ?? i + 1) : "·"}
                      </td>
                      <td className="max-w-0 py-2">
                        <ProfileLink userId={r.userId} className="max-w-full gap-2">
                          <Avatar p={look} size="sm" />
                          <StyledName p={look} className="truncate font-semibold" />
                          {r.userId === me && <span className="chip hidden shrink-0 py-0 text-[10px] sm:inline-flex">{t("leaderboard.you")}</span>}
                        </ProfileLink>
                      </td>
                      <td className="hidden px-2 py-2 text-right text-white/70 tabular-nums sm:table-cell">{line.wolfGames}</td>
                      <td className="px-2 py-2 text-right text-white/70 tabular-nums">{line.games}</td>
                      <td className="hidden px-2 py-2 text-right text-white/70 tabular-nums sm:table-cell">{line.wins}</td>
                      <td className={`py-2 pr-3 pl-2 text-right tabular-nums ${ranked ? "font-bold" : "text-white/40"}`}>
                        {line.games ? `${Math.round(line.winRate * 100)}%` : "–"}
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
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
