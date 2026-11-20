"use client";

// Profile cards: tap a player's avatar or name to see their career stats.

import { useEffect, useState } from "react";
import { ROLE_IDS, ROLES } from "@shared/roles";
import { MIN_HUMANS_FOR_STATS, winRate, type PublicProfile, type UserStats, type WinCount } from "@shared/stats";
import { useLocale, useT } from "@/lib/i18n";
import { fetchPlayerProfile, fetchUserProfile } from "@/lib/stats";
import { Avatar, RoleBadge, Spinner, StyledName } from "./ui";

type Target = { playerId: string } | { userId: string };

let show: ((t: Target) => void) | null = null;

/** Opens the profile card of a player in the current room, or of an account. */
export function openProfile(target: Target) {
  show?.(target);
}

/**
 * Makes an avatar or a name open the player's profile. Renders a real button,
 * so never put it inside another button (vote and target grids).
 */
export function ProfileLink({
  playerId,
  userId,
  children,
  className = "",
}: {
  playerId?: string;
  userId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const target: Target | null = playerId ? { playerId } : userId ? { userId } : null;
  if (!target) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openProfile(target);
      }}
      title={t("stats.viewProfile")}
      className={`inline-flex min-w-0 cursor-pointer items-center rounded-full text-left transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-gold ${className}`}
    >
      {children}
    </button>
  );
}

const pct = (c: Pick<WinCount, "games" | "wins">) => `${Math.round(winRate(c) * 100)}%`;

