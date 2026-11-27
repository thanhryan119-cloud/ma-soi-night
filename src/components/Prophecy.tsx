"use client";

// The Ghosts' Prophecy (shared/prophecy.ts): the dead and the spectators bet
// on who dies tonight, who hangs today and which side wins. ProphecyPanel is
// where they bet; ProphecyEnd crowns the Underworld Fortune Teller for the
// whole table once the game is over.

import { useState } from "react";
import { NONE, WINNER_PICKS, winnerMultiplier, type BoardLine, type ProphecyRoundView, type WinnerPick } from "@shared/prophecy";
import type { ClientState, PlayerView } from "@shared/views";
import { Avatar, RoleBadge, StyledName, useErrorToast } from "@/components/ui";
import { useT, type T } from "@/lib/i18n";
import { emitAck } from "@/lib/socket";

const WINNER_ICON: Record<WinnerPick, string> = { village: "🏡", wolves: "🐺", other: "🎭" };

/** A ghost has something to bet on right now (for a dot on the button). */
export function prophecyPending(state: ClientState): boolean {
  const p = state.prophecy;
  if (!p?.canBet) return false;
  return p.rounds.some((r) => r.status === "open" && !r.mine) || !p.myWinner;
}

function pickName(t: T, players: Map<string, PlayerView>, kind: ProphecyRoundView["kind"], pick: string) {
  if (pick === NONE) return t(kind === "night" ? "prophecy.noneNight" : "prophecy.noneDay");
  return players.get(pick)?.name ?? "?";
}

function GhostFace({ line, players, size = "sm" }: { line: BoardLine; players: Map<string, PlayerView>; size?: "sm" | "md" | "lg" }) {
  const p = line.playerId ? players.get(line.playerId) : undefined;
  return p ? <Avatar p={p} size={size} /> : <Avatar p={{ avatar: line.avatar, alive: true }} size={size} />;
}

