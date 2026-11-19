// Projects the authoritative Room into what each kind of client may see.
// Players NEVER receive other players' roles unless the rules allow it
// (wolf teammates, being dead with "dead see roles", or the game is over).

import { DEFAULT_STYLE, type PlayerStyle } from "./cosmetics";
import { NIGHT_STEP_ROLE, ROLES, isWolf, suggestRoles } from "./roles";
import {
  aliveIds,
  currentStep,
  getPlayer,
  isStepDone,
  stepActors,
  validTargets,
  voteEligible,
} from "./engine";
import { SKIP } from "./rules";
import type {
  Death,
  DeathCause,
  Locale,
  LogEntry,
  NightStepId,
  NominationTally,
  PhaseKind,
  RoleId,
  Room,
  SeerResult,
  Settings,
  TimerState,
  VerdictRecord,
  Winner,
} from "./types";

export type Viewer = "host" | "player" | "screen";

export interface PublicDeath {
  playerId: string;
  cause?: DeathCause;
}

export type Effect =
  | "protected"
  | "bitten"
  | "healed"
  | "poisoned"
  | "lover"
  | "inspected"
  | "potionHeal"
  | "potionPoison";

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  style: PlayerStyle;
  alive: boolean;
  connected: boolean;
  locale: Locale;
  isBot: boolean;
  /** Only present when the viewer is allowed to know it. */
  roleId?: RoleId;
  /** Host only. */
  effects?: Effect[];
  assignedRole?: RoleId;
}

export interface MyTurn {
  step: NightStepId;
  kind: "pick" | "witch";
  picks: number;
  targets: string[];
  done: boolean;
  /** Current selection(s) already accepted by the server. */
  selected: string[];
  /** Witch only */
  witch?: { victimId: string | null; heal: boolean; poison: boolean; canSelfSave: boolean; bothAllowed: boolean };
  /** Wolves only: live picks of the pack. */
  packVotes?: Record<string, string>;
}

export interface MeView {
  id: string;
  roleId: RoleId | null;
  alive: boolean;
  teammates: string[];
  loverId: string | null;
  seerResults: SeerResult[];
  turn: MyTurn | null;
  /** Show the decoy picker so every phone looks the same at night. */
  decoy: boolean;
  myVote: string | null;
  canVote: boolean;
  onStand: boolean;
  hunter: { canShoot: boolean; targets: string[]; shot: string | null } | null;
}

export interface VoteView {
  kind: "nominate" | "verdict";
  closed: boolean;
  eligible: number;
  voted: number;
  candidates: string[] | null;
  nomineeId: string | null;
  /** Revealed after closing (or always for the host). */
  ballots?: Record<string, string>;
  /** Live voter ids (host + after close). */
  voters?: string[];
}

export interface NightView {
  step: NightStepId | null;
  stepRole: RoleId | null;
  /** Host only: per step completion */
  stepStatus?: { step: NightStepId; done: boolean; actors: string[] }[];
  wolfVotes?: Record<string, string>;
  wolfTarget?: string | null;
  protectId?: string | null;
  witchSave?: boolean;
  witchPoisonId?: string | null;
  seerTarget?: string | null;
}

export interface ClientState {
  viewer: Viewer;
  serverNow: number;
  /** When the auto narrator will move on, if it is about to. */
  autoAt: number | null;
  code: string;
  roomLocale: Locale;
  settings: Settings;
  phase: { kind: PhaseKind; night: number; day: number; steps: NightStepId[]; stepIndex: number; verdictIndex: number };
  players: PlayerView[];
  me: MeView | null;
  night: NightView;
  vote: VoteView | null;
  nominees: string[];
  nomination: NominationTally | null;
  nominationOutcome: "defense" | "revote" | "none" | null;
  verdicts: (Omit<VerdictRecord, "ballots" | "deaths"> & { ballots?: Record<string, string>; deaths: Death[] })[];
  lastDeaths: PublicDeath[];
  hunterId: string | null;
  hunterShot: string | null;
  timer: TimerState;
  winner: Winner | null;
  pendingWin?: Winner | null;
  lovers: [string, string] | null;
  log?: LogEntry[];
  suggested?: Record<RoleId, number>;
  potions?: { heal: boolean; poison: boolean };
}

function canSeeAllRoles(room: Room, viewer: Viewer, meId: string | null): boolean {
  if (room.phase.kind === "gameOver") return true;
  if (viewer === "host") return true;
  if (viewer === "player" && meId) {
    const me = getPlayer(room, meId);
    if (me && !me.alive && room.settings.deadSeeRoles && room.game) return true;
  }
  return false;
}

