"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES } from "@shared/roles";
import type { ClientState, MeView, PlayerView } from "@shared/views";
import { Avatar, ConnectionDot, RoleBadge, TimerDisplay, useErrorToast } from "@/components/ui";
import { RolesGrid, Timeline, WinnerBanner } from "@/components/GameOver";
import { VoteBreakdown, nominationOutcomeLine } from "@/components/VoteBreakdown";
import { useT } from "@/lib/i18n";
import { emitAck } from "@/lib/socket";

type Props = { state: ClientState; offset: number; connected: boolean };

function usePlayerAction() {
  const showError = useErrorToast();
  return async (action: Record<string, unknown>) => showError(await emitAck("player:action", action));
}

const byId = (state: ClientState) => new Map(state.players.map((p) => [p.id, p]));

export function phaseLabel(t: ReturnType<typeof useT>, state: ClientState) {
  const k = state.phase.kind;
  if (k === "night") return t("phase.night", { n: state.phase.night });
  if (k === "dawn") return t("phase.dawn", { n: state.phase.day });
  return t(`phase.${k}`);
}

export function PlayerGame({ state, offset, connected }: Props) {
  const t = useT();
  const me = state.me!;
  const players = byId(state);
  const self = players.get(me.id)!;
  const kind = state.phase.kind;
  const isNight = kind === "night";
  const [showRole, setShowRole] = useState(false);

  // Vibrate when it becomes my turn to do something.
  const myTurn = !!(me.turn && !me.turn.done) || me.canVote || !!me.hunter?.canShoot;
  const prevTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !prevTurn.current) navigator.vibrate?.([120, 60, 120]);
    prevTurn.current = myTurn;
  }, [myTurn]);

  return (
    <div className={`min-h-dvh transition-colors duration-700 ${isNight ? "bg-black" : ""}`}>
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/5 bg-night-950/90 px-4 py-2 pr-28 backdrop-blur">
        <Avatar p={self} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{self.name}</div>
          <div className="truncate text-xs text-white/50">{phaseLabel(t, state)}</div>
        </div>
        {!connected && <ConnectionDot connected={false} />}
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-4 pb-28">
        {!me.alive && kind !== "gameOver" && (
          <div className="rounded-xl border border-blood/40 bg-blood/15 p-3 text-center text-sm">💀 {t("player.spectator")}</div>
        )}
        <PhaseBody state={state} me={me} offset={offset} players={players} />
        {!me.alive && kind !== "gameOver" && state.players.some((p) => p.id !== me.id && p.roleId) && (
          <section className="card">
            <h3 className="mb-2 font-bold">{t("player.allRoles")}</h3>
            <RolesGrid state={state} compact />
          </section>
        )}
      </main>

      {me.roleId && kind !== "gameOver" && kind !== "roleReveal" && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-night-950 via-night-950/90 to-transparent p-4 pt-8">
          <div className="mx-auto max-w-md">
            {showRole ? (
              <RoleSheet state={state} me={me} players={players} onClose={() => setShowRole(false)} />
            ) : (
              <button className="btn-ghost w-full" onClick={() => setShowRole(true)}>
                🂠 {t("player.showRole")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseBody({
  state,
  me,
  offset,
  players,
}: {
  state: ClientState;
  me: MeView;
  offset: number;
  players: Map<string, PlayerView>;
}) {
  const t = useT();
  switch (state.phase.kind) {
    case "lobby":
      return <Lobby state={state} />;
    case "roleReveal":
      return (
        <>
          <h2 className="text-center font-display text-2xl font-bold text-moon">{t("player.yourRole")}</h2>
          <HoldCard state={state} me={me} players={players} />
        </>
      );
    case "night":
      return <Night state={state} me={me} players={players} />;
    case "dawn":
      return <Dawn state={state} me={me} players={players} />;
    case "hunter":
      return <Hunter state={state} me={me} players={players} />;
    case "discussion":
      return (
        <section className="card flex flex-col items-center gap-4 py-8 text-center">
          <div className="text-5xl">🗣️</div>
          <h2 className="text-2xl font-bold">{t("player.discussion")}</h2>
          <TimerDisplay timer={state.timer} offset={offset} className="text-6xl" />
          <AliveStrip state={state} />
        </section>
      );
    case "nominate":
      return <Nominate state={state} me={me} players={players} />;
    case "defense":
      return (
        <section className="card flex flex-col items-center gap-4 py-6 text-center">
          <h2 className="text-2xl font-bold">⚖️ {t("player.defenseTitle")}</h2>
          {me.onStand && <p className="rounded-xl bg-gold/20 px-4 py-2 font-bold text-gold">{t("player.onStandYou")}</p>}
          <Nominees state={state} players={players} />
          <TimerDisplay timer={state.timer} offset={offset} className="text-5xl" />
        </section>
      );
    case "verdict":
      return <Verdict state={state} me={me} players={players} />;
    case "nominateResult":
      return <NominateResult state={state} />;
    case "verdictResult":
      return <VerdictResult state={state} players={players} />;
    case "gameOver":
      return (
        <>
          <section className="card py-8">
            <WinnerBanner state={state} t={t} />
          </section>
          <section className="card">
            <h3 className="mb-3 font-bold">{t("screen.rolesReveal")}</h3>
            <RolesGrid state={state} compact />
          </section>
          {state.log && (
            <section className="card">
              <h3 className="mb-3 font-bold">{t("screen.timeline")}</h3>
              <Timeline log={state.log} t={t} />
            </section>
          )}
          <p className="text-center text-white/50">{t("player.wait")}</p>
        </>
      );
  }
}

// ---------------------------------------------------------------------------

function Lobby({ state }: { state: ClientState }) {
  const t = useT();
  return (
    <section className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="moon h-24 w-24 rounded-full flicker" aria-hidden />
      <h2 className="text-2xl font-bold">{t("player.waitingHost")}</h2>
      <p className="text-white/60">{t("player.inLobby", { count: state.players.length })}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {state.players.map((p) => (
          <span key={p.id} className={`chip text-sm ${p.id === state.me?.id ? "border-gold text-gold" : ""}`}>
            {p.avatar} {p.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function AliveStrip({ state }: { state: ClientState }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {state.players.map((p) => (
        <span key={p.id} title={p.name}>
          <Avatar p={p} size="sm" />
        </span>
      ))}
    </div>
  );
}

/** Hold to reveal, release to hide — protects against peeking. */
function HoldCard({ state, me, players }: { state: ClientState; me: MeView; players: Map<string, PlayerView> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const role = me.roleId ? ROLES[me.roleId] : null;
  const show = () => {
    setOpen(true);
    navigator.vibrate?.(20);
  };
  const hide = () => setOpen(false);
  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        className="no-select relative aspect-[3/4] w-full max-w-xs touch-none rounded-3xl"
        style={{ perspective: "1000px" }}
        onPointerDown={show}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && show()}
        onKeyUp={hide}
        onBlur={hide}
        aria-label={t("player.holdToReveal")}
      >
        <div
          className="absolute inset-0 transition-transform duration-300"
          style={{ transformStyle: "preserve-3d", transform: open ? "rotateY(180deg)" : "none" }}
        >
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-gold/40 bg-gradient-to-br from-night-700 to-night-900 shadow-2xl"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="moon h-20 w-20 rounded-full" />
            <span className="px-4 font-bold text-gold">{t("player.holdToReveal")}</span>
          </div>
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 p-5 text-center shadow-2xl"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              borderColor: role?.color,
              background: `linear-gradient(160deg, ${role?.color}33, #0a0c18 70%)`,
            }}
          >
            {role && open && (
              <>
                <div className="text-7xl">{role.emoji}</div>
                <div className="font-display text-3xl font-black" style={{ color: role.color }}>
                  {t(`roles.${role.id}.name`)}
                </div>
                <div className="text-xs font-semibold tracking-wider text-white/60 uppercase">{t(`teams.${role.team}`)}</div>
                <p className="text-sm text-white/85">{t(`roles.${role.id}.desc`)}</p>
                {role.team === "wolves" && (
                  <div className="text-sm">
                    <div className="font-bold text-blood-light">{t("player.teammates")}</div>
                    {me.teammates.length
                      ? me.teammates.map((id) => players.get(id)?.name).join(", ")
                      : t("player.noTeammates")}
                  </div>
                )}
                {me.loverId && <div className="text-sm text-pink-300">{t("player.yourLover", { name: players.get(me.loverId)?.name ?? "?" })}</div>}
              </>
            )}
          </div>
        </div>
      </button>
      <p className="text-sm text-white/50">{open ? t("player.releaseToHide") : t("player.holdToReveal")}</p>
    </div>
  );
}

function RoleSheet({
  state,
  me,
  players,
  onClose,
}: {
  state: ClientState;
  me: MeView;
  players: Map<string, PlayerView>;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="card rise max-h-[80dvh] overflow-y-auto">
      <HoldCard state={state} me={me} players={players} />
      {me.seerResults.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-bold">🔮 {t("player.seerHistory")}</h4>
          <ul className="space-y-1 text-sm">
            {me.seerResults.map((r, i) => (
              <li key={i} className={r.isWolf ? "text-blood-light" : "text-emerald-300"}>
                {t("phase.night", { n: r.night })}: {t(r.isWolf ? "player.seerIsWolf" : "player.seerNotWolf", { name: players.get(r.targetId)?.name ?? "?" })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="btn-ghost mt-4 w-full" onClick={onClose}>
        {t("common.close")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target grid
// ---------------------------------------------------------------------------

function TargetGrid({
  players,
  ids,
  selected,
  onPick,
  marks,
  disabled,
}: {
  players: Map<string, PlayerView>;
  ids: string[];
  selected: string[];
  onPick: (id: string) => void;
  marks?: Record<string, React.ReactNode>;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ids.map((id) => {
        const p = players.get(id);
        if (!p) return null;
        const sel = selected.includes(id);
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(id)}
            className={`relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center transition active:scale-95 ${
              sel ? "border-gold bg-gold/20" : "border-white/10 bg-white/5 hover:bg-white/10"
            } disabled:opacity-60`}
            aria-pressed={sel}
          >
            <span className="text-3xl">{p.avatar}</span>
            <span className="line-clamp-2 text-sm leading-tight font-semibold">{p.name}</span>
            {marks?.[id] && <span className="absolute top-1 right-1 text-xs">{marks[id]}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------

function Night({ state, me, players }: { state: ClientState; me: MeView; players: Map<string, PlayerView> }) {
  const t = useT();
  const stepKey = `${state.phase.night}-${state.phase.stepIndex}`;
  const header = (
    <div className="flex flex-col items-center gap-2 pt-4 text-center">
      <div className="moon h-14 w-14 rounded-full opacity-80" aria-hidden />
      <h2 className="font-display text-2xl font-bold text-moon">{t("phase.night", { n: state.phase.night })}</h2>
    </div>
  );
  if (me.turn) return (<>{header}<NightTurn key={stepKey} state={state} me={me} players={players} /></>);
  if (me.decoy) return (<>{header}<Decoy key={stepKey} state={state} me={me} players={players} /></>);
  return (
    <section className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="text-6xl">😴</div>
      <h2 className="font-display text-3xl font-bold text-moon">{t("player.closeEyes")}</h2>
      <p className="text-white/50">{t("player.nightFalls")}</p>
    </section>
  );
}

function Decoy({ state, me, players }: { state: ClientState; me: MeView; players: Map<string, PlayerView> }) {
  const t = useT();
  const [sel, setSel] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const ids = state.players.filter((p) => p.alive && p.id !== me.id).map((p) => p.id);
  return (
    <section className="flex flex-col gap-4">
      <p className="text-center font-semibold">{done ? t("player.decoyDone") : t("player.decoyTitle")}</p>
      <TargetGrid players={players} ids={ids} selected={sel} onPick={(id) => setSel([id])} disabled={done} />
      <button className="btn-primary py-4 text-lg" disabled={!sel.length || done} onClick={() => setDone(true)}>
        {t("player.confirm")}
      </button>
      <p className="text-center text-xs text-white/40">{t("player.decoyHint")}</p>
    </section>
  );
}

function NightTurn({ state, me, players }: { state: ClientState; me: MeView; players: Map<string, PlayerView> }) {
  const t = useT();
  const act = usePlayerAction();
  const turn = me.turn!;
  const [sel, setSel] = useState<string[]>(turn.selected);
  const [poison, setPoison] = useState<string | null>(null);
  const [save, setSave] = useState(false);
  const roleId = me.roleId!;

  const intro = (
    <div className="pulse-ring rounded-2xl border border-gold/50 bg-gold/10 p-3 text-center">
      <div className="text-sm font-bold text-gold">{t("player.yourTurn")}</div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <RoleBadge roleId={roleId} size="md" />
      </div>
      <p className="mt-2 text-lg font-semibold">{t(`roles.${roleId}.action`)}</p>
    </div>
  );

  // Seer result is shown right after acting.
  if (turn.done) {
    const last = turn.step === "seer" ? me.seerResults[me.seerResults.length - 1] : null;
    return (
      <section className="flex flex-col items-center gap-4 py-10 text-center">
        {last && last.night === state.phase.night && (
          <div className={`rise rounded-2xl border p-5 text-xl font-bold ${last.isWolf ? "border-blood bg-blood/20 text-blood-light" : "border-emerald-500 bg-emerald-500/15 text-emerald-300"}`}>
            {t(last.isWolf ? "player.seerIsWolf" : "player.seerNotWolf", { name: players.get(last.targetId)?.name ?? "?" })}
          </div>
        )}
        {turn.step === "werewolf" && <div className="text-lg font-bold text-emerald-300">✓ {t("player.packAgree")}</div>}
        <div className="text-5xl">😴</div>
        <p className="text-lg">{t("player.done")}</p>
      </section>
    );
  }

  if (turn.kind === "witch" && turn.witch) {
    const w = turn.witch;
    const victim = w.victimId ? players.get(w.victimId) : null;
    const canSave = w.heal && !!victim && (w.canSelfSave || w.victimId !== me.id);
    return (
      <section className="flex flex-col gap-4">
        {intro}
        <div className="card text-center">
          {victim ? (
            <div className="flex flex-col items-center gap-2">
              <Avatar p={victim} size="lg" />
              <p className="font-semibold">{t("player.witchVictim", { name: victim.name })}</p>
            </div>
          ) : (
            <p>{t("player.witchNoVictim")}</p>
          )}
          {victim && (
            <button
              className={`btn mt-3 w-full ${save ? "bg-emerald-500 text-night-950" : "btn-ghost"}`}
              disabled={!canSave}
              onClick={() => {
                setSave(!save);
                if (!save && !w.bothAllowed) setPoison(null);
              }}
            >
              💚 {w.heal ? t("player.witchSave", { name: victim.name }) : t("player.potionUsed")}
            </button>
          )}
        </div>
        <div className="card">
          <p className="mb-2 font-semibold">☠️ {t("player.witchPoison")}</p>
          {w.poison ? (
            <>
              <TargetGrid
                players={players}
                ids={turn.targets}
                selected={poison ? [poison] : []}
                onPick={(id) => {
                  setPoison(poison === id ? null : id);
                  if (!w.bothAllowed) setSave(false);
                }}
              />
              <button className="btn-ghost btn-sm mt-2 w-full" onClick={() => setPoison(null)}>
                {t("player.witchNoPoison")}
              </button>
            </>
          ) : (
            <p className="text-white/50">{t("player.potionUsed")}</p>
          )}
        </div>
        <button className="btn-primary py-4 text-lg" onClick={() => act({ type: "night", save, poisonId: poison })}>
          {t("player.confirm")}
        </button>
      </section>
    );
  }

  if (turn.step === "werewolf") {
    const pack = turn.packVotes ?? {};
    const byTarget: Record<string, string[]> = {};
    for (const [wolfId, target] of Object.entries(pack)) (byTarget[target] ??= []).push(wolfId);
    const marks: Record<string, React.ReactNode> = {};
    for (const [target, wolves] of Object.entries(byTarget))
      marks[target] = <span className="rounded-full bg-blood/80 px-1.5 py-0.5">🐺 {wolves.map((w) => players.get(w)?.avatar).join("")}</span>;
    const agreed = Object.keys(pack).length > 0 && new Set(Object.values(pack)).size === 1;
    return (
      <section className="flex flex-col gap-4">
        {intro}
        <div className="text-center text-sm">
          <span className="font-semibold text-white/70">{t("player.packPicks")}: </span>
          {Object.entries(pack).map(([w, target]) => (
            <span key={w} className="chip mx-0.5">
              {players.get(w)?.avatar} → {players.get(target)?.name}
            </span>
          ))}
          {!agreed && Object.keys(pack).length > 0 && <p className="mt-1 text-gold">{t("player.packDisagree")}</p>}
        </div>
        <TargetGrid
          players={players}
          ids={turn.targets}
          selected={turn.selected}
          marks={marks}
          onPick={(id) => act({ type: "night", targets: [id] })}
        />
      </section>
    );
  }

  const max = turn.picks;
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : max === 1 ? [id] : [...s, id].slice(-max)));
  return (
    <section className="flex flex-col gap-4">
      {intro}
      {max > 1 && <p className="text-center text-sm text-white/60">{t("player.pickTwo")}</p>}
      <TargetGrid players={players} ids={turn.targets} selected={sel} onPick={toggle} />
      <button
        className="btn-primary py-4 text-lg"
        disabled={sel.length !== max}
        onClick={() => act({ type: "night", targets: sel })}
      >
        {t("player.confirm")}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

function Dawn({ state, me, players }: { state: ClientState; me: MeView; players: Map<string, PlayerView> }) {
  const t = useT();
  const deaths = state.lastDeaths;
  const iDied = deaths.some((d) => d.playerId === me.id);
  return (
    <section className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="text-6xl">🌅</div>
      <h2 className="font-display text-3xl font-bold text-moon">{t("player.dawn")}</h2>
      {iDied && <p className="rounded-xl bg-blood/25 px-4 py-2 text-xl font-bold text-blood-light">{t("player.youDied")}</p>}
      {deaths.length ? (
        <>
          <p className="text-white/70">{t("player.diedLastNight")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {deaths.map((d) => {
              const p = players.get(d.playerId);
              return p ? (
                <div key={d.playerId} className="flex flex-col items-center gap-1">
                  <Avatar p={p} size="lg" />
                  <span className="font-semibold">{p.name}</span>
                  {p.roleId && <RoleBadge roleId={p.roleId} />}
                </div>
              ) : null;
            })}
          </div>
        </>
      ) : (
        <p className="text-xl text-emerald-300">{t("player.peacefulNight")}</p>
      )}
      <p className="text-sm text-white/40">{t("player.lookUp")}</p>
    </section>
  );
}

function Hunter({ state, me, players }: { state: ClientState; me: MeView; players: Map<string, PlayerView> }) {
  const t = useT();
  const act = usePlayerAction();
  const [sel, setSel] = useState<string | null>(null);
  if (me.hunter?.canShoot)
    return (
      <section className="flex flex-col gap-4">
        <div className="pulse-ring rounded-2xl border border-gold/50 bg-gold/10 p-4 text-center">
          <div className="text-4xl">🏹</div>
          <p className="mt-2 text-lg font-bold">{t("player.hunterYou")}</p>
        </div>
        <TargetGrid players={players} ids={me.hunter.targets} selected={sel ? [sel] : []} onPick={setSel} />
        <button className="btn-primary py-4 text-lg" disabled={!sel} onClick={() => act({ type: "hunterShot", targetId: sel })}>
          {t("player.confirm")}
        </button>
        <button className="btn-ghost" onClick={() => act({ type: "hunterShot", targetId: null })}>
          {t("player.hunterNoShot")}
        </button>
      </section>
    );
  const shotName = state.hunterShot ? players.get(state.hunterShot)?.name : null;
  return (
    <section className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-6xl">🏹</div>
      <p className="text-xl font-bold">
        {state.hunterShot === null
          ? t("player.hunterWaiting")
          : shotName
            ? t("script.hunterShot", { name: shotName })
            : t("script.hunterMissed")}
      </p>
    </section>
  );
}

function VoteProgress({ state }: { state: ClientState }) {
  const t = useT();
  const v = state.vote;
  if (!v) return null;
  const pct = v.eligible ? (v.voted / v.eligible) * 100 : 0;
  return (
    <div>
      <div className="mb-1 text-center text-sm text-white/60">{t("player.voteProgress", { voted: v.voted, eligible: v.eligible })}</div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gold transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Nominate({ state, me, players }: { state: ClientState; me: MeView; players: Map<string, PlayerView> }) {
  const t = useT();
  const act = usePlayerAction();
  const [sel, setSel] = useState<string | null>(null);
  const v = state.vote;
  const ids = useMemo(
    () => (v?.candidates ?? state.players.filter((p) => p.alive).map((p) => p.id)).filter((id) => id !== me.id),
    [v?.candidates, state.players, me.id],
  );
  const title = v?.candidates ? t("player.revoteTitle") : t("player.nominateTitle");
  if (me.myVote)
    return (
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="text-5xl">🗳️</div>
        <p className="text-xl font-bold">
          {me.myVote === "skip" ? t("player.votedSkip") : t("player.votedFor", { name: players.get(me.myVote)?.name ?? "?" })}
        </p>
        <div className="w-full">
          <VoteProgress state={state} />
        </div>
      </section>
    );
  if (!me.canVote)
    return (
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <h2 className="text-2xl font-bold">{title}</h2>
        <div className="w-full">
          <VoteProgress state={state} />
        </div>
      </section>
    );
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-center text-2xl font-bold">{title}</h2>
      <TargetGrid players={players} ids={ids} selected={sel ? [sel] : []} onPick={setSel} />
      <button className="btn-primary py-4 text-lg" disabled={!sel} onClick={() => sel && act({ type: "vote", choice: sel })}>
        {t("player.confirm")}
      </button>
      <button className="btn-ghost" onClick={() => act({ type: "vote", choice: "skip" })}>
        {t("player.skip")}
      </button>
      <VoteProgress state={state} />
    </section>
  );
}

function Nominees({ state, players }: { state: ClientState; players: Map<string, PlayerView> }) {
  const t = useT();
  if (!state.nominees.length) return <p className="text-white/60">{t("player.noNominees")}</p>;
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {state.nominees.map((id) => {
        const p = players.get(id);
        return p ? (
          <div key={id} className="flex flex-col items-center gap-1">
            <Avatar p={p} size="lg" />
            <span className="font-bold">{p.name}</span>
            {state.nomination && <span className="text-xs text-white/50">{state.nomination.counts[id] ?? 0} 🗳️</span>}
          </div>
        ) : null;
      })}
    </div>
  );
}

function Verdict({ state, me, players }: { state: ClientState; me: MeView; players: Map<string, PlayerView> }) {
  const t = useT();
  const act = usePlayerAction();
  const nominee = state.vote?.nomineeId ? players.get(state.vote.nomineeId) : null;
  return (
    <section className="flex flex-col items-center gap-5 text-center">
      {nominee && (
        <>
          <Avatar p={nominee} size="xl" />
          <h2 className="text-2xl font-bold">{t("player.verdictTitle", { name: nominee.name })}</h2>
        </>
      )}
      {me.onStand ? (
        <p className="rounded-xl bg-gold/20 px-4 py-3 font-bold text-gold">{t("player.onStandNoVote")}</p>
      ) : me.myVote ? (
        <p className="text-xl font-bold">{me.myVote === "execute" ? t("player.votedExecute") : t("player.votedSpare")}</p>
      ) : me.canVote ? (
        <div className="grid w-full grid-cols-2 gap-3">
          <button className="btn h-36 flex-col bg-blood text-2xl font-black text-white" onClick={() => act({ type: "vote", choice: "execute" })}>
            <span className="text-4xl">🪢</span>
            {t("player.execute")}
          </button>
          <button className="btn h-36 flex-col bg-emerald-500 text-2xl font-black text-night-950" onClick={() => act({ type: "vote", choice: "spare" })}>
            <span className="text-4xl">🕊️</span>
            {t("player.spare")}
          </button>
        </div>
      ) : null}
      <div className="w-full">
        <VoteProgress state={state} />
      </div>
    </section>
  );
}

function VerdictResult({ state, players }: { state: ClientState; players: Map<string, PlayerView> }) {
  const t = useT();
  const r = state.verdicts[state.verdicts.length - 1];
  if (!r) return null;
  const p = players.get(r.nomineeId);
  return (
    <section className="flex flex-col items-center gap-4 py-8 text-center">
      {p && <Avatar p={p} size="xl" />}
      <h2 className={`font-display text-4xl font-black ${r.executed ? "text-blood-light" : "text-emerald-300"}`}>
        {r.executed ? t("screen.executed") : t("screen.spared")}
      </h2>
      <p className="text-lg">
        {t(r.executed ? "script.verdictExecuted" : "script.verdictSpared", { name: p?.name ?? "?", execute: r.execute, spare: r.spare })}
      </p>
      {r.deaths
        .filter((d) => d.playerId !== r.nomineeId)
        .map((d) => (
          <p key={d.playerId} className="text-pink-300">💔 {players.get(d.playerId)?.name}</p>
        ))}
      <VoteBreakdown state={state} t={t} />
    </section>
  );
}

function NominateResult({ state }: { state: ClientState }) {
  const t = useT();
  const outcome = nominationOutcomeLine(state);
  return (
    <section className="flex flex-col items-center gap-4 py-4 text-center">
      <h2 className="text-2xl font-bold">🗳️ {t("phase.nominateResult")}</h2>
      {outcome && <p className="text-lg font-semibold text-gold">{t(outcome.k, outcome.params)}</p>}
      <VoteBreakdown state={state} t={t} />
    </section>
  );
}