/** The modal; mount once near the root. */
export function ProfileHost() {
  const t = useT();
  const [target, setTarget] = useState<Target | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    show = (next) => {
      setTarget(next);
      setProfile(null);
      setError(null);
    };
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    const req = "playerId" in target ? fetchPlayerProfile(target.playerId) : fetchUserProfile(target.userId);
    req.then((r) => {
      if (!alive) return;
      if (r.ok) setProfile(r.data);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTarget(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target]);

  if (!target) return null;
  const close = () => setTarget(null);
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t("stats.title")}
    >
      <div
        className="rise flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-night-950 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2">
          <h3 className="min-w-0 flex-1 truncate font-bold">{t("stats.title")}</h3>
          <button className="btn-ghost btn-sm" onClick={close} autoFocus>
            ✕ {t("common.close")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="py-8 text-center text-white/60">{t(error)}</p>
          ) : !profile ? (
            <Spinner />
          ) : (
            <ProfileBody profile={profile} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileBody({ profile }: { profile: PublicProfile }) {
  const t = useT();
  const { locale } = useLocale();
  const look = { ...profile, avatar: profile.avatar || "👤", alive: true, style: profile.style ?? undefined };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar p={look} size="xl" />
        <div className="min-w-0">
          <StyledName p={look} className="block truncate text-2xl font-black" />
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            {profile.isBot ? (
              <span className="chip">🤖 {t("common.bot")}</span>
            ) : profile.userId ? (
              <span className="chip border-gold/30 text-gold">✓ {t("stats.member")}</span>
            ) : (
              <span className="chip">{t("stats.guest")}</span>
            )}
            {profile.memberSince && (
              <span className="chip">
                {t("stats.since", { date: new Date(profile.memberSince).toLocaleDateString(locale) })}
              </span>
            )}
          </div>
        </div>
      </div>
      {profile.isBot ? (
        <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">{t("stats.botNoStats")}</p>
      ) : !profile.userId ? (
        <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">{t("stats.guestNoStats")}</p>
      ) : (
        <StatsView stats={profile.stats} />
      )}
    </div>
  );
}

function Tile({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-white/5 px-2 py-3 text-center">
      <span className={`font-display text-2xl font-black tabular-nums ${accent ? "text-gold" : "text-moon"}`}>{value}</span>
      <span className="mt-0.5 text-[11px] leading-tight text-white/60">{label}</span>
    </div>
  );
}

function Bar({ label, c, color }: { label: React.ReactNode; c: WinCount; color: string }) {
  const t = useT();
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-xs text-white/60 tabular-nums">
          {t("stats.gamesWins", { games: c.games, wins: c.wins })}
        </span>
        <span className="w-10 shrink-0 text-right font-bold tabular-nums">{pct(c)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${winRate(c) * 100}%`, background: color }} />
      </div>
    </li>
  );
}

/** Career numbers of one account (also on the player's own profile page). */
export function StatsView({ stats }: { stats: UserStats | null }) {
  const t = useT();
  const { locale } = useLocale();
  if (!stats || (!stats.games && !stats.recent.length))
    return <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">{t("stats.noGames")}</p>;
  const roles = ROLE_IDS.filter((r) => stats.byRole[r]?.games).sort(
    (a, b) => stats.byRole[b]!.games - stats.byRole[a]!.games,
  );
  return (
    <div className="flex flex-col gap-5">
      <p className="-mb-2 text-xs text-white/50">ℹ️ {t("stats.countRule", { min: MIN_HUMANS_FOR_STATS })}</p>
      {stats.games ? (
      <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={t("stats.games")} value={stats.games} />
        <Tile label={t("stats.wins")} value={stats.wins} />
        <Tile label={t("stats.winRate")} value={pct(stats)} accent />
        <Tile label={t("stats.bestStreak")} value={stats.bestStreak} />
        <Tile label={t("stats.wolfGames")} value={stats.byRole.werewolf?.games ?? 0} />
        <Tile label={t("stats.losses")} value={stats.losses} />
        <Tile label={t("stats.draws")} value={stats.draws} />
        <Tile label={t("stats.survived")} value={`${Math.round((stats.survived / stats.games) * 100)}%`} />
      </div>

      <section>
        <h4 className="mb-2 text-sm font-bold text-white/80">{t("stats.byTeam")}</h4>
        <ul className="flex flex-col gap-2.5">
          <Bar label={`🐺 ${t("teams.wolves")}`} c={stats.byTeam.wolves} color={ROLES.werewolf.color} />
          <Bar label={`🏡 ${t("teams.village")}`} c={stats.byTeam.village} color="#57cc99" />
          {stats.lover.games > 0 && <Bar label={`💘 ${t("stats.asLover")}`} c={stats.lover} color="#f472b6" />}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-sm font-bold text-white/80">{t("stats.byRole")}</h4>
        <ul className="flex flex-col gap-2.5">
          {roles.map((r) => (
            <Bar key={r} label={<RoleBadge roleId={r} />} c={stats.byRole[r]!} color={ROLES[r].color} />
          ))}
        </ul>
      </section>
      </>
      ) : (
        <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">{t("stats.noCountedGames", { min: MIN_HUMANS_FOR_STATS })}</p>
      )}

      <section>
        <h4 className="mb-2 text-sm font-bold text-white/80">{t("stats.recent")}</h4>
        <ul className="flex flex-col gap-1.5">
          {stats.recent.map((g, i) => (
            <li
              key={`${g.t}-${i}`}
              className={`flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-sm ${g.counted === false ? "opacity-60" : ""}`}
            >
              <span
                className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold ${
                  g.outcome === "win" ? "bg-emerald-500/20 text-emerald-300" : g.outcome === "loss" ? "bg-blood/25 text-blood-light" : "bg-white/10 text-white/70"
                }`}
              >
                {t(`stats.outcome.${g.outcome}`)}
              </span>
              <RoleBadge roleId={g.role} />
              <span className="min-w-0 flex-1 truncate text-xs text-white/50">
                {g.lover && "💘 "}
                {g.survived ? t("stats.alive") : `💀 ${t("stats.dead")}`} ·{" "}
                {g.humans === undefined ? t("stats.playersCount", { n: g.players }) : t("stats.humansCount", { n: g.humans })}
              </span>
              {g.counted === false && (
                <span className="chip shrink-0 py-0 text-[10px]" title={t("stats.countRule", { min: MIN_HUMANS_FOR_STATS })}>
                  {t("stats.notCounted")}
                </span>
              )}
              <span className="shrink-0 text-[11px] text-white/40 tabular-nums">{new Date(g.t).toLocaleDateString(locale)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