function hostEffects(room: Room, id: string): Effect[] {
  const game = room.game;
  if (!game) return [];
  const ns = game.nightState;
  const out: Effect[] = [];
  if (game.lovers?.includes(id)) out.push("lover");
  if (room.phase.kind === "night" || room.phase.kind === "dawn") {
    if (ns.protectId === id) out.push("protected");
    if (ns.wolfTarget === id || (!ns.wolfFinalized && Object.values(ns.wolfVotes).includes(id))) out.push("bitten");
    if (ns.witchSave && ns.wolfTarget === id) out.push("healed");
    if (ns.witchPoisonId === id) out.push("poisoned");
    if (ns.seerTarget === id) out.push("inspected");
  }
  if (game.roles[id] === "witch") {
    if (game.potions.heal) out.push("potionHeal");
    if (game.potions.poison) out.push("potionPoison");
  }
  return out;
}

function buildMe(room: Room, meId: string): MeView | null {
  const me = getPlayer(room, meId);
  if (!me) return null;
  const game = room.game;
  const roleId = game?.roles[me.id] ?? null;
  const view: MeView = {
    id: me.id,
    roleId,
    alive: me.alive,
    teammates: [],
    loverId: null,
    seerResults: [],
    turn: null,
    decoy: false,
    myVote: null,
    canVote: false,
    onStand: false,
    hunter: null,
  };
  if (!game || !roleId) return view;

  if (isWolf(roleId))
    view.teammates = room.players.filter((p) => p.id !== me.id && isWolf(game.roles[p.id])).map((p) => p.id);
  if (game.lovers?.includes(me.id)) view.loverId = game.lovers[0] === me.id ? game.lovers[1] : game.lovers[0];
  view.seerResults = game.seerResults[me.id] ?? [];

  const step = currentStep(room);
  if (step && me.alive) {
    const isActor = NIGHT_STEP_ROLE[step] === roleId;
    if (isActor) {
      const def = ROLES[roleId].night!;
      const ns = game.nightState;
      const turn: MyTurn = {
        step,
        kind: def.kind,
        picks: def.picks ?? 1,
        targets: validTargets(room, me, step),
        done: false,
        selected: [],
      };
      if (step === "cupid") {
        turn.done = !!ns.done.cupid;
        turn.selected = ns.cupidPair ?? [];
      } else if (step === "bodyguard") {
        turn.done = !!ns.done.bodyguard;
        turn.selected = ns.protectId ? [ns.protectId] : [];
      } else if (step === "werewolf") {
        turn.done = isStepDone(room, step);
        turn.selected = ns.wolfVotes[me.id] ? [ns.wolfVotes[me.id]] : [];
        turn.packVotes = { ...ns.wolfVotes };
      } else if (step === "seer") {
        turn.done = !!ns.done.seer;
        turn.selected = ns.seerTarget ? [ns.seerTarget] : [];
      } else if (step === "witch") {
        turn.done = ns.witchDone;
        turn.selected = ns.witchPoisonId ? [ns.witchPoisonId] : [];
        turn.witch = {
          victimId: ns.wolfTarget,
          heal: game.potions.heal,
          poison: game.potions.poison,
          canSelfSave: room.settings.witchSelfSave,
          bothAllowed: room.settings.witchBothSameNight,
        };
      }
      view.turn = turn;
    } else if (room.settings.decoyActions) {
      view.decoy = true;
    }
  }

  const vote = game.vote;
  if (vote) {
    view.myVote = vote.ballots[me.id] ?? null;
    view.onStand = game.nominees.includes(me.id) && vote.kind === "verdict";
    view.canVote = !vote.closed && voteEligible(room).includes(me.id) && view.myVote === null;
  } else if (room.phase.kind === "defense" || room.phase.kind === "verdictResult") {
    view.onStand = game.nominees.includes(me.id);
  }

  if (room.phase.kind === "hunter" && game.pendingHunters[0] === me.id) {
    const shot = me.id in game.hunterShots ? game.hunterShots[me.id] : null;
    view.hunter = {
      canShoot: shot === null,
      targets: aliveIds(room).filter((id) => id !== me.id),
      shot,
    };
  }
  return view;
}

