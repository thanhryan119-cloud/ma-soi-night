"use client";

// Profile cards: tap a player's avatar or name to see their career stats.

import { useEffect, useState } from "react";
import { ROLE_IDS, ROLES } from "@shared/roles";
import { MIN_HUMANS_FOR_STATS, casualOf, winRate, type PublicProfile, type UserStats, type WinCount } from "@shared/stats";
import { roleWins } from "@shared/achievements";
import { useLocale, useT } from "@/lib/i18n";
import { fetchPlayerProfile, fetchUserProfile } from "@/lib/stats";
import { Avatar, ProfileCard, RoleBadge, Spinner, StyledName } from "./ui";
import { CollectionPeek } from "./RoleCollection";
import { openReplay } from "./GameReplay";

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
      className="page-enter fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
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
          <button className="btn-ghost btn-sm" onClick={close} autoFocus aria-label={t("common.close")} title={t("common.close")}>
            ✕
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
      <ProfileCard bg={profile.style?.card} className="flex items-center gap-4 p-4">
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
      </ProfileCard>
      {profile.isBot ? (
        <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">{t("stats.botNoStats")}</p>
      ) : !profile.userId ? (
        <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">{t("stats.guestNoStats")}</p>
      ) : (
        <>
          <StatsView stats={profile.stats} />
          {ROLE_IDS.some((r) => roleWins(profile.stats, r) > 0) && <CollectionPeek stats={profile.stats} />}
        </>
      )}
    </div>
  );
}

