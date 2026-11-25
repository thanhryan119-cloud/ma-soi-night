"use client";

// Watching a past game again: tap a game in a player's history to see who
// played what, who won, and the whole story night by night.

import { useEffect, useState } from "react";
import { ROLES } from "@shared/roles";
import type { GameRecord, ReplayPlayer } from "@shared/replay";
import { useLocale, useT } from "@/lib/i18n";
import { fetchGame } from "@/lib/stats";
import { Timeline } from "./GameOver";
import { ProfileLink } from "./Profile";
import { Avatar, RoleBadge, Spinner, StyledName } from "./ui";
import { SceneArt } from "./art/Woodcut";

let show: ((id: string) => void) | null = null;

/** Opens a saved game (from a match history). */
export function openReplay(id: string) {
  show?.(id);
}

/** The modal; mount once near the root (above the profile card, which opens it). */
export function GameReplayHost() {
  const t = useT();
  const [id, setId] = useState<string | null>(null);
  const [game, setGame] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    show = (next) => {
      setId(next);
      setGame(null);
      setError(null);
    };
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchGame(id).then((r) => {
      if (!alive) return;
      if (r.ok) setGame(r.data);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close only this one, not the profile card under it.
      e.stopImmediatePropagation();
      setId(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [id]);

  if (!id) return null;
  const close = () => setId(null);
  return (
    <div
      className="page-enter fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t("replay.title")}
    >
      <div
        className="rise flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-night-950 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2">
          <h3 className="min-w-0 flex-1 truncate font-bold">🎬 {t("replay.title")}</h3>
          <button className="btn-ghost btn-sm" onClick={close} autoFocus aria-label={t("common.close")} title={t("common.close")}>
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error ? <p className="py-8 text-center text-white/60">{t(error)}</p> : !game ? <Spinner /> : <ReplayBody game={game} onProfile={close} />}
        </div>
      </div>
    </div>
  );
}

/** `onProfile`: a player's profile is opening (it shows under this box, so the box closes). */
function ReplayBody({ game, onProfile }: { game: GameRecord; onProfile: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const w = game.winner;
  const minutes = game.startedAt ? Math.max(1, Math.round((game.t - game.startedAt) / 60_000)) : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <SceneArt
          scene={w === "wolves" || w === "whiteWolf" ? "wolves" : w === "village" ? "village" : w === "lovers" ? "lovers" : "draw"}
          className="mx-auto w-full max-w-xs"
        />
        <h4 className="mt-2 font-display text-2xl font-black text-moon">{t(`winner.${w}.title`)}</h4>
        <p className="mt-1 text-xs text-white/50">
          {new Date(game.t).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
          {t("stats.playersCount", { n: game.players.length })}
          {minutes && <> · {t("replay.minutes", { n: minutes })}</>}
        </p>
      </div>

      <section>
        <h4 className="mb-2 text-sm font-bold text-white/80">{t("replay.players")}</h4>
        <ul
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("button")) onProfile();
          }}
        >
          {game.players.map((p) => (
            <ReplaySeat key={p.id} p={p} />
          ))}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-sm font-bold text-white/80">{t("screen.timeline")}</h4>
        <Timeline log={game.log} t={t} />
      </section>
    </div>
  );
}

function ReplaySeat({ p }: { p: ReplayPlayer }) {
  const t = useT();
  const look = { name: p.name, avatar: p.avatar || "👤", avatarUrl: p.avatarUrl, style: p.style ?? undefined, alive: p.alive };
  return (
    <li
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2"
      style={p.roleId ? { borderColor: `${ROLES[p.roleId].color}55` } : undefined}
    >
      <ProfileLink userId={p.userId ?? undefined} className="shrink-0">
        <Avatar p={look} />
      </ProfileLink>
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1 truncate font-semibold ${p.alive ? "" : "text-white/50 line-through"}`}>
          <ProfileLink userId={p.userId ?? undefined} className="max-w-full">
            <StyledName p={look} className="truncate" />
          </ProfileLink>
          {p.lover && <span aria-label={t("stats.asLover")}>💘</span>}
          {p.isBot && <span className="text-xs no-underline">🤖</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {p.startRole && (
            <>
              <RoleBadge roleId={p.startRole} />
              <span className="text-xs text-white/40">→</span>
            </>
          )}
          {p.roleId && <RoleBadge roleId={p.roleId} />}
        </div>
      </div>
    </li>
  );
}
