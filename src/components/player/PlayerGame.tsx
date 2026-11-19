"use client";

// Player screen, designed to fit a phone in ONE frame: the page itself never
// scrolls. Grids shrink to fit any player count; long content (vote details,
// end-of-game timeline) lives in a panel that scrolls on its own.

import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES } from "@shared/roles";
import type { ClientState, MeView, PlayerView } from "@shared/views";
import { Avatar, ConnectionDot, RoleBadge, StyledName, TimerDisplay, useErrorToast } from "@/components/ui";
import { RolesGrid, Timeline, WinnerBanner } from "@/components/GameOver";
import { VoteBreakdown, nominationOutcomeLine } from "@/components/VoteBreakdown";
import { SocialPanel } from "@/components/SocialPanel";
import { CardBack, RoleArt, SceneArt } from "@/components/art/Woodcut";
import { useT } from "@/lib/i18n";
import { emitAck } from "@/lib/socket";

type Props = { state: ClientState; offset: number; connected: boolean };
type Ctx = { state: ClientState; me: MeView; players: Map<string, PlayerView> };

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

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export function PlayerGame({ state, offset, connected }: Props) {
  const t = useT();
  const me = state.me!;
  const players = byId(state);
  const self = players.get(me.id)!;
  const kind = state.phase.kind;
  const [sheet, setSheet] = useState<null | "role" | "roles" | "timeline">(null);

  // Vibrate when it becomes my turn to do something.
  const myTurn = !!(me.turn && !me.turn.done) || me.canVote || !!me.hunter?.canShoot;
  const prevTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !prevTurn.current) navigator.vibrate?.([120, 60, 120]);
    prevTurn.current = myTurn;
  }, [myTurn]);

  const canSeeRoles = !me.alive && kind !== "gameOver" && state.players.some((p) => p.id !== me.id && p.roleId);
  const showRoleButton = !!me.roleId && kind !== "gameOver" && kind !== "roleReveal";

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden transition-colors duration-700`}>
      <header className="flex shrink-0 items-center gap-2.5 border-b border-white/5 px-3 py-2 pr-28">
        <Avatar p={self} size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-bold">
            <StyledName p={self} />
          </div>
          <div className="truncate text-xs text-white/50">{phaseLabel(t, state)}</div>
        </div>
        {!connected && <ConnectionDot connected={false} />}
      </header>

      {!me.alive && kind !== "gameOver" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-blood/30 bg-blood/10 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">💀 {t("player.spectator")}</span>
          {canSeeRoles && (
            <button className="btn-ghost btn-sm shrink-0" onClick={() => setSheet("roles")}>
              {t("player.allRoles")}
            </button>
          )}
        </div>
      )}

      <main className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-3 py-3">
        <PhaseBody state={state} me={me} offset={offset} players={players} onTimeline={() => setSheet("timeline")} />
      </main>

      {showRoleButton && (
        <footer className="mx-auto w-full max-w-md shrink-0 border-t border-white/10 px-3 py-2">
          <button className="btn-ghost w-full" onClick={() => setSheet("role")}>
            🂠 {t("player.showRole")}
          </button>
        </footer>
      )}

      {sheet === "role" && (
        <Sheet onClose={() => setSheet(null)}>
          <RoleSheet state={state} me={me} players={players} />
        </Sheet>
      )}
      {sheet === "roles" && (
        <Sheet title={t("player.allRoles")} onClose={() => setSheet(null)}>
          <RolesGrid state={state} compact />
        </Sheet>
      )}
      {sheet === "timeline" && state.log && (
        <Sheet title={t("screen.timeline")} onClose={() => setSheet(null)}>
          <Timeline log={state.log} t={t} />
        </Sheet>
      )}
    </div>
  );
}

/** Full-screen overlay; only its body scrolls. */
function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="rise absolute inset-0 z-50 flex flex-col bg-night-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <h3 className="min-w-0 flex-1 truncate font-bold">{title}</h3>
        <button className="btn-ghost btn-sm" onClick={onClose}>
          ✕ {t("common.close")}
        </button>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">{children}</div>
    </div>
  );
}

/** A full-height column that fills the free space. */
const Fill = ({ children, center = false }: { children: React.ReactNode; center?: boolean }) => (
  <section className={`flex min-h-0 flex-1 flex-col gap-3 ${center ? "items-center justify-center text-center" : ""}`}>
    {children}
  </section>
);

function PhaseBody({
  state,
  me,
  offset,
  players,
  onTimeline,
}: Ctx & { offset: number; onTimeline: () => void }) {
  const t = useT();
  const ctx = { state, me, players };
  switch (state.phase.kind) {
    case "lobby":
      return <Lobby state={state} />;
    case "roleReveal":
      return (
        <Fill>
          <h2 className="shrink-0 text-center font-display text-2xl font-bold text-moon">{t("player.yourRole")}</h2>
          <HoldCard {...ctx} />
        </Fill>
      );
    case "night":
      return <Night {...ctx} />;
    case "dawn":
      return <Dawn {...ctx} />;
    case "hunter":
      return <Hunter {...ctx} />;
    case "discussion":
      return (
        <Fill>
          <div className="flex shrink-0 items-center gap-3">
            <h2 className="shrink-0 text-lg font-bold">🗣️ {t("player.discussion")}</h2>
            <div className="min-w-0 flex-1">
              <TimerDisplay timer={state.timer} offset={offset} className="text-3xl" />
            </div>
          </div>
          <SocialPanel state={state} viewer={me.id} className="flex-1" />
        </Fill>
      );
    case "nominate":
      return <Nominate {...ctx} />;
    case "nominateResult":
      return <NominateResult state={state} />;
    case "defense":
      return (
        <Fill center>
          <h2 className="text-2xl font-bold">⚖️ {t("player.defenseTitle")}</h2>
          {me.onStand && <p className="rounded-lg bg-gold/20 px-4 py-2 font-bold text-gold">{t("player.onStandYou")}</p>}
          <Nominees state={state} players={players} />
          <div className="w-full">
            <TimerDisplay timer={state.timer} offset={offset} className="text-5xl" />
          </div>
        </Fill>
      );
    case "verdict":
      return <Verdict {...ctx} />;
    case "verdictResult":
      return <VerdictResult state={state} players={players} />;
    case "gameOver":
      return (
        <Fill>
          <div className="shrink-0">
            <WinnerBanner state={state} t={t} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 p-2">
            <RolesGrid state={state} compact />
          </div>
          <div className="flex shrink-0 gap-2">
            {state.log && (
              <button className="btn-ghost flex-1" onClick={onTimeline}>
                📜 {t("screen.timeline")}
              </button>
            )}
          </div>
          <p className="shrink-0 text-center text-xs text-white/50">{t("player.wait")}</p>
        </Fill>
      );
  }
}

// ---------------------------------------------------------------------------
// Lobby & role card
// ---------------------------------------------------------------------------

function Lobby({ state }: { state: ClientState }) {
  const t = useT();
  return (
    <Fill>
      <div className="flex shrink-0 items-center gap-3">
        <SceneArt scene="night" className="h-12 w-auto shrink-0" />
        <div className="min-w-0">
          <h2 className="truncate font-bold">{t("player.waitingHost")}</h2>
          <p className="text-xs text-white/60">{t("player.inLobby", { count: state.players.length })}</p>
        </div>
      </div>
      <AliveStrip state={state} />
      {state.me && <SocialPanel state={state} viewer={state.me.id} className="flex-1" />}
    </Fill>
  );
}

function AliveStrip({ state }: { state: ClientState }) {
  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1">
      {state.players.map((p) => (
        <span key={p.id} title={p.name}>
          <Avatar p={p} size="sm" />
        </span>
      ))}
    </div>
  );
}

/** Hold to reveal, release to hide — protects against peeking. Shrinks to the free height. */
function HoldCard({ me, players }: Ctx) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const role = me.roleId ? ROLES[me.roleId] : null;
  const show = () => {
    setOpen(true);
    navigator.vibrate?.(20);
  };
  const hide = () => setOpen(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-2">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <button
          type="button"
          className="no-select relative h-full max-h-[480px] max-w-full touch-none rounded-xl"
          style={{ perspective: "1000px", aspectRatio: "3 / 4" }}
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
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ backfaceVisibility: "hidden" }}
            >
              <CardBack className="absolute inset-0 h-full w-full" />
              <span className="relative mt-[78%] rounded bg-night-950/80 px-3 py-1 text-sm font-bold text-gold">{t("player.holdToReveal")}</span>
            </div>
            <div
              className="absolute inset-0 flex flex-col items-center justify-start gap-1.5 overflow-hidden rounded-xl border-2 border-gold/70 bg-night-950 p-3 text-center"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              {role && open && (
                <>
                  <RoleArt role={role.id} className="h-[48%] w-auto shrink-0" />
                  <div className="font-display text-2xl font-bold text-gold">
                    {t(`roles.${role.id}.name`)}
                  </div>
                  <div className="text-[11px] font-semibold tracking-wider text-white/60 uppercase">{t(`teams.${role.team}`)}</div>
                  <p className="text-xs leading-snug text-white/85">{t(`roles.${role.id}.desc`)}</p>
                  {role.team === "wolves" && (
                    <div className="text-xs">
                      <div className="font-bold text-blood-light">{t("player.teammates")}</div>
                      {me.teammates.length
                        ? me.teammates.map((id) => players.get(id)?.name).join(", ")
                        : t("player.noTeammates")}
                    </div>
                  )}
                  {me.loverId && (
                    <div className="text-xs text-pink-300">{t("player.yourLover", { name: players.get(me.loverId)?.name ?? "?" })}</div>
                  )}
                </>
              )}
            </div>
          </div>
        </button>
      </div>
      <p className="shrink-0 text-sm text-white/50">{open ? t("player.releaseToHide") : t("player.holdToReveal")}</p>
    </div>
  );
}

function RoleSheet(ctx: Ctx) {
  const t = useT();
  const { me, players } = ctx;
  return (
    <>
      <div className="flex h-[min(60dvh,480px)] shrink-0 flex-col">
        <HoldCard {...ctx} />
      </div>
      {me.seerResults.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-bold">🔮 {t("player.seerHistory")}</h4>
          <ul className="space-y-1 text-sm">
            {me.seerResults.map((r, i) => (
              <li key={i} className={r.isWolf ? "text-blood-light" : "text-emerald-300"}>
                {t("phase.night", { n: r.night })}:{" "}
                {t(r.isWolf ? "player.seerIsWolf" : "player.seerNotWolf", { name: players.get(r.targetId)?.name ?? "?" })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Target grid — always fits the free height, whatever the player count.
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
  const n = ids.length;
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(n / cols));
  const dense = n > 9;
  return (
    <div
      className="grid min-h-0 flex-1 content-start gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, ${dense ? 84 : 104}px))`,
      }}
    >
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
            className={`relative flex min-h-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border px-1 text-center transition active:scale-95 ${
              sel ? "border-gold bg-gold/15" : "border-white/10 bg-white/5 hover:bg-white/10"
            } disabled:opacity-60`}
            aria-pressed={sel}
          >
            <Avatar p={p} size={dense ? "sm" : "md"} />
            <span className={`line-clamp-1 w-full leading-tight font-semibold ${dense ? "text-[11px]" : "text-xs"}`}>
              <StyledName p={p} />
            </span>
            {marks?.[id] && <span className="absolute top-0.5 right-0.5 text-[10px]">{marks[id]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Bottom action row (one or two buttons side by side). */
const Actions = ({ children }: { children: React.ReactNode }) => <div className="flex shrink-0 gap-2">{children}</div>;

// ---------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------

function Night(ctx: Ctx) {
  const t = useT();
  const { state, me } = ctx;
  const stepKey = `${state.phase.night}-${state.phase.stepIndex}`;
  if (me.turn) return <NightTurn key={stepKey} {...ctx} />;
  if (me.decoy) return <Decoy key={stepKey} {...ctx} />;
  return (
    <Fill center>
      <SceneArt scene="night" className="w-full max-w-xs" />
      <h2 className="font-display text-3xl font-bold text-moon">{t("player.closeEyes")}</h2>
      <p className="text-white/50">{t("player.nightFalls")}</p>
    </Fill>
  );
}

function NightTitle({ night }: { night: number }) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center justify-center gap-2">
      <div className="moon h-6 w-6 rounded-full opacity-80" aria-hidden />
      <h2 className="font-display text-xl font-bold text-moon">{t("phase.night", { n: night })}</h2>
    </div>
  );
}

