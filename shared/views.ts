// Projects the authoritative Room into what each kind of client may see.
// Players NEVER receive other players' roles unless the rules allow it
// (wolf teammates, being dead with "dead see roles", or the game is over).

import { DEFAULT_STYLE, type PlayerStyle } from "./cosmetics";
import { NIGHT_STEP_ROLE, ROLES, ROLE_IDS, isWolf, suggestRoles, wakesIn } from "./roles";
import {
  aliveIds,
  currentStep,
  getPlayer,
  hasLostVote,
  isSilenced,
  isStepDone,
  stepActors,
  stepKey,
  validTargets,
  voteEligible,
} from "./engine";
import { SKIP } from "./rules";

/** How long a rejoin request waits for the host. */
export const REJOIN_TTL_MS = 2 * 60 * 1000;
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
  | "cursed"
  | "doused"
  | "silenced"
  | "potionHeal"
  | "potionPoison";

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  style: PlayerStyle;
  /** Index into CHAT_COLORS, unique in the room. */
  chatColor: number;
  alive: boolean;
  connected: boolean;
  locale: Locale;
  isBot: boolean;
  /** A bot is playing for them while they are away. */
  standIn: boolean;
  /** A revealed Idiot: alive, everyone knows his role, he cannot vote. */
  noVote?: boolean;
  /** Silenced by the Silencer today: no chat, no mic, no vote (public). */
  silenced?: boolean;
  /** Only present when the viewer is allowed to know it. */
  roleId?: RoleId;
  /** Host only. */
  effects?: Effect[];
  assignedRole?: RoleId;
}

export interface MyTurn {
  step: NightStepId;
  kind: "pick" | "witch" | "curse" | "arson";
  picks: number;
  /** The role may pass (pick nobody). */
  optional: boolean;
  targets: string[];
  done: boolean;
  /** Current selection(s) already accepted by the server. */
  selected: string[];
  /** Witch only */
  witch?: { victimId: string | null; heal: boolean; poison: boolean; canSelfSave: boolean; bothAllowed: boolean };
  /** Wolves only: live picks of the pack. */
  packVotes?: Record<string, string>;
  /** Cursed Wolf only: tonight's victim, and whether the curse is still unused. */
  curse?: { victimId: string | null; available: boolean; chosen: boolean };
  /** Arsonist only: the doused players still alive, and whether tonight's choice was to ignite. */
  arson?: { doused: string[]; ignited: boolean };
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
  /** On the stand and already said "I'm done". */
  defenseDone: boolean;
  hunter: { canShoot: boolean; targets: string[]; shot: string | null } | null;
  /** The night the Cursed Wolf turned me into a werewolf, if it did. */
  cursedNight: number | null;
  /** A revealed Idiot cannot vote any more. */
  lostVote: boolean;
  /** Wild Child: the model picked on the first night. */
  wildModelId: string | null;
  /** Wild Child: when the model died and the child turned werewolf. */
  wildTurned: { night: number; day: number } | null;
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
  wolfSeerTarget?: string | null;
  mediumTarget?: string | null;
  bigBadTarget?: string | null;
  silenceId?: string | null;
  whiteWolfTarget?: string | null;
  killerTarget?: string | null;
  douseId?: string | null;
  ignite?: boolean;
  doused?: string[];
  /** Wild Child id -> model. */
  wildModels?: Record<string, string>;
  curse?: boolean;
}