/** One mode's headline: games played and win rate. */
function ModeCard({ icon, label, rule, c }: { icon: string; label: string; rule: string; c: Pick<WinCount, "games" | "wins"> }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-white/5 px-3 py-2.5" title={rule}>
      <span className="text-xs font-bold text-white/80">
        {icon} {label}
      </span>
      <span className="font-display text-2xl font-black text-gold tabular-nums">{pct(c)}</span>
      <span className="text-[11px] text-white/60 tabular-nums">{t("stats.gamesWins", { games: c.games, wins: c.wins })}</span>
      <span className="text-[10px] leading-tight text-white/40">{rule}</span>
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

/** Win rate as a ring in the team's or role's colour, with games and wins under it. */
function RateTile({ icon, label, c, color }: { icon: string; label: string; c: WinCount; color: string }) {
  const t = useT();
  const rate = winRate(c) * 100;
  return (
    <li
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5"
      style={{ borderLeft: `3px solid ${color}` }}
      title={t("stats.gamesWins", { games: c.games, wins: c.wins })}
    >
      <span
        className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${rate}%, rgba(255, 255, 255, 0.08) 0)` }}
        aria-hidden
      >
        <span className="absolute inset-[5px] rounded-full bg-night-950" />
        <span className="relative text-xl">{icon}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold text-moon">{label}</span>
        <span className="font-display text-xl leading-tight font-black tabular-nums" style={{ color }}>
          {pct(c)}
        </span>
        <span className="truncate text-[11px] text-white/50 tabular-nums">{t("stats.gamesWins", { games: c.games, wins: c.wins })}</span>
      </span>
    </li>
  );
}

const RateGrid = ({ children }: { children: React.ReactNode }) => (
  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</ul>
);

/** Career numbers of one account (also on the player's own profile page). */
export function StatsView({ stats }: { stats: UserStats | null }) {
  const t = useT();
  const { locale } = useLocale();
  const casual = casualOf(stats);
  if (!stats || (!stats.games && !casual.games && !stats.recent.length))
    return <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">{t("stats.noGames")}</p>;
  const byGames = (counts: UserStats["byRole"]) =>
    ROLE_IDS.filter((r) => counts[r]?.games).sort((a, b) => counts[b]!.games - counts[a]!.games);
  const roles = byGames(stats.byRole);
  const casualRoles = byGames(casual.byRole);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <ModeCard icon="🏆" label={t("stats.standard")} rule={t("stats.standardRule", { min: MIN_HUMANS_FOR_STATS })} c={stats} />
        <ModeCard icon="🎲" label={t("stats.casual")} rule={t("stats.casualRule", { min: MIN_HUMANS_FOR_STATS })} c={casual} />
      </div>
      <h4 className="-mb-2 text-sm font-bold text-gold">🏆 {t("stats.standard")}</h4>
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
        {(stats.abandons ?? 0) > 0 && <Tile label={t("stats.abandons")} value={stats.abandons!} />}
      </div>

      <section>
        <h4 className="mb-2 text-sm font-bold text-white/80">{t("stats.byTeam")}</h4>
        <RateGrid>
          <RateTile icon="🐺" label={t("teams.wolves")} c={stats.byTeam.wolves} color={ROLES.werewolf.color} />
          <RateTile icon="🏡" label={t("teams.village")} c={stats.byTeam.village} color="#57cc99" />
          {(stats.byTeam.solo?.games ?? 0) > 0 && <RateTile icon="🎭" label={t("teams.solo")} c={stats.byTeam.solo} color="#ea580c" />}
          {stats.lover.games > 0 && <RateTile icon="💘" label={t("stats.asLover")} c={stats.lover} color="#f472b6" />}
        </RateGrid>
      </section>

      <section>
        <h4 className="mb-2 text-sm font-bold text-white/80">{t("stats.byRole")}</h4>
        <RateGrid>
          {roles.map((r) => (
            <RateTile key={r} icon={ROLES[r].emoji} label={t(`roles.${r}.name`)} c={stats.byRole[r]!} color={ROLES[r].color} />
          ))}
        </RateGrid>
      </section>
      </>
      ) : (
        <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-white/60">{t("stats.noCountedGames", { min: MIN_HUMANS_FOR_STATS })}</p>
      )}

      {casual.games > 0 && (
        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-bold text-white/80">🎲 {t("stats.casual")}</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label={t("stats.games")} value={casual.games} />
            <Tile label={t("stats.wins")} value={casual.wins} />
            <Tile label={t("stats.winRate")} value={pct(casual)} accent />
            <Tile label={t("stats.losses")} value={casual.losses} />
          </div>
          <RateGrid>
            {casualRoles.map((r) => (
              <RateTile key={r} icon={ROLES[r].emoji} label={t(`roles.${r}.name`)} c={casual.byRole[r]!} color={ROLES[r].color} />
            ))}
          </RateGrid>
        </section>
      )}

      <section>
        <h4 className="mb-2 text-sm font-bold text-white/80">{t("stats.recent")}</h4>
        <ul className="flex flex-col gap-1.5">
          {stats.recent.map((g, i) => (
            <li key={`${g.t}-${i}`}>
            {/* A saved game opens again with its whole story; older games were not saved. */}
            <button
              type="button"
              disabled={!g.gameId}
              onClick={() => g.gameId && openReplay(g.gameId)}
              title={g.gameId ? t("replay.open") : undefined}
              className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-left text-sm transition enabled:cursor-pointer enabled:hover:bg-white/10 disabled:cursor-default"
            >
              <span
                className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold ${
                  g.outcome === "win"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : g.outcome === "loss" || g.outcome === "abandon"
                      ? "bg-blood/25 text-blood-light"
                      : "bg-white/10 text-white/70"
                }`}
              >
                {t(`stats.outcome.${g.outcome}`)}
              </span>
              <RoleBadge roleId={g.role} />
              <span className="min-w-0 flex-1 truncate text-xs text-white/50">
                {g.lover && "💘 "}
                {g.outcome === "abandon" ? `🚪 ${t("stats.left")}` : g.survived ? t("stats.alive") : `💀 ${t("stats.dead")}`} ·{" "}
                {g.humans === undefined ? t("stats.playersCount", { n: g.players }) : t("stats.humansCount", { n: g.humans })}
              </span>
              {g.counted === false && (
                <span className="chip shrink-0 py-0 text-[10px]" title={t("stats.countRule", { min: MIN_HUMANS_FOR_STATS })}>
                  {t("stats.notCounted")}
                </span>
              )}
              <span className="shrink-0 text-[11px] text-white/40 tabular-nums">{new Date(g.t).toLocaleDateString(locale)}</span>
              {g.gameId && <span className="shrink-0 text-xs text-gold" aria-hidden>▶</span>}
            </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