function Decoy({ state, me, players }: Ctx) {
  const t = useT();
  const [sel, setSel] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const ids = state.players.filter((p) => p.alive && p.id !== me.id).map((p) => p.id);
  return (
    <Fill>
      <NightTitle night={state.phase.night} />
      <p className="shrink-0 text-center text-sm font-semibold">{done ? t("player.decoyDone") : t("player.decoyTitle")}</p>
      <TargetGrid players={players} ids={ids} selected={sel} onPick={(id) => setSel([id])} disabled={done} />
      <Actions>
        <button className="btn-primary flex-1 py-3" disabled={!sel.length || done} onClick={() => setDone(true)}>
          {t("player.confirm")}
        </button>
      </Actions>
      <p className="shrink-0 text-center text-[11px] text-white/40">{t("player.decoyHint")}</p>
    </Fill>
  );
}

function TurnBanner({ roleId, extra }: { roleId: NonNullable<MeView["roleId"]>; extra?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="pulse-ring shrink-0 rounded-lg border border-blood/50 bg-blood/10 px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-2 text-xs font-bold text-blood-light">
        {t("player.yourTurn")} <RoleBadge roleId={roleId} />
      </div>
      <p className="mt-1 text-base font-semibold leading-snug">{t(`roles.${roleId}.action`)}</p>
      {extra}
    </div>
  );
}