export interface ClientState {
  viewer: Viewer;
  serverNow: number;
  /** When the auto narrator will move on, if it is about to. */
  autoAt: number | null;
  /** Changes whenever the game moves to another step (used to report narration). */
  stepKey: string;
  /** Host only: players waiting for approval to rejoin. */
  rejoinRequests: { playerId: string; name: string }[];
  code: string;
  roomLocale: Locale;
  /** The machine narrates; `ownerId` (a player) sets the room up. */
  machineHost: boolean;
  ownerId: string | null;
  /** The room needs a password to join. */
  locked: boolean;
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
    if (ns.seerTarget === id || ns.wolfSeerTarget === id || ns.mediumTarget === id) out.push("inspected");
    if (ns.curse && ns.wolfTarget === id) out.push("cursed");
    if (ns.bigBadTarget === id || ns.whiteWolfTarget === id || ns.killerTarget === id) out.push("bitten");
  }
  if ((game.doused ?? []).includes(id) || game.nightState.douseId === id) out.push("doused");
  if (isSilenced(room, id) || (room.phase.kind === "night" && game.nightState.silenceId === id)) out.push("silenced");
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
    defenseDone: false,
    hunter: null,
    cursedNight: null,
    lostVote: false,
    wildModelId: null,
    wildTurned: null,
  };
  if (!game || !roleId) return view;
  view.cursedNight = game.cursed?.find((c) => c.playerId === me.id)?.night ?? null;
  view.lostVote = hasLostVote(room, me.id);
  view.wildModelId = game.wildModels?.[me.id] ?? null;
  const turned = game.wildTurned?.find((w) => w.playerId === me.id);
  view.wildTurned = turned ? { night: turned.night, day: turned.day } : null;

  if (isWolf(roleId) || roleId === "minion")
    view.teammates = room.players.filter((p) => p.id !== me.id && isWolf(game.roles[p.id])).map((p) => p.id);
  // The Sisters know each other (by the card they were dealt).
  else if (roleId === "sister")
    view.teammates = room.players.filter((p) => p.id !== me.id && game.originalRoles[p.id] === "sister").map((p) => p.id);
  if (game.lovers?.includes(me.id)) view.loverId = game.lovers[0] === me.id ? game.lovers[1] : game.lovers[0];
  view.seerResults = game.seerResults[me.id] ?? [];

  const step = currentStep(room);
  if (step && me.alive) {
    const isActor = wakesIn(roleId, step);
    if (isActor) {
      const def = ROLES[NIGHT_STEP_ROLE[step]].night!;
      const ns = game.nightState;
      const turn: MyTurn = {
        step,
        kind: def.kind,
        picks: def.picks ?? 1,
        optional: !!def.optional,
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
      } else if (step === "wolfSeer") {
        turn.done = !!ns.done.wolfSeer;
        turn.selected = ns.wolfSeerTarget ? [ns.wolfSeerTarget] : [];
      } else if (step === "wildChild") {
        turn.done = !!ns.done.wildChild;
        turn.selected = game.wildModels?.[me.id] ? [game.wildModels[me.id]] : [];
      } else if (step === "medium") {
        turn.done = !!ns.done.medium;
        turn.selected = ns.mediumTarget ? [ns.mediumTarget] : [];
      } else if (step === "bigBadWolf" || step === "silencer" || step === "whiteWolf" || step === "serialKiller") {
        const field = { bigBadWolf: "bigBadTarget", silencer: "silenceId", whiteWolf: "whiteWolfTarget", serialKiller: "killerTarget" } as const;
        turn.done = !!ns.done[step];
        const sel = ns[field[step]];
        turn.selected = sel ? [sel] : [];
      } else if (step === "arsonist") {
        turn.done = !!ns.done.arsonist;
        turn.selected = ns.douseId ? [ns.douseId] : [];
        turn.arson = { doused: (game.doused ?? []).filter((id) => getPlayer(room, id)?.alive), ignited: !!ns.ignite };
      } else if (step === "cursedWolf") {
        turn.done = !!ns.done.cursedWolf;
        turn.curse = { victimId: ns.wolfTarget, available: !game.curseUsed, chosen: !!ns.curse };
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
    view.defenseDone = (game.defenseDone ?? []).includes(me.id);
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
    // A Sister sees her sister as the card she was dealt (a curse later stays secret).
    if (me.roleId !== "sister") me.teammates.forEach((id) => visibleRoles.add(id));
  }
  // A revealed Idiot showed his card to the whole village.
  game?.revealedIdiots?.forEach((id) => visibleRoles.add(id));

  const players: PlayerView[] = room.players.map((p, i) => {
    const v: PlayerView = {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      avatarUrl: p.avatarUrl ?? null,
      style: p.style ?? DEFAULT_STYLE,
      chatColor: p.chatColor ?? i,
      alive: p.alive,
      connected: p.connected,
      locale: p.locale,
      isBot: p.isBot,
      standIn: !!p.standIn,
    };
    if (game && hasLostVote(room, p.id)) v.noVote = true;
    if (game && isSilenced(room, p.id)) v.silenced = true;
    if (game) {
      const revealDead = !p.alive && room.settings.revealRoleOnDeath;
      if (allRoles || visibleRoles.has(p.id) || revealDead) v.roleId = game.roles[p.id];
      else if (me?.roleId === "sister" && me.teammates.includes(p.id)) v.roleId = "sister";
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
    night.wolfSeerTarget = ns.wolfSeerTarget ?? null;
    night.mediumTarget = ns.mediumTarget ?? null;
    night.bigBadTarget = ns.bigBadTarget ?? null;
    night.silenceId = ns.silenceId ?? null;
    night.whiteWolfTarget = ns.whiteWolfTarget ?? null;
    night.killerTarget = ns.killerTarget ?? null;
    night.douseId = ns.douseId ?? null;
    night.ignite = !!ns.ignite;
    night.doused = [...(game.doused ?? [])];
    night.wildModels = { ...(game.wildModels ?? {}) };
    night.curse = !!ns.curse;
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
    stepKey: stepKey(room),
    rejoinRequests:
      viewer === "host"
        ? (room.rejoinRequests ?? [])
            .filter((r) => r.t > Date.now() - REJOIN_TTL_MS)
            .map((r) => ({ playerId: r.playerId, name: getPlayer(room, r.playerId)?.name ?? "?" }))
        : [],
    code: room.code,
    roomLocale: room.locale,
    machineHost: !!room.machineHost,
    ownerId: room.machineHost ? room.ownerId ?? null : null,
    locked: !!room.passwordHash,
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
      ...(r.idiotRevealed ? { idiotRevealed: true } : {}),
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

  // The owner of a machine-host room sets the roles up, so they get the suggestion too.
  if (!isHost && room.machineHost && meId && room.ownerId === meId) {
    state.suggested = suggestRoles(room.players.length, ROLE_IDS);
  }
  if (isHost) {
    state.pendingWin = game?.pendingWin ?? null;
    state.log = room.log;
    state.suggested = suggestRoles(room.players.length, ROLE_IDS);
    state.potions = game?.potions;
  } else if (room.phase.kind === "gameOver") {
    // The game is over, nothing is secret any more: everyone gets the full
    // story — every night action, every ballot, every nomination and verdict.
    state.log = room.log;
  } else if (viewer === "player" && game && me && !me.alive) {
    // Dead players can follow the story: everything when the host lets the
    // dead see roles, otherwise only the public events.
    state.log = room.settings.deadSeeRoles ? room.log : room.log.filter((e) => e.public);
  }
  return state;
}

export { SKIP };
