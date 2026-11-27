"use client";

import { useEffect, useRef, useState } from "react";
import { NIGHT_STEP_ROLE, ROLES, ROLE_IDS, SOLO_ROLES } from "@shared/roles";
import type { NightStepId, RoleId, Winner } from "@shared/types";
import type { ClientState, PlayerView } from "@shared/views";
import { RolesGrid, Timeline, WinnerBanner } from "@/components/GameOver";
import { VoteBreakdown } from "@/components/VoteBreakdown";
import { Avatar, PhaseIn, RoleBadge, StyledName, TimerDisplay, phaseKeyOf } from "@/components/ui";
import { ProfileLink } from "../Profile";
import { formatLog, useLocale, useT } from "@/lib/i18n";
import { speak, stopSpeaking, useTtsSupported } from "@/lib/tts";
import { SocialPanel } from "@/components/SocialPanel";
import { RolesInPlay } from "@/components/RolesInPlay";
import { nameOf, scriptLines, useHostAction } from "./common";
import { RulesCard } from "./RulesCard";
import { ProphecyEnd } from "@/components/Prophecy";

type Props = { state: ClientState; offset: number; hideRoles: boolean };

export function HostGame({ state, offset, hideRoles }: Props) {
  const t = useT();
  const act = useHostAction();
  const kind = state.phase.kind;

  if (kind === "gameOver")
    return (
      <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1.3fr_1fr] xl:h-full xl:min-h-0">
        <section className="card flex flex-col gap-6 py-8 xl:min-h-0 xl:overflow-y-auto">
          <WinnerBanner state={state} t={t} />
          <ProphecyEnd state={state} />
          <RolesGrid state={state} />
          <button
            className="btn-primary mx-auto px-8 py-4 text-lg"
            onClick={() => confirm(t("host.confirmNewGame")) && act({ type: "newGame" })}
          >
            🔁 {t("host.newGame")}
          </button>
        </section>
        <section className="card max-h-[80dvh] overflow-y-auto xl:max-h-none xl:min-h-0">
          <h3 className="mb-3 text-lg font-bold">{t("screen.timeline")}</h3>
          <Timeline log={(state.log ?? []).filter((e) => e.public)} t={t} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-white/50">{t("host.log")}</summary>
            <LogList state={state} />
          </details>
        </section>
      </main>
    );

  return (
    <main className="grid gap-4 p-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)_minmax(0,0.9fr)]">
      <div className="order-2 flex flex-col gap-4 xl:order-1 xl:min-h-0 xl:overflow-y-auto">
        <PlayersTable state={state} hideRoles={hideRoles} />
      </div>
      <div className="order-1 flex flex-col gap-4 xl:order-2 xl:min-h-0">
        <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <PhaseBar state={state} />
          <RolesInPlay state={state} />
          {state.pendingWin && <WinPending state={state} winner={state.pendingWin} />}
          <ScriptCard state={state} />
          <PhaseIn phaseKey={phaseKeyOf(state.phase)}>
            <PhasePanel state={state} hideRoles={hideRoles} />
          </PhaseIn>
        </div>
        <div className="shrink-0">
          <Controls state={state} offset={offset} />
        </div>
      </div>
      <div className="order-3 flex flex-col gap-4 xl:min-h-0 xl:overflow-y-auto">
        <section className="card flex max-h-[60dvh] flex-col xl:max-h-none xl:min-h-[240px] xl:flex-1">
          <h3 className="mb-2 font-bold">📜 {t("host.log")}</h3>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LogList state={state} hideRoles={hideRoles} />
          </div>
        </section>
        {/* The chat box (room, dead, server) when the main panel is not already it. */}
        {state.phase.kind !== "discussion" && state.phase.kind !== "defense" && (
          <SocialPanel state={state} viewer="host" className="h-[min(60dvh,560px)]" />
        )}
        <ManualEnd state={state} />
        <RulesCard state={state} defaultOpen={false} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

const DAY_FLOW = ["dawn", "discussion", "nominate", "nominateResult", "defense", "verdict", "verdictResult"] as const;

function PhaseBar({ state }: { state: ClientState }) {
  const t = useT();
  const k = state.phase.kind;
  const isNight = k === "night";
  const chip = (label: string, active: boolean, done: boolean, key: string) => (
    <li
      key={key}
      className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
        active ? "bg-gold text-night-950" : done ? "bg-white/10 text-white/50" : "bg-white/5 text-white/40"
      }`}
    >
      {label}
    </li>
  );
  const dayIndex = DAY_FLOW.indexOf(k as (typeof DAY_FLOW)[number]);
  return (
    <section className="card py-3">
      <ol className="flex flex-wrap items-center gap-1.5">
        {k === "roleReveal" && chip(t("phase.roleReveal"), true, false, "rr")}
        {chip(t("phase.night", { n: isNight ? state.phase.night : Math.max(1, state.phase.night) }), isNight, !isNight, "night")}
        {isNight &&
          state.phase.steps.map((s, i) =>
            chip(`${ROLES[NIGHT_STEP_ROLE[s]].emoji} ${t(`roles.${NIGHT_STEP_ROLE[s]}.name`)}`, i === state.phase.stepIndex, i < state.phase.stepIndex, s),
          )}
        {DAY_FLOW.map((p, i) =>
          chip(
            p === "dawn" ? t("phase.dawn", { n: Math.max(1, state.phase.day || state.phase.night) }) : t(`phase.${p}`),
            k === p,
            !isNight && dayIndex > i,
            p,
          ),
        )}
        {k === "hunter" && chip(`🏹 ${t("phase.hunter")}`, true, false, "hunter")}
      </ol>
    </section>
  );
}

function WinPending({ winner }: { state: ClientState; winner: Winner }) {
  const t = useT();
  const act = useHostAction();
  return (
    <section className="card pulse-ring border-gold/60 bg-gold/10">
      <h3 className="text-xl font-bold text-gold">🏆 {t("host.winPendingTitle")}</h3>
      <p className="mt-1">{t("host.winPendingDesc", { winner: t(`winner.${winner}.title`) })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-gold" onClick={() => act({ type: "confirmWin" })}>
          {t("host.confirmWin")}
        </button>
        <button className="btn-ghost" onClick={() => act({ type: "dismissWin" })}>
          {t("host.keepPlaying")}
        </button>
      </div>
    </section>
  );
}

function ScriptCard({ state }: { state: ClientState }) {
  const t = useT();
  const { locale } = useLocale();
  const lines = scriptLines(state, t);
  const canSpeakTts = useTtsSupported();
  return (
    <section className="card border-gold/20">
      <div className="flex items-center gap-2">
        <h3 className="ui-label mb-0 flex-1">🎙️ {t("script.title")}</h3>
        {canSpeakTts && (
          <>
            <button className="btn-ghost btn-sm" onClick={() => speak(lines, locale)} title={t("host.readNow")}>
              🔊<span className="sr-only">{t("host.readNow")}</span>
            </button>
            <button className="btn-ghost btn-sm" onClick={() => stopSpeaking()} title={t("host.stopReading")}>
              ⏹<span className="sr-only">{t("host.stopReading")}</span>
            </button>
          </>
        )}
      </div>
      <div className="space-y-2 font-display text-xl leading-relaxed text-moon">
        {lines.map((l, i) => (
          <p key={i} className={l.startsWith("(") ? "font-sans text-sm text-white/50" : ""}>
            {l}
          </p>
        ))}
      </div>
    </section>
  );
}

function Controls({ state, offset }: { state: ClientState; offset: number }) {
  const t = useT();
  const act = useHostAction();
  const k = state.phase.kind;
  const timed = k === "discussion" || k === "defense" || state.timer.durationMs > 0;
  const blocked = !!state.pendingWin && k !== "night";
  return (
    <section className="card flex flex-col gap-3">
      {timed && (
        <div className="flex flex-col gap-2">
          <TimerDisplay timer={state.timer} offset={offset} className="text-5xl" />
          <div className="flex flex-wrap justify-center gap-2">
            {state.timer.running ? (
              <button className="btn-ghost btn-sm" onClick={() => act({ type: "timer", op: "pause" })} title={t("host.timerPause")}>
                ⏸<span className="sr-only">{t("host.timerPause")}</span>
              </button>
            ) : (
              <button className="btn-ghost btn-sm" onClick={() => act({ type: "timer", op: "resume" })} title={t("host.timerResume")}>
                ▶<span className="sr-only">{t("host.timerResume")}</span>
              </button>
            )}
            <button className="btn-ghost btn-sm" onClick={() => act({ type: "timer", op: "add", seconds: 30 })}>
              {t("host.timerAdd")}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => act({ type: "timer", op: "reset" })}>
              ↺ {t("host.timerReset")}
            </button>
          </div>
        </div>
      )}
      {!timed && (
        <div className="flex flex-wrap justify-center gap-2">
          {[60, 120, 180].map((s) => (
            <button key={s} className="btn-ghost btn-sm" onClick={() => act({ type: "timer", op: "start", seconds: s })}>
              ⏱ {t("common.secondsShort", { n: s })}
            </button>
          ))}
        </div>
      )}
      <AutoCountdown autoAt={state.autoAt} offset={offset} />
      <button className="btn-primary py-5 text-xl" disabled={blocked} onClick={() => act({ type: "next" })}>
        {t("host.next")} →
      </button>
    </section>
  );
}

/** "Moving on in 3s…" while the auto narrator is about to advance. */
function AutoCountdown({ autoAt, offset }: { autoAt: number | null; offset: number }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!autoAt) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [autoAt]);
  if (!autoAt) return null;
  const s = Math.max(1, Math.ceil((autoAt - (now + offset)) / 1000));
  return <p className="animate-pulse text-center text-sm font-semibold text-gold">⏳ {t("host.autoIn", { s })}</p>;
}

// ---------------------------------------------------------------------------
// Players table with overrides
// ---------------------------------------------------------------------------

function PlayersTable({ state, hideRoles }: { state: ClientState; hideRoles: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const alive = state.players.filter((p) => p.alive).length;
  return (
    <section className="card">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-bold">{t("host.players")}</h3>
        <span className="chip">
          {alive}/{state.players.length} {t("common.alive")}
        </span>
        {hideRoles && <span className="chip text-gold">🙈 {t("host.rolesHidden")}</span>}
      </div>
      {state.lovers && !hideRoles && (
        <p className="mb-2 text-sm text-pink-300">{t("host.lovers", { a: nameOf(state, state.lovers[0]), b: nameOf(state, state.lovers[1]) })}</p>
      )}
      <ul className="flex flex-col gap-1">
        {state.players.map((p) => (
          <PlayerRow key={p.id} p={p} state={state} hideRoles={hideRoles} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
        ))}
      </ul>
    </section>
  );
}

function PlayerRow({
  p,
  state,
  hideRoles,
  open,
  onToggle,
}: {
  p: PlayerView;
  state: ClientState;
  hideRoles: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const act = useHostAction();
  const effects = hideRoles ? [] : p.effects ?? [];
  return (
    <li className={`rounded-xl ${p.alive ? "bg-white/5" : "bg-black/30"} p-2`}>
      <div className="flex items-center gap-2">
        <ProfileLink playerId={p.id} className="shrink-0">
          <Avatar p={p} size="sm" />
        </ProfileLink>
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1 truncate text-sm font-semibold ${p.alive ? "" : "text-white/40 line-through"}`}>
            <ProfileLink playerId={p.id} className="min-w-0">
              <StyledName p={p} className="truncate" />
            </ProfileLink>
            {(p.isBot || p.standIn) && <span className="text-xs" title={p.standIn ? t("player.standInBadge") : undefined}>🤖</span>}
            {!p.connected && !p.isBot && <span className="text-xs text-blood-light">●</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {p.roleId && !hideRoles ? <RoleBadge roleId={p.roleId} /> : <span className="chip">•••</span>}
            {effects.map((e) => (
              <span key={e} className="chip border-gold/30 text-[10px] text-gold">
                {t(`effects.${e}`)}
              </span>
            ))}
          </div>
        </div>
        <button className="btn-ghost btn-sm" onClick={onToggle} aria-expanded={open} title={t("host.override")}>
          ⋯
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
          {p.alive ? (
            <button
              className="btn-sm btn bg-blood/80 text-white"
              onClick={() => confirm(t("host.confirmKill", { name: p.name })) && act({ type: "override", action: { kind: "kill", playerId: p.id } })}
            >
              💀 {t("host.kill")}
            </button>
          ) : (
            <button className="btn-sm btn bg-emerald-600 text-white" onClick={() => act({ type: "override", action: { kind: "revive", playerId: p.id } })}>
              ✨ {t("host.revive")}
            </button>
          )}
          <label className="flex items-center gap-1 text-xs">
            {t("host.changeRole")}
            <select
              className="ui-select"
              value={hideRoles ? "" : p.roleId ?? ""}
              onChange={(e) => e.target.value && act({ type: "override", action: { kind: "changeRole", playerId: p.id, roleId: e.target.value as RoleId } })}
            >
              {hideRoles && <option value="">•••</option>}
              {ROLE_IDS.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].emoji} {t(`roles.${r}.name`)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              const name = prompt(t("host.renamePrompt", { name: p.name }), p.name);
              if (name) act({ type: "rename", playerId: p.id, name });
            }}
          >
            ✏️ {t("host.rename")}
          </button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Phase specific panels