function NightTurn({ state, me, players }: Ctx) {
  const t = useT();
  const act = usePlayerAction();
  const turn = me.turn!;
  const [sel, setSel] = useState<string[]>(turn.selected);
  const [poison, setPoison] = useState<string | null>(null);
  const [save, setSave] = useState(false);
  const roleId = me.roleId!;

  if (turn.done) {
    const last = turn.step === "seer" ? me.seerResults[me.seerResults.length - 1] : null;
    return (
      <Fill center>
        {last && last.night === state.phase.night && (
          <div
            className={`rise rounded-lg border p-5 text-xl font-bold ${
              last.isWolf ? "border-blood bg-blood/20 text-blood-light" : "border-emerald-500 bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {t(last.isWolf ? "player.seerIsWolf" : "player.seerNotWolf", { name: players.get(last.targetId)?.name ?? "?" })}
          </div>
        )}
        {turn.step === "werewolf" && <div className="text-lg font-bold text-emerald-300">✓ {t("player.packAgree")}</div>}
        <SceneArt scene="night" className="w-full max-w-[220px]" />
        <p className="text-lg">{t("player.done")}</p>
      </Fill>
    );
  }

  if (turn.kind === "witch" && turn.witch) {
    const w = turn.witch;
    const victim = w.victimId ? players.get(w.victimId) : null;
    const canSave = w.heal && !!victim && (w.canSelfSave || w.victimId !== me.id);
    return (
      <Fill>
        <TurnBanner roleId={roleId} />
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 p-2">
          {victim ? (
            <>
              <Avatar p={victim} size="md" />
              <p className="min-w-0 flex-1 text-sm leading-snug">{t("player.witchVictim", { name: victim.name })}</p>
              <button
                className={`btn btn-sm shrink-0 ${save ? "bg-emerald-500 text-night-950" : "btn-ghost"}`}
                disabled={!canSave}
                onClick={() => {
                  setSave(!save);
                  if (!save && !w.bothAllowed) setPoison(null);
                }}
              >
                💚 {w.heal ? `${save ? "✓ " : ""}${t("player.heal")}` : t("player.potionUsed")}
              </button>
            </>
          ) : (
            <p className="text-sm">{t("player.witchNoVictim")}</p>
          )}
        </div>
        <p className="shrink-0 text-sm font-semibold">
          ☠️ {t("player.witchPoison")} {!w.poison && <span className="font-normal text-white/50">{t("player.potionUsed")}</span>}
        </p>
        {w.poison ? (
          <TargetGrid
            players={players}
            ids={turn.targets}
            selected={poison ? [poison] : []}
            onPick={(id) => {
              setPoison(poison === id ? null : id);
              if (!w.bothAllowed) setSave(false);
            }}
          />
        ) : (
          <div className="flex-1" />
        )}
        <Actions>
          {w.poison && (
            <button className="btn-ghost flex-1" onClick={() => setPoison(null)}>
              {t("player.witchNoPoison")}
            </button>
          )}
          <button className="btn-primary flex-1 py-3" onClick={() => act({ type: "night", save, poisonId: poison })}>
            {t("player.confirm")}
          </button>
        </Actions>
      </Fill>
    );
  }

  if (turn.step === "werewolf") {
    const pack = turn.packVotes ?? {};
    const byTarget: Record<string, string[]> = {};
    for (const [wolfId, target] of Object.entries(pack)) (byTarget[target] ??= []).push(wolfId);
    const marks: Record<string, React.ReactNode> = {};
    for (const [target, wolves] of Object.entries(byTarget))
      marks[target] = <span className="rounded bg-blood/90 px-1 py-0.5">🐺{wolves.length}</span>;
    const agreed = Object.keys(pack).length > 0 && new Set(Object.values(pack)).size === 1;
    return (
      <Fill>
        <TurnBanner
          roleId={roleId}
          extra={
            <p className="mt-0.5 text-[11px] text-white/70">
              {Object.keys(pack).length > 0 && !agreed
                ? t("player.packDisagree")
                : state.settings.wolvesMustBite !== false
                  ? t("player.mustBite")
                  : t("player.packPicks")}
            </p>
          }
        />
        <TargetGrid players={players} ids={turn.targets} selected={turn.selected} marks={marks} onPick={(id) => act({ type: "night", targets: [id] })} />
      </Fill>
    );
  }

  const max = turn.picks;
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : max === 1 ? [id] : [...s, id].slice(-max)));
  return (
    <Fill>
      <TurnBanner roleId={roleId} extra={max > 1 ? <p className="text-[11px] text-white/70">{t("player.pickTwo")}</p> : null} />
      <TargetGrid players={players} ids={turn.targets} selected={sel} onPick={toggle} />
      <Actions>
        <button className="btn-primary flex-1 py-3" disabled={sel.length !== max} onClick={() => act({ type: "night", targets: sel })}>
          {t("player.confirm")}
        </button>
      </Actions>
    </Fill>
  );
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

function Dawn({ state, me, players }: Ctx) {
  const t = useT();
  const deaths = state.lastDeaths;
  const iDied = deaths.some((d) => d.playerId === me.id);
  return (
    <Fill center>
      <SceneArt scene="dawn" className="w-full max-w-[260px]" />
      <h2 className="font-display text-3xl font-bold text-moon">{t("player.dawn")}</h2>
      {iDied && <p className="rounded-lg bg-blood/25 px-4 py-2 text-xl font-bold text-blood-light">{t("player.youDied")}</p>}
      {deaths.length ? (
        <>
          <p className="text-white/70">{t("player.diedLastNight")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {deaths.map((d) => {
              const p = players.get(d.playerId);
              return p ? (
                <div key={d.playerId} className="flex flex-col items-center gap-1">
                  <Avatar p={p} size="lg" />
                  <span className="font-semibold">
                    <StyledName p={p} />
                  </span>
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
    </Fill>
  );
}

function Hunter({ state, me, players }: Ctx) {
  const t = useT();
  const act = usePlayerAction();
  const [sel, setSel] = useState<string | null>(null);
  if (me.hunter?.canShoot)
    return (
      <Fill>
        <div className="pulse-ring shrink-0 rounded-lg border border-blood/50 bg-blood/10 p-3 text-center">
          <p className="font-bold">🏹 {t("player.hunterYou")}</p>
        </div>
        <TargetGrid players={players} ids={me.hunter.targets} selected={sel ? [sel] : []} onPick={setSel} />
        <Actions>
          <button className="btn-ghost flex-1" onClick={() => act({ type: "hunterShot", targetId: null })}>
            {t("player.hunterNoShot")}
          </button>
          <button className="btn-primary flex-1 py-3" disabled={!sel} onClick={() => act({ type: "hunterShot", targetId: sel })}>
            {t("player.confirm")}
          </button>
        </Actions>
      </Fill>
    );
  const shotName = state.hunterShot ? players.get(state.hunterShot)?.name : null;
  return (
    <Fill center>
      <SceneArt scene="hunter" className="w-full max-w-xs" />
      <p className="text-xl font-bold">
        {state.hunterShot === null
          ? t("player.hunterWaiting")
          : shotName
            ? t("script.hunterShot", { name: shotName })
            : t("script.hunterMissed")}
      </p>
    </Fill>
  );
}

function VoteProgress({ state }: { state: ClientState }) {
  const t = useT();
  const v = state.vote;
  if (!v) return null;
  const pct = v.eligible ? (v.voted / v.eligible) * 100 : 0;
  return (
    <div className="w-full shrink-0">
      <div className="mb-1 text-center text-xs text-white/60">{t("player.voteProgress", { voted: v.voted, eligible: v.eligible })}</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gold transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Nominate({ state, me, players }: Ctx) {
  const t = useT();
  const act = usePlayerAction();
  const [sel, setSel] = useState<string | null>(null);
  const v = state.vote;
  const ids = useMemo(
    () => (v?.candidates ?? state.players.filter((p) => p.alive).map((p) => p.id)).filter((id) => id !== me.id),
    [v?.candidates, state.players, me.id],
  );
  const title = v?.candidates ? t("player.revoteTitle") : t("player.nominateTitle");
  if (me.myVote || !me.canVote)
    return (
      <Fill center>
        <div className="text-5xl">🗳️</div>
        <p className="text-xl font-bold">
          {!me.myVote
            ? title
            : me.myVote === "skip"
              ? t("player.votedSkip")
              : t("player.votedFor", { name: players.get(me.myVote)?.name ?? "?" })}
        </p>
        <VoteProgress state={state} />
      </Fill>
    );
  return (
    <Fill>
      <div className="shrink-0 text-center">
        <h2 className="text-xl font-bold">{title}</h2>
        {state.settings.mandatoryVote && <p className="text-xs text-blood-light">{t("player.mustVote")}</p>}
      </div>
      <TargetGrid players={players} ids={ids} selected={sel ? [sel] : []} onPick={setSel} />
      <Actions>
        {!state.settings.mandatoryVote && (
          <button className="btn-ghost flex-1" onClick={() => act({ type: "vote", choice: "skip" })}>
            {t("player.skip")}
          </button>
        )}
        <button className="btn-primary flex-1 py-3" disabled={!sel} onClick={() => sel && act({ type: "vote", choice: sel })}>
          {t("player.confirm")}
        </button>
      </Actions>
      <VoteProgress state={state} />
    </Fill>
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
            <span className="font-bold">
              <StyledName p={p} />
            </span>
            {state.nomination && <span className="text-xs text-white/50">{state.nomination.counts[id] ?? 0} 🗳️</span>}
          </div>
        ) : null;
      })}
    </div>
  );
}

function Verdict({ state, me, players }: Ctx) {
  const t = useT();
  const act = usePlayerAction();
  const nominee = state.vote?.nomineeId ? players.get(state.vote.nomineeId) : null;
  return (
    <Fill>
      {nominee && (
        <div className="flex shrink-0 flex-col items-center gap-2 text-center">
          <Avatar p={nominee} size="xl" />
          <h2 className="text-xl font-bold">{t("player.verdictTitle", { name: nominee.name })}</h2>
        </div>
      )}
      {me.onStand ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="rounded-lg bg-gold/20 px-4 py-3 text-center font-bold text-gold">{t("player.onStandNoVote")}</p>
        </div>
      ) : me.myVote ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xl font-bold">{me.myVote === "execute" ? t("player.votedExecute") : t("player.votedSpare")}</p>
        </div>
      ) : me.canVote ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3" style={{ maxHeight: 220 }}>
          <button className="btn h-full flex-col bg-blood text-2xl font-black text-white" onClick={() => act({ type: "vote", choice: "execute" })}>
            <span className="text-4xl">🪢</span>
            {t("player.execute")}
          </button>
          <button className="btn h-full flex-col bg-emerald-500 text-2xl font-black text-night-950" onClick={() => act({ type: "vote", choice: "spare" })}>
            <span className="text-4xl">🕊️</span>
            {t("player.spare")}
          </button>
        </div>
      ) : (
        <div className="flex-1" />
      )}
      <VoteProgress state={state} />
    </Fill>
  );
}

function VerdictResult({ state, players }: { state: ClientState; players: Map<string, PlayerView> }) {
  const t = useT();
  const r = state.verdicts[state.verdicts.length - 1];
  if (!r) return null;
  const p = players.get(r.nomineeId);
  return (
    <Fill>
      <div className="flex shrink-0 items-center gap-3">
        {p && <Avatar p={p} size="lg" />}
        <div className="min-w-0 flex-1">
          <h2 className={`font-display text-2xl font-black ${r.executed ? "text-blood-light" : "text-emerald-300"}`}>
            {r.executed ? t("screen.executed") : t("screen.spared")}
          </h2>
          <p className="text-sm leading-snug">
            {t(r.executed ? "script.verdictExecuted" : "script.verdictSpared", { name: p?.name ?? "?", execute: r.execute, spare: r.spare })}
          </p>
          {r.deaths
            .filter((d) => d.playerId !== r.nomineeId)
            .map((d) => (
              <p key={d.playerId} className="text-sm text-pink-300">
                💔 {players.get(d.playerId)?.name}
              </p>
            ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <VoteBreakdown state={state} t={t} />
      </div>
    </Fill>
  );
}

function NominateResult({ state }: { state: ClientState }) {
  const t = useT();
  const outcome = nominationOutcomeLine(state);
  return (
    <Fill>
      <div className="shrink-0 text-center">
        <h2 className="text-xl font-bold">🗳️ {t("phase.nominateResult")}</h2>
        {outcome && <p className="text-sm font-semibold text-gold">{t(outcome.k, outcome.params)}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <VoteBreakdown state={state} t={t} />
      </div>
    </Fill>
  );
}