export function buildView(room: Room, viewer: Viewer, meId: string | null = null): ClientState {
  const game = room.game;
  const isHost = viewer === "host";
  const allRoles = canSeeAllRoles(room, viewer, meId);
  const me = viewer === "player" && meId ? buildMe(room, meId) : null;
  const visibleRoles = new Set<string>();
  if (me?.roleId) {
    visibleRoles.add(me.id);
    me.teammates.forEach((id) => visibleRoles.add(id));
  }

  const players: PlayerView[] = room.players.map((p) => {
    const v: PlayerView = {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      avatarUrl: p.avatarUrl ?? null,
      style: p.style ?? DEFAULT_STYLE,
      alive: p.alive,
      connected: p.connected,
      locale: p.locale,
      isBot: p.isBot,
    };
    if (game) {
      const revealDead = !p.alive && room.settings.revealRoleOnDeath;
      if (allRoles || visibleRoles.has(p.id) || revealDead) v.roleId = game.roles[p.id];
    }
    if (isHost) {
      v.effects = hostEffects(room, p.id);
      v.assignedRole = room.assignment[p.id];
    }
    return v;
  });

  const step = currentStep(room);
  const night: NightView = { step, stepRole: step ? NIGHT_STEP_ROLE[step] : null };
  if (isHost && game) {
    const ns = game.nightState;
    night.stepStatus = room.phase.steps.map((s) => ({
      step: s,
      done: isStepDone(room, s),
      actors: stepActors(room, s).map((p) => p.id),
    }));
    night.wolfVotes = ns.wolfVotes;
    night.wolfTarget = ns.wolfTarget;
    night.protectId = ns.protectId;
    night.witchSave = ns.witchSave;
    night.witchPoisonId = ns.witchPoisonId;
    night.seerTarget = ns.seerTarget;
  }

  let vote: VoteView | null = null;
  if (game?.vote) {
    const v = game.vote;
    const showBallots = isHost || (v.closed && !room.settings.verdict.anonymous);
    vote = {
      kind: v.kind,
      closed: v.closed,
      eligible: voteEligible(room).length,
      voted: Object.keys(v.ballots).length,
      candidates: v.candidates,
      nomineeId: v.nomineeId,
    };
    if (showBallots) vote.ballots = { ...v.ballots };
    if (isHost || v.closed) vote.voters = Object.keys(v.ballots);
  }

  const showBallots = isHost || !room.settings.verdict.anonymous;
  const hunterId = room.phase.kind === "hunter" ? game?.pendingHunters[0] ?? null : null;

  // The dawn announcement never reveals the cause publicly (it would leak roles),
  // except a Hunter's shot, which happens in front of everyone.
  const lastDeaths: PublicDeath[] = (game?.lastDeaths ?? []).map((d) =>
    isHost || room.phase.kind === "gameOver" || d.cause === "hunter" ? d : { playerId: d.playerId },
  );

  const state: ClientState = {
    viewer,
    serverNow: Date.now(),
    autoAt: room.autoAt ?? null,
    code: room.code,
    roomLocale: room.locale,
    settings: room.settings,
    phase: {
      kind: room.phase.kind,
      night: room.phase.night,
      day: room.phase.day,
      steps: room.phase.steps,
      stepIndex: room.phase.stepIndex,
      verdictIndex: room.phase.verdictIndex,
    },
    players,
    me,
    night,
    vote,
    nominees: game?.nominees ?? [],
    nomination: game?.nomination
      ? { ...game.nomination, counts: { ...game.nomination.counts } }
      : null,
    nominationOutcome: game?.nominationOutcome ?? null,
    verdicts: (game?.verdicts ?? []).map((r) => ({
      nomineeId: r.nomineeId,
      execute: r.execute,
      spare: r.spare,
      abstain: r.abstain,
      eligible: r.eligible,
      executed: r.executed,
      deaths: r.deaths.map((d) => ({ playerId: d.playerId, cause: isHost ? d.cause : d.cause === "execution" ? "execution" : "heartbreak" })),
      ...(showBallots ? { ballots: r.ballots } : {}),
    })),
    lastDeaths,
    hunterId,
    hunterShot: hunterId && game && hunterId in game.hunterShots ? game.hunterShots[hunterId] : null,
    timer: room.timer,
    winner: game?.winner ?? null,
    lovers: isHost || room.phase.kind === "gameOver" ? game?.lovers ?? null : null,
  };

  if (isHost) {
    state.pendingWin = game?.pendingWin ?? null;
    state.log = room.log;
    state.suggested = suggestRoles(room.players.length);
    state.potions = game?.potions;
  } else if (room.phase.kind === "gameOver") {
    state.log = room.log.filter((e) => e.public);
  }
  return state;
}

export { SKIP };
