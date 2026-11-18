"use client";

import { QRCodeSVG } from "qrcode.react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ROLES } from "@shared/roles";
import type { Locale } from "@shared/types";
import type { ClientState, PlayerView } from "@shared/views";
import { RolesGrid, Timeline, WinnerBanner } from "@/components/GameOver";
import { useJoinUrl } from "@/components/host/HostLobby";
import { Avatar, LangSwitch, Spinner, TimerDisplay } from "@/components/ui";
import { translatorFor, useLocale, useT, type T } from "@/lib/i18n";
import { emitAck } from "@/lib/socket";
import { useRoomState } from "@/lib/useRoom";

/** Renders a message in the screen language, plus the other language when bilingual. */
function Bi({
  k,
  params,
  className = "",
  sub = "text-[0.55em] font-normal text-white/50",
  as: Tag = "div",
}: {
  k: string;
  params?: Record<string, string | number>;
  className?: string;
  sub?: string;
  as?: "div" | "h1" | "h2" | "p";
}) {
  const { locale } = useLocale();
  const bilingual = useBilingual();
  const other: Locale = locale === "vi" ? "en" : "vi";
  const tr = (l: Locale) => {
    const tt = translatorFor(l);
    const p = { ...params };
    // Role ids passed as `role` get translated per language.
    if (typeof p.role === "string" && p.role in ROLES) p.role = tt(`roles.${p.role}.name`);
    return tt(k, p);
  };
  return (
    <Tag className={className}>
      {tr(locale)}
      {bilingual && <span className={`block ${sub}`}>{tr(other)}</span>}
    </Tag>
  );
}

const BilingualCtx = createContext(false);
const useBilingual = () => useContext(BilingualCtx);

export default function ScreenApp({ code }: { code: string }) {
  const t = useT();
  const { suggestLocale } = useLocale();
  const [notFound, setNotFound] = useState(false);
  const watch = useCallback(async () => {
    const res = await emitAck<{ locale: Locale }>("screen:watch", { code });
    if (!res.ok && res.error === "err.roomNotFound") setNotFound(true);
  }, [code]);
  const { state, offset } = useRoomState(watch);
  const roomLocale = state?.roomLocale;
  useEffect(() => {
    if (roomLocale) suggestLocale(roomLocale);
  }, [roomLocale, suggestLocale]);

  return (
    <BilingualCtx.Provider value={!!state?.settings.bilingualScreen}>
    <div className="flex min-h-dvh flex-col">
      <LangSwitch />
      <div className="fixed top-3 left-4 z-40 font-display text-lg font-black text-moon/70">
        🌙 {t("app.name")} · <span className="font-mono text-gold">{code}</span>
      </div>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        {notFound ? (
          <p className="text-3xl">{t("screen.notFound")}</p>
        ) : !state ? (
          <Spinner />
        ) : (
          <ScreenBody state={state} offset={offset} t={t} />
        )}
      </main>
    </div>
    </BilingualCtx.Provider>
  );
}

function PlayerBubble({ p, size = "lg" }: { p: PlayerView; size?: "lg" | "xl" }) {
  return (
    <div className="rise flex w-28 flex-col items-center gap-1">
      <Avatar p={p} size={size} />
      <span className={`line-clamp-2 text-lg leading-tight font-semibold ${p.alive ? "" : "text-white/40"}`}>{p.name}</span>
    </div>
  );
}