/** Where a ghost bets, sees how the rounds went and how they rank. */
export function ProphecyPanel({ state }: { state: ClientState }) {
  const t = useT();
  const showError = useErrorToast();
  // One bet in flight per question, so a quick tap on another question still goes in.
  const [busy, setBusy] = useState<string[]>([]);
  const p = state.prophecy;
  const players = new Map(state.players.map((x) => [x.id, x]));
  if (!p) return null;

  async function bet(kind: "night" | "day" | "winner", pick: string) {
    if (busy.includes(kind)) return;
    setBusy((b) => [...b, kind]);
    const res = await emitAck("prophecy:bet", { kind, pick });
    setBusy((b) => b.filter((k) => k !== kind));
    showError(res);
  }

  const alive = state.players.filter((x) => x.alive);
  const over = state.phase.kind === "gameOver";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/60">{t("prophecy.intro")}</p>

      {p.me && (
        <div className="flex items-center gap-3 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2">
          <span className="text-2xl">🔮</span>
          <span className="min-w-0 flex-1 font-bold tabular-nums">{t("prophecy.me", { score: p.me.score, hits: p.me.hits, played: p.me.played })}</span>
          {p.me.streak >= 2 && <span className="chip shrink-0 bg-orange-500/20 text-orange-200">{t("prophecy.streak", { n: p.me.streak })}</span>}
        </div>
      )}

      {p.last && <LastRound round={p.last} state={state} players={players} />}

      {!p.rounds.length && !over && <p className="py-2 text-center text-sm text-white/50">{t("prophecy.waiting")}</p>}
      {p.rounds.map((r) => (
        <section key={`${r.kind}${r.n}`} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-night-900/60 p-3">
          <div className="flex items-baseline gap-2">
            <h4 className="min-w-0 flex-1 font-bold">
              {r.kind === "night" ? "🌙 " : "⚖️ "}
              {t(r.kind === "night" ? "prophecy.nightQ" : "prophecy.dayQ", { n: r.n })}
            </h4>
            <span className="shrink-0 text-xs text-white/50">{t("prophecy.count", { count: r.count })}</span>
          </div>
          {r.status === "open" ? (
            <>
              <p className="text-xs text-white/50">{t(r.kind === "night" ? "prophecy.closesNight" : "prophecy.closesDay")}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {alive.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    disabled={busy.includes(r.kind) || !p.canBet}
                    onClick={() => bet(r.kind, x.id)}
                    className={`flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md border px-2 py-1.5 text-left text-sm ${
                      r.mine === x.id ? "border-violet-300 bg-violet-500/25 ring-1 ring-violet-300" : "border-white/10 bg-white/[0.03] hover:bg-white/10"
                    }`}
                  >
                    <Avatar p={x} size="sm" />
                    <span className="min-w-0 flex-1">
                      <StyledName p={x} className="block truncate font-semibold" />
                      {x.roleId && (
                        <span className="mt-0.5 block max-w-full overflow-hidden">
                          <RoleBadge roleId={x.roleId} />
                        </span>
                      )}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy.includes(r.kind) || !p.canBet}
                  onClick={() => bet(r.kind, NONE)}
                  className={`col-span-2 rounded-md border px-2 py-2 text-sm sm:col-span-3 ${
                    r.mine === NONE ? "border-violet-300 bg-violet-500/25 ring-1 ring-violet-300" : "border-white/10 bg-white/[0.03] hover:bg-white/10"
                  }`}
                >
                  {r.kind === "night" ? "🕊️ " : "🙅 "}
                  {t(r.kind === "night" ? "prophecy.noneNight" : "prophecy.noneDay")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-white/50">🔒 {t("prophecy.locked")}</p>
              <Tally round={r} players={players} t={t} />
            </>
          )}
        </section>
      ))}

      <section className="flex flex-col gap-2 rounded-lg border border-white/10 bg-night-900/60 p-3">
        <h4 className="font-bold">🏆 {t("prophecy.winnerQ")}</h4>
        {p.myWinner ? (
          <p className="text-sm">
            {WINNER_ICON[p.myWinner.pick]} {t("prophecy.winnerMine", { pick: t(`prophecy.pick.${p.myWinner.pick}`), mult: winnerMultiplier(p.myWinner.day) })}
            {over && p.winner && (
              <b className={`ml-2 ${p.myWinner.pick === p.winner ? "text-emerald-300" : "text-white/50"}`}>
                {p.myWinner.pick === p.winner ? t("prophecy.hit", { points: p.myWinnerPoints ?? 0 }) : t("prophecy.miss")}
              </b>
            )}
          </p>
        ) : over ? (
          <p className="text-sm text-white/50">{t("prophecy.skipped")}</p>
        ) : (
          <>
            <p className="text-xs text-white/50">{t("prophecy.winnerHint", { mult: p.winnerMultiplier })}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {WINNER_PICKS.map((w) => (
                <button key={w} type="button" disabled={busy.includes("winner") || !p.canBet} onClick={() => bet("winner", w)} className="btn-ghost flex-col gap-0.5 py-2 text-sm">
                  <span className="text-xl">{WINNER_ICON[w]}</span>
                  {t(`prophecy.pick.${w}`)}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <GhostBoard state={state} players={players} />
    </div>
  );
}

function Tally({ round, players, t }: { round: ProphecyRoundView; players: Map<string, PlayerView>; t: T }) {
  const rows = Object.entries(round.tally ?? {}).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, [, c]) => n + c, 0) || 1;
  return (
    <ul className="flex flex-col gap-1">
      {rows.map(([pick, count]) => {
        const right = round.answer?.includes(pick);
        return (
          <li key={pick} className="relative overflow-hidden rounded bg-white/[0.04] px-2 py-1 text-sm">
            <span
              className={`absolute inset-y-0 left-0 ${right ? "bg-emerald-500/30" : pick === round.mine ? "bg-violet-500/25" : "bg-white/10"}`}
              style={{ width: `${(count / total) * 100}%` }}
            />
            <span className="relative flex gap-2">
              <span className="min-w-0 flex-1 truncate">
                {right && "✅ "}
                {pickName(t, players, round.kind, pick)}
                {pick === round.mine && " 👈"}
              </span>
              <span className="tabular-nums text-white/70">{count}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LastRound({ round, state, players }: { round: ProphecyRoundView; state: ClientState; players: Map<string, PlayerView> }) {
  const t = useT();
  const lines = new Map((state.prophecy?.board ?? []).map((l) => [l.key, l]));
  const answer = (round.answer ?? []).map((a) => pickName(t, players, round.kind, a)).join(", ");
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-gold/25 bg-gold/5 p-3">
      <div className="flex items-baseline gap-2">
        <h4 className="min-w-0 flex-1 font-bold">{t(round.kind === "night" ? "prophecy.lastNight" : "prophecy.lastDay", { n: round.n })}</h4>
        <span
          className={`shrink-0 text-sm font-bold ${round.myPoints ? "text-emerald-300" : round.myPoints === 0 ? "text-white/50" : "text-white/40"}`}
        >
          {round.myPoints ? t("prophecy.hit", { points: round.myPoints }) : round.myPoints === 0 ? t("prophecy.miss") : t("prophecy.skipped")}
        </span>
      </div>
      <p className="text-sm text-white/70">{t("prophecy.answer", { names: answer })}</p>
      <Tally round={round} players={players} t={t} />
      {!!round.winners?.length && (
        <ul className="flex flex-wrap gap-1.5">
          {round.winners.slice(0, 6).map((w) => {
            const l = lines.get(w.key);
            return (
              <li key={w.key} className="chip gap-1 bg-emerald-500/15 text-emerald-100">
                {l && <GhostFace line={l} players={players} />}
                <span className="max-w-24 truncate">{l?.name ?? "?"}</span> +{w.points}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GhostBoard({ state, players, limit = 8 }: { state: ClientState; players: Map<string, PlayerView>; limit?: number }) {
  const t = useT();
  const board = state.prophecy?.board ?? [];
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-bold">👻 {t("prophecy.board")}</h4>
      {!board.length ? (
        <p className="text-sm text-white/50">{t("prophecy.emptyBoard")}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {board.slice(0, limit).map((l, i) => (
            <li key={l.key} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1 text-sm">
              <span className="w-5 text-center font-bold text-white/50 tabular-nums">{i === 0 && l.score > 0 ? "🔮" : i + 1}</span>
              <GhostFace line={l} players={players} />
              <span className="min-w-0 flex-1 truncate font-semibold">{l.name}</span>
              <span className="text-xs text-white/50 tabular-nums">
                {l.hits}/{l.played}
              </span>
              <span className="w-16 text-right font-bold tabular-nums text-violet-200">{l.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** End of the game: the Underworld Fortune Teller and the ghosts' ranking, for everyone. */
export function ProphecyEnd({ state, big = false }: { state: ClientState; big?: boolean }) {
  const t = useT();
  const p = state.prophecy;
  if (!p || !p.board.length) return null;
  const players = new Map(state.players.map((x) => [x.id, x]));
  const teller = p.fortuneTeller;
  return (
    <div className={`rise flex flex-col gap-3 rounded-xl border border-violet-400/40 bg-gradient-to-b from-violet-500/15 to-transparent text-left ${big ? "p-6" : "p-3"}`}>
      {teller ? (
        <div className="flex items-center gap-3">
          <GhostFace line={teller} players={players} size={big ? "lg" : "md"} />
          <div className="min-w-0 flex-1">
            <div className={`font-bold tracking-wide text-violet-200 uppercase ${big ? "text-lg" : "text-xs"}`}>🔮 {t("prophecy.teller")}</div>
            <div className={`truncate font-display font-black text-moon ${big ? "text-4xl" : "text-xl"}`}>{teller.name}</div>
            <div className={`text-white/70 ${big ? "text-xl" : "text-sm"}`}>{t("prophecy.tellerLine", { hits: teller.hits, score: teller.score })}</div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/60">🔮 {t("prophecy.noTeller")}</p>
      )}
      <GhostBoard state={state} players={players} limit={big ? 6 : 5} />
    </div>
  );
}