// ---------------------------------------------------------------------------

function PhasePanel({ state, hideRoles }: { state: ClientState; hideRoles: boolean }) {
  switch (state.phase.kind) {
    case "night":
      return <NightPanel state={state} hideRoles={hideRoles} />;
    case "dawn":
      return <DawnPanel state={state} hideRoles={hideRoles} />;
    case "hunter":
      return <HunterPanel state={state} />;
    case "nominate":
    case "verdict":
      return <VotePanel state={state} hideRoles={hideRoles} />;
    case "nominateResult":
      return <NominationBreakdownPanel state={state} />;
    case "discussion":
    case "defense":
      return <SocialPanel state={state} viewer="host" className="h-[min(78dvh,760px)]" />;
    case "defense":
      return <NominationResult state={state} />;
    case "verdictResult":
      return <VerdictResultPanel state={state} />;
    default:
      return null;
  }
}

function NightPanel({ state, hideRoles }: { state: ClientState; hideRoles: boolean }) {
  const t = useT();
  const n = state.night;
  const statuses = n.stepStatus ?? [];
  const reveal = (s: string) => (hideRoles ? "•••" : s);
  return (
    <section className="card">
      <h3 className="mb-2 font-bold">{t("host.nightSteps")}</h3>
      <ol className="flex flex-col gap-1.5">
        {statuses.map((s, i) => {
          const current = i === state.phase.stepIndex;
          return (
            <li key={s.step} className={`rounded-xl p-2 ${current ? "bg-gold/10 ring-1 ring-gold/50" : "bg-white/5"}`}>
              <div className="flex items-center gap-2">
                <span className="w-5 text-white/40">{i + 1}.</span>
                <RoleBadge roleId={NIGHT_STEP_ROLE[s.step]} />
                {!hideRoles && s.actors.length > 0 && (
                  <span className="truncate text-xs text-white/50">{s.actors.map((id) => nameOf(state, id)).join(", ")}</span>
                )}
                {hideRoles ? (
                  // Roles hidden: no hint of who acted, how fast, or whether the role is still alive.
                  <span className="ml-auto text-xs font-bold text-gold">{current ? t("host.stepCalling") : ""}</span>
                ) : (
                  <span
                    className={`ml-auto text-xs font-bold ${!s.actors.length ? "text-white/40" : s.done ? "text-emerald-300" : current ? "text-gold" : "text-white/40"}`}
                  >
                    {!s.actors.length ? t("host.stepNobody") : s.done ? `✓ ${t("host.stepDone")}` : current ? t("host.stepWaiting") : ""}
                  </span>
                )}
              </div>
              {current && !hideRoles && <StepDetail state={state} step={s.step} />}
              {current && !hideRoles && !s.done && <ActFor state={state} step={s.step} actors={s.actors} />}
              {current &&
                !hideRoles &&
                s.step === "werewolf" &&
                state.settings.wolvesMustBite !== false &&
                s.actors.length > 0 &&
                !Object.keys(state.night.wolfVotes ?? {}).length && (
                  <p className="mt-1 pl-7 text-xs font-semibold text-blood-light">{t("host.wolvesMustBiteNote")}</p>
                )}
            </li>
          );
        })}
      </ol>
      {!hideRoles && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {n.wolfTarget && <span className="chip text-blood-light">{t("host.wolfTarget", { name: reveal(nameOf(state, n.wolfTarget)) })}</span>}
          {state.potions && (
            <span className="chip">
              🧪 {t("host.potions")}: {state.potions.heal ? "💚" : "✕"} {state.potions.poison ? "☠️" : "✕"}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function StepDetail({ state, step }: { state: ClientState; step: NightStepId }) {
  const t = useT();
  const n = state.night;
  const name = (id?: string | null) => (id ? nameOf(state, id) : t("host.noneYet"));
  let text: React.ReactNode = null;
  if (step === "werewolf") {
    const votes = Object.entries(n.wolfVotes ?? {});
    text = (
      <>
        {t("host.wolvesPicking")} {votes.length ? votes.map(([w, tg]) => `${nameOf(state, w)} → ${nameOf(state, tg)}`).join(" · ") : t("host.noneYet")}
      </>
    );
  } else if (step === "bodyguard") text = `🛡️ ${name(n.protectId)}`;
  else if (step === "wolfSeer") text = `👁️ ${name(n.wolfSeerTarget)}`;
  else if (step === "cursedWolf") text = `🐺 ${name(n.wolfTarget)} · 🩸 ${n.curse ? "✓" : "—"}`;
  else if (step === "seer") text = `🔮 ${name(n.seerTarget)}`;
  else if (step === "medium") text = `🕯️ ${name(n.mediumTarget)}`;
  else if (step === "bigBadWolf") text = `🐗 ${name(n.bigBadTarget)}`;
  else if (step === "silencer") text = `🤐 ${name(n.silenceId)}`;
  else if (step === "whiteWolf") text = `🤍 ${name(n.whiteWolfTarget)}`;
  else if (step === "serialKiller") text = `🔪 ${name(n.killerTarget)}`;
  else if (step === "arsonist")
    text = n.ignite
      ? `🔥 ${(n.doused ?? []).map((id) => nameOf(state, id)).join(", ") || "—"}`
      : `🛢️ ${name(n.douseId)} · ${(n.doused ?? []).map((id) => nameOf(state, id)).join(", ") || "—"}`;
  else if (step === "wildChild") text = `🧒 ${name(Object.values(n.wildModels ?? {})[0])}`;
  else if (step === "witch")
    text = `🐺 ${name(n.wolfTarget)} · 💚 ${n.witchSave ? "✓" : "—"} · ☠️ ${n.witchPoisonId ? nameOf(state, n.witchPoisonId) : "—"}`;
  else if (step === "cupid") text = state.lovers ? `💘 ${nameOf(state, state.lovers[0])} & ${nameOf(state, state.lovers[1])}` : t("host.noneYet");
  return <div className="mt-1 pl-7 text-sm text-white/80">{text}</div>;
}

/** Lets the Host submit a night action for a player whose phone is unavailable. */
function ActFor({ state, step, actors }: { state: ClientState; step: NightStepId; actors: string[] }) {
  const t = useT();
  const act = useHostAction();
  const [actor, setActor] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const pending = actors.filter((id) => {
    const p = state.players.find((x) => x.id === id);
    return p && (p.isBot || !p.connected);
  });
  useEffect(() => setActor(pending[0] ?? ""), [pending.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pending.length) return null;
  const alive = state.players.filter((p) => p.alive);
  const sel = (v: string, set: (v: string) => void) => (
    <select className="ui-select" value={v} onChange={(e) => set(e.target.value)}>
      <option value="">—</option>
      {alive.map((p) => (
        <option key={p.id} value={p.id}>
          {p.avatar} {p.name}
        </option>
      ))}
    </select>
  );
  const submit = () => {
    if (step === "witch") return act({ type: "actAs", playerId: actor, action: { type: "night", save: false, poisonId: a || null } });
    if (step === "cursedWolf") return act({ type: "actAs", playerId: actor, action: { type: "night", curse: false } });
    const targets = step === "cupid" ? [a, b] : [a];
    if (targets.some((x) => !x)) return;
    act({ type: "actAs", playerId: actor, action: { type: "night", targets } });
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 pl-7 text-xs" title={t("host.actForHint")}>
      <span className="font-semibold text-white/60">{t("host.actFor")}:</span>
      <select className="ui-select" value={actor} onChange={(e) => setActor(e.target.value)}>
        {pending.map((id) => (
          <option key={id} value={id}>
            {nameOf(state, id)}
          </option>
        ))}
      </select>
      {step !== "cursedWolf" && sel(a, setA)}
      {step === "cupid" && sel(b, setB)}
      <button className="btn-ghost btn-sm" onClick={submit}>
        {(step === "witch" && !a) || step === "cursedWolf" ? t("host.pass") : t("host.send")}
      </button>
    </div>
  );
}

function DawnPanel({ state, hideRoles }: { state: ClientState; hideRoles: boolean }) {
  const t = useT();
  return (
    <section className="card">
      <h3 className="mb-2 font-bold">{t("host.lastDeaths")}</h3>
      {state.lastDeaths.length ? (
        <ul className="flex flex-wrap gap-3">
          {state.lastDeaths.map((d) => {
            const p = state.players.find((x) => x.id === d.playerId);
            return p ? (
              <li key={d.playerId} className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
                <ProfileLink playerId={p.id}>
                  <Avatar p={p} size="sm" />
                </ProfileLink>
                <ProfileLink playerId={p.id} className="font-semibold">
                  <StyledName p={p} />
                </ProfileLink>
                {!hideRoles && p.roleId && <RoleBadge roleId={p.roleId} />}
                {!hideRoles && d.cause && <span className="chip">{t(`cause.${d.cause}`)}</span>}
              </li>
            ) : null;
          })}
        </ul>
      ) : (
        <p className="text-white/60">{t("host.nobody")}</p>
      )}
    </section>
  );
}

function HunterPanel({ state }: { state: ClientState }) {
  const t = useT();
  const act = useHostAction();
  const [target, setTarget] = useState("");
  const hunter = state.players.find((p) => p.id === state.hunterId);
  return (
    <section className="card">
      <p className="text-lg font-semibold">
        {state.hunterShot === null
          ? t("host.hunterTurn", { name: hunter?.name ?? "?" })
          : state.hunterShot
            ? t("host.hunterShotResult", { name: nameOf(state, state.hunterShot) })
            : t("host.hunterNoShot")}
      </p>
      {state.hunterShot === null && hunter && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/60">{t("host.actFor")}:</span>
          <select className="ui-select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">—</option>
            {state.players
              .filter((p) => p.alive && p.id !== hunter.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.avatar} {p.name}
                </option>
              ))}
          </select>
          <button
            className="btn-ghost btn-sm"
            onClick={() => act({ type: "actAs", playerId: hunter.id, action: { type: "hunterShot", targetId: target || null } })}
          >
            {target ? t("host.send") : t("host.pass")}
          </button>
        </div>
      )}
    </section>
  );
}

function NominationBreakdownPanel({ state }: { state: ClientState }) {
  const t = useT();
  const act = useHostAction();
  return (
    <section className="card">
      <VoteBreakdown state={state} t={t} />
      <button className="btn-ghost btn-sm mt-3" onClick={() => act({ type: "override", action: { kind: "revote" } })}>
        {t("host.revote")}
      </button>
    </section>
  );
}

/** Live vote monitor. Ballots stay secret on screen while "hide roles" is on (projecting). */
function VotePanel({ state, hideRoles }: { state: ClientState; hideRoles: boolean }) {
  const t = useT();
  const act = useHostAction();
  const v = state.vote;
  if (!v) return null;
  const ballots = v.ballots ?? {};
  const eligibleIds =
    v.kind === "verdict"
      ? state.players.filter((p) => p.alive && !state.nominees.includes(p.id))
      : state.players.filter((p) => p.alive);
  const notVoted = eligibleIds.filter((p) => !(p.id in ballots));
  const label = (c: string) =>
    c === "skip" ? t("player.skip") : c === "execute" ? `🪢 ${t("player.execute")}` : c === "spare" ? `🕊️ ${t("player.spare")}` : nameOf(state, c);
  const counts: Record<string, number> = {};
  for (const c of Object.values(ballots)) counts[c] = (counts[c] || 0) + 1;
  return (
    <section className="card">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-bold">
          {v.kind === "verdict" ? t("host.verdictFor", { name: nameOf(state, v.nomineeId) }) : t("phase.nominate")}
        </h3>
        <span className="chip ml-auto">{t("host.voteProgress", { voted: v.voted, eligible: v.eligible })}</span>
      </div>
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gold transition-[width]" style={{ width: `${v.eligible ? (v.voted / v.eligible) * 100 : 0}%` }} />
      </div>
      {!hideRoles && <div className="mb-2 flex flex-wrap gap-1.5">
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => (
            <span key={c} className="chip border-gold/40 text-gold">
              {label(c)}: {n}
            </span>
          ))}
      </div>}
      {!hideRoles && <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        {Object.entries(ballots).map(([voter, c]) => (
          <li key={voter} className="truncate text-white/70">
            {nameOf(state, voter)} → <span className="text-white">{label(c)}</span>
          </li>
        ))}
      </ul>}
      {state.settings.mandatoryVote && notVoted.length > 0 && (
        <p className="mt-2 text-sm font-semibold text-blood-light">{t("host.mustVoteNote", { count: notVoted.length })}</p>
      )}
      {notVoted.length > 0 && (
        <p className="mt-2 text-xs text-white/50">
          {t("host.notVoted")} {notVoted.map((p) => p.name).join(", ")}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost btn-sm" onClick={() => act({ type: "override", action: { kind: "cancelVote" } })}>
          {t("host.cancelVote")}
        </button>
        <button className="btn-ghost btn-sm" onClick={() => act({ type: "override", action: { kind: "revote" } })}>
          {t("host.revote")}
        </button>
      </div>
    </section>
  );
}

function NominationResult({ state }: { state: ClientState }) {
  const t = useT();
  const act = useHostAction();
  const nom = state.nomination;
  return (
    <section className="card">
      <h3 className="mb-2 font-bold">{t("host.nominees")}</h3>
      <div className="flex flex-wrap gap-3">
        {state.nominees.map((id) => {
          const p = state.players.find((x) => x.id === id);
          return p ? (
            <div key={id} className="flex items-center gap-2 rounded-xl bg-gold/10 p-2">
              <ProfileLink playerId={p.id}>
                <Avatar p={p} size="sm" />
              </ProfileLink>
              <ProfileLink playerId={p.id} className="font-bold">
                <StyledName p={p} />
              </ProfileLink>
              <span className="chip">{t("host.votesFor", { count: nom?.counts[id] ?? 0 })}</span>
            </div>
          ) : null;
        })}
      </div>
      {nom && (
        <p className="mt-2 text-xs text-white/50">
          {Object.entries(nom.counts)
            .sort((a, b) => b[1] - a[1])
            .map(([id, c]) => `${nameOf(state, id)}: ${c}`)
            .join(" · ")}
          {nom.skips > 0 && ` · ${t("host.skips", { count: nom.skips })}`}
        </p>
      )}
      <button className="btn-ghost btn-sm mt-3" onClick={() => act({ type: "override", action: { kind: "revote" } })}>
        {t("host.revote")}
      </button>
    </section>
  );
}

function VerdictResultPanel({ state }: { state: ClientState }) {
  const t = useT();
  const act = useHostAction();
  const r = state.verdicts[state.verdicts.length - 1];
  if (!r) return null;
  return (
    <section className="card">
      <h3 className={`text-xl font-bold ${r.idiotRevealed ? "text-teal-300" : r.executed ? "text-blood-light" : "text-emerald-300"}`}>
        {r.idiotRevealed
          ? t("host.resultIdiot", { name: nameOf(state, r.nomineeId) })
          : r.executed
            ? t("host.resultExecuted", { name: nameOf(state, r.nomineeId) })
            : t("host.resultSpared", { name: nameOf(state, r.nomineeId) })}
      </h3>
      <p className="mt-1 text-sm text-white/70">
        🪢 {r.execute} · 🕊️ {r.spare} · — {r.abstain}
      </p>
      <div className="mt-3">
        <VoteBreakdown state={state} t={t} />
      </div>
      <button className="btn-ghost btn-sm mt-3" onClick={() => act({ type: "override", action: { kind: "revote" } })}>
        {t("host.revote")}
      </button>
    </section>
  );
}

function ManualEnd({ state }: { state: ClientState }) {
  const t = useT();
  const act = useHostAction();
  return (
    <details className="card">
      <summary className="cursor-pointer font-bold">🛠️ {t("host.override")}</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/60">{t("host.endGameAs")}</span>
        {([...["village", "wolves", "lovers", "draw"], ...SOLO_ROLES.filter((r) => state.players.some((p) => p.roleId === r))] as Winner[]).map((w) => (
          <button
            key={w}
            className="btn-ghost btn-sm"
            onClick={() => confirm(t("host.confirmEnd", { winner: t(`winner.${w}.title`) })) && act({ type: "endGame", winner: w })}
          >
            {t(`winner.${w}.title`)}
          </button>
        ))}
      </div>
    </details>
  );
}

function LogList({ state, hideRoles = false }: { state: ClientState; hideRoles?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLOListElement>(null);
  const log = state.log ?? [];
  useEffect(() => {
    ref.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [log.length]);
  if (!log.length) return <p className="text-sm text-white/40">{t("host.logEmpty")}</p>;
  if (hideRoles) return <p className="text-sm text-white/40">🙈 {t("host.rolesHidden")}</p>;
  return (
    <ol ref={ref} className="space-y-1 text-sm">
      {log.map((e, i) => (
        <li key={i} className={`flex gap-2 ${e.public ? "text-white" : "text-white/60"}`}>
          <span className="shrink-0 font-mono text-[10px] text-white/30">
            {new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span>{formatLog(t, e)}</span>
        </li>
      ))}
    </ol>
  );
}