function Progress({ state }: { state: ClientState }) {
  const v = state.vote;
  if (!v) return null;
  return (
    <div className="w-full max-w-2xl">
      <Bi k="screen.votesIn" params={{ voted: v.voted, eligible: v.eligible }} className="mb-3 text-4xl font-bold" />
      <div className="h-4 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gold transition-[width] duration-500" style={{ width: `${v.eligible ? (v.voted / v.eligible) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function ScreenBody({ state, offset, t }: { state: ClientState; offset: number; t: T }) {
  const players = new Map(state.players.map((p) => [p.id, p]));
  const k = state.phase.kind;
  const title = "font-display text-6xl font-black text-moon md:text-7xl";

  switch (k) {
    case "lobby":
      return <LobbyScreen state={state} />;
    case "roleReveal":
      return (
        <div className="flex flex-col items-center gap-8">
          <div className="text-8xl">🂠</div>
          <Bi k="screen.lookAtRole" className={title} />
        </div>
      );
    case "night": {
      const role = state.night.stepRole;
      return (
        <div className="flex flex-col items-center gap-8">
          <div className="moon h-40 w-40 rounded-full flicker" />
          <Bi k="phase.night" params={{ n: state.phase.night }} className={title} />
          {role ? (
            <Bi k="screen.awake" params={{ role }} className="text-4xl text-white/80" />
          ) : (
            <Bi k="screen.everyoneSleeps" className="text-4xl text-white/80" />
          )}
          {role && <div className="text-7xl">{ROLES[role].emoji}</div>}
        </div>
      );
    }
    case "dawn":
      return (
        <div className="flex flex-col items-center gap-8">
          <div className="text-8xl">🌅</div>
          <Bi k="phase.dawn" params={{ n: state.phase.day }} className={title} />
          {state.lastDeaths.length ? (
            <>
              <Bi k="player.diedLastNight" className="text-3xl text-white/70" />
              <div className="flex flex-wrap justify-center gap-6">
                {state.lastDeaths.map((d) => players.get(d.playerId)).map((p) => p && <PlayerBubble key={p.id} p={p} size="xl" />)}
              </div>
            </>
          ) : (
            <Bi k="player.peacefulNight" className="text-4xl text-emerald-300" />
          )}
        </div>
      );
    case "hunter": {
      const hunter = state.hunterId ? players.get(state.hunterId) : null;
      const shot = state.hunterShot ? players.get(state.hunterShot) : null;
      return (
        <div className="flex flex-col items-center gap-8">
          <div className="text-8xl">🏹</div>
          {hunter && <Bi k="script.hunter" params={{ name: hunter.name }} className="max-w-4xl text-4xl font-bold" />}
          {state.hunterShot === null ? (
            <Bi k="player.hunterWaiting" className="text-3xl text-white/60 flicker" />
          ) : shot ? (
            <>
              <PlayerBubble p={shot} size="xl" />
              <Bi k="script.hunterShot" params={{ name: shot.name }} className="text-3xl text-blood-light" />
            </>
          ) : (
            <Bi k="script.hunterMissed" className="text-3xl" />
          )}
        </div>
      );
    }
    case "discussion":
      return (
        <div className="flex w-full max-w-3xl flex-col items-center gap-8">
          <Bi k="phase.discussion" className={title} />
          <TimerDisplay timer={state.timer} offset={offset} className="text-[10rem] leading-none" />
          <AliveRow state={state} />
        </div>
      );
    case "nominate":
      return (
        <div className="flex w-full flex-col items-center gap-10">
          <Bi k={state.vote?.candidates ? "player.revoteTitle" : "player.nominateTitle"} className={title} />
          <Progress state={state} />
          <Bi k="screen.waitingVotes" className="text-2xl text-white/50" />
        </div>
      );
    case "defense":
      return (
        <div className="flex w-full max-w-5xl flex-col items-center gap-8">
          <Bi k="phase.defense" className={title} />
          <NominationBars state={state} players={players} />
          <TimerDisplay timer={state.timer} offset={offset} className="text-8xl" />
        </div>
      );
    case "verdict": {
      const p = state.vote?.nomineeId ? players.get(state.vote.nomineeId) : null;
      return (
        <div className="flex w-full flex-col items-center gap-8">
          {p && <PlayerBubble p={p} size="xl" />}
          {p && <Bi k="player.verdictTitle" params={{ name: p.name }} className={title} />}
          <div className="flex gap-6 text-3xl font-black">
            <span className="rounded-2xl bg-blood px-6 py-3">🪢 {t("player.execute")}</span>
            <span className="rounded-2xl bg-emerald-500 px-6 py-3 text-night-950">🕊️ {t("player.spare")}</span>
          </div>
          <Progress state={state} />
        </div>
      );
    }
    case "verdictResult": {
      const r = state.verdicts[state.verdicts.length - 1];
      if (!r) return null;
      const p = players.get(r.nomineeId);
      return (
        <div className="flex w-full max-w-4xl flex-col items-center gap-6">
          {p && <PlayerBubble p={p} size="xl" />}
          <Bi
            k={r.executed ? "screen.executed" : "screen.spared"}
            className={`font-display text-8xl font-black ${r.executed ? "text-blood-light" : "text-emerald-300"}`}
          />
          <div className="flex gap-10 text-5xl font-black">
            <span className="text-blood-light">🪢 {r.execute}</span>
            <span className="text-emerald-300">🕊️ {r.spare}</span>
          </div>
          {r.ballots && <Ballots ballots={r.ballots} players={players} />}
          {r.deaths
            .filter((d) => d.playerId !== r.nomineeId)
            .map((d) => (
              <p key={d.playerId} className="text-3xl text-pink-300">
                💔 {players.get(d.playerId)?.name}
              </p>
            ))}
        </div>
      );
    }
    case "gameOver":
      return (
        <div className="grid w-full max-w-7xl gap-10 text-left lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-8">
            <WinnerBanner state={state} t={t} big />
            <RolesGrid state={state} />
          </div>
          {state.log && (
            <div className="card max-h-[70dvh] overflow-y-auto">
              <h3 className="mb-3 text-2xl font-bold">{t("screen.timeline")}</h3>
              <Timeline log={state.log} t={t} />
            </div>
          )}
        </div>
      );
  }
}

function LobbyScreen({ state }: { state: ClientState }) {
  const { url } = useJoinUrl(state.code);
  return (
    <div className="grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2">
      <div className="flex flex-col items-center gap-6">
        <div className="rounded-3xl bg-white p-6 shadow-2xl shadow-gold/20">
          {url && <QRCodeSVG value={url} size={340} level="M" marginSize={0} />}
        </div>
        <div className="font-mono text-8xl font-black tracking-[0.2em] text-gold">{state.code}</div>
        <div className="text-xl text-white/60">
          <Bi k="screen.joinAt" as="p" sub="inline text-white/40" /> <span className="font-mono text-white">{url}</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-6">
        <Bi
          k={state.players.length ? "player.inLobby" : "screen.waitingPlayers"}
          params={{ count: state.players.length }}
          className="font-display text-5xl font-black text-moon"
        />
        <div className="flex flex-wrap justify-center gap-4">
          {state.players.map((p) => (
            <PlayerBubble key={p.id} p={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AliveRow({ state }: { state: ClientState }) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {state.players.map((p) => (
        <div key={p.id} className="flex w-20 flex-col items-center gap-1">
          <Avatar p={p} size="md" />
          <span className={`w-full truncate text-center text-sm ${p.alive ? "" : "text-white/30 line-through"}`}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

function NominationBars({ state, players }: { state: ClientState; players: Map<string, PlayerView> }) {
  const nom = state.nomination;
  if (!nom) return null;
  const entries = Object.entries(nom.counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, c]) => c));
  return (
    <div className="flex w-full flex-col gap-2">
      {entries.map(([id, c]) => {
        const p = players.get(id);
        const up = state.nominees.includes(id);
        return (
          <div key={id} className="flex items-center gap-4">
            <span className={`w-48 truncate text-right text-2xl font-semibold ${up ? "text-gold" : "text-white/60"}`}>
              {p?.avatar} {p?.name}
            </span>
            <div className="h-8 flex-1 overflow-hidden rounded-lg bg-white/5">
              <div className={`h-full ${up ? "bg-gold" : "bg-white/20"}`} style={{ width: `${(c / max) * 100}%` }} />
            </div>
            <span className="w-10 text-2xl font-bold">{c}</span>
          </div>
        );
      })}
      {state.vote?.ballots && <Ballots ballots={state.vote.ballots} players={players} />}
    </div>
  );
}

function Ballots({ ballots, players }: { ballots: Record<string, string>; players: Map<string, PlayerView> }) {
  const t = useT();
  const label = (c: string) =>
    c === "skip" ? t("player.skip") : c === "execute" ? "🪢" : c === "spare" ? "🕊️" : players.get(c)?.name ?? "?";
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2 text-lg">
      {Object.entries(ballots).map(([voter, c]) => (
        <span key={voter} className="chip px-3 py-1 text-base">
          {players.get(voter)?.avatar} {players.get(voter)?.name} → {label(c)}
        </span>
      ))}
    </div>
  );
}

