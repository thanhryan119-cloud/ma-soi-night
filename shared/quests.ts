// Quests and gold (pure, shared by server and client).
//
// Signed-in players earn gold ("vàng") from:
//   - a daily check-in,
//   - three daily quests (picked per player per day, reset at midnight in Vietnam),
//     plus a bonus for finishing all three,
//   - one-time gold quests (milestones: first win, 50 games, a wolf win streak…).
// Gold is a score to show off; it buys nothing (every cosmetic is free).
// Every finished game counts (bots at the table included); daily caps and
// one-time rewards keep the total in check. Leaving a game counts as nothing.

import { teamOf } from "./roles";
import type { RoleId } from "./types";
import type { RecentGame, UserStats } from "./stats";

// ---------------------------------------------------------------- quests --

/** What a game can move forward. */
export type Counter = "play" | "win" | "wolfWin" | "villageWin" | "survive" | "power" | "streak" | "roles";

export interface QuestDef {
  id: string;
  counter: Counter;
  goal: number;
  reward: number;
}

export const CHECKIN_GOLD = 50;
export const DAILY_BONUS_GOLD = 150;
export const DAILY_COUNT = 3;

/** Daily quests to pick from (never two on the same counter in one day). */
export const DAILY_POOL: readonly QuestDef[] = [
  { id: "play3", counter: "play", goal: 3, reward: 100 },
  { id: "play5", counter: "play", goal: 5, reward: 180 },
  { id: "win1", counter: "win", goal: 1, reward: 120 },
  { id: "win2", counter: "win", goal: 2, reward: 200 },
  { id: "wolfWin1", counter: "wolfWin", goal: 1, reward: 180 },
  { id: "villageWin1", counter: "villageWin", goal: 1, reward: 140 },
  { id: "survive2", counter: "survive", goal: 2, reward: 130 },
  { id: "power2", counter: "power", goal: 2, reward: 120 },
];

/** One-time gold quests (milestones). `streak` is the best run of wins in a row; `roles` the different roles played. */
export const GOLD_QUESTS: readonly QuestDef[] = [
  { id: "firstGame", counter: "play", goal: 1, reward: 200 },
  { id: "firstWin", counter: "win", goal: 1, reward: 300 },
  { id: "games10", counter: "play", goal: 10, reward: 400 },
  { id: "firstWolfWin", counter: "wolfWin", goal: 1, reward: 300 },
  { id: "streak3", counter: "streak", goal: 3, reward: 600 },
  { id: "roles6", counter: "roles", goal: 6, reward: 600 },
  { id: "survive20", counter: "survive", goal: 20, reward: 800 },
  { id: "wolfWins5", counter: "wolfWin", goal: 5, reward: 800 },
  { id: "villageWins10", counter: "villageWin", goal: 10, reward: 800 },
  { id: "games50", counter: "play", goal: 50, reward: 1500 },
  { id: "wins25", counter: "win", goal: 25, reward: 1500 },
  { id: "games100", counter: "play", goal: 100, reward: 3000 },
];

type Tally = Record<Exclude<Counter, "streak" | "roles">, number>;

export interface QuestState {
  gold: number;
  /** Gold ever earned (spending doesn't lower it). */
  earned: number;
  /** Day ("2026-11-23", Vietnam time) the daily part below belongs to. */
  day: string;
  /** Today's progress. */
  today: Tally;
  /** Claimed today: daily quest ids, "checkin", "bonus". */
  claimedToday: string[];
  /** Lifetime progress for the gold quests. */
  life: Tally & { streak: number; bestStreak: number; roles: RoleId[] };
  /** Gold quests already claimed. */
  claimed: string[];
}

const emptyTally = (): Tally => ({ play: 0, win: 0, wolfWin: 0, villageWin: 0, survive: 0, power: 0 });

/**
 * A new player's quests. Existing players start with what their career stats
 * already show, so milestones they reached before quests existed can be claimed.
 */
export function newQuestState(t: number, stats?: UserStats | null): QuestState {
  const life = { ...emptyTally(), streak: 0, bestStreak: 0, roles: [] as RoleId[] };
  if (stats) {
    const roles = Object.keys(stats.byRole) as RoleId[];
    life.play = stats.games;
    life.win = stats.wins;
    life.wolfWin = stats.byTeam.wolves.wins;
    life.villageWin = stats.byTeam.village.wins;
    life.survive = stats.survived;
    life.power = roles.filter(hasPower).reduce((n, r) => n + (stats.byRole[r]?.games ?? 0), 0);
    life.streak = stats.streak;
    life.bestStreak = stats.bestStreak;
    life.roles = roles;
  }
  return { gold: 0, earned: 0, day: dayKey(t), today: emptyTally(), claimedToday: [], life, claimed: [] };
}

/** A role with something to do (not a plain Villager or Werewolf). */
const hasPower = (r: RoleId) => r !== "villager" && r !== "werewolf";

// ------------------------------------------------------------------ days --

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days turn over at midnight in Vietnam (UTC+7). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export const dayKey = (t: number) => new Date(t + VN_OFFSET_MS).toISOString().slice(0, 10);
/** When the daily quests next reset (ms). */
export const nextReset = (t: number) => (Math.floor((t + VN_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - VN_OFFSET_MS;

/** Starts a new day's quests when the day has changed (mutates). */
export function rollDay(s: QuestState, t: number): QuestState {
  const day = dayKey(t);
  if (s.day !== day) {
    s.day = day;
    s.today = emptyTally();
    s.claimedToday = [];
  }
  return s;
}

/** Stable 0..1 number from a string. */
function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** The player's three quests for a day: the same all day, different for each player and day. */
export function dailyQuests(userId: string, day: string): QuestDef[] {
  const ranked = [...DAILY_POOL].sort((a, b) => hash01(`${userId}:${day}:${a.id}`) - hash01(`${userId}:${day}:${b.id}`));
  const out: QuestDef[] = [];
  for (const q of ranked) {
    if (out.length < DAILY_COUNT && !out.some((o) => o.counter === q.counter)) out.push(q);
  }
  return out;
}

// --------------------------------------------------------------- updates --

/** Counts one game toward today's and the lifetime quests (mutates). */
export function applyGame(s: QuestState, g: RecentGame, t: number): QuestState {
  rollDay(s, t);
  if (g.outcome === "abandon") {
    s.life.streak = 0;
    return s;
  }
  const won = g.outcome === "win";
  const wolf = teamOf(g.role) === "wolves";
  const bump = (c: keyof Tally, yes = true) => {
    if (!yes) return;
    s.today[c]++;
    s.life[c]++;
  };
  bump("play");
  bump("win", won);
  bump("wolfWin", won && wolf);
  bump("villageWin", won && teamOf(g.role) === "village");
  bump("survive", g.survived);
  bump("power", hasPower(g.role));
  s.life.streak = won ? s.life.streak + 1 : g.outcome === "draw" ? s.life.streak : 0;
  s.life.bestStreak = Math.max(s.life.bestStreak, s.life.streak);
  if (!s.life.roles.includes(g.role)) s.life.roles.push(g.role);
  return s;
}

const lifeProgress = (s: QuestState, c: Counter) =>
  c === "streak" ? s.life.bestStreak : c === "roles" ? s.life.roles.length : s.life[c];
const todayProgress = (s: QuestState, c: Counter) => (c === "streak" || c === "roles" ? 0 : s.today[c]);

export interface QuestView {
  id: string;
  goal: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

export interface QuestsView {
  gold: number;
  earned: number;
  resetsAt: number;
  checkin: { reward: number; claimed: boolean };
  daily: QuestView[];
  bonus: { reward: number; ready: boolean; claimed: boolean };
  goldQuests: QuestView[];
  /** Rewards waiting to be claimed (for a badge). */
  ready: number;
}

/** Everything the quests page shows (call after rollDay). */
export function questsView(userId: string, s: QuestState, t: number): QuestsView {
  const daily = dailyQuests(userId, s.day).map((q) => ({
    id: q.id,
    goal: q.goal,
    progress: Math.min(q.goal, todayProgress(s, q.counter)),
    reward: q.reward,
    claimed: s.claimedToday.includes(q.id),
  }));
  const goldQuests = GOLD_QUESTS.map((q) => ({
    id: q.id,
    goal: q.goal,
    progress: Math.min(q.goal, lifeProgress(s, q.counter)),
    reward: q.reward,
    claimed: s.claimed.includes(q.id),
  }));
  const checkin = { reward: CHECKIN_GOLD, claimed: s.claimedToday.includes("checkin") };
  const bonus = { reward: DAILY_BONUS_GOLD, ready: daily.every((q) => q.claimed), claimed: s.claimedToday.includes("bonus") };
  const ready =
    Number(!checkin.claimed) +
    Number(bonus.ready && !bonus.claimed) +
    [...daily, ...goldQuests].filter((q) => !q.claimed && q.progress >= q.goal).length;
  return { gold: s.gold, earned: s.earned, resetsAt: nextReset(t), checkin, daily, bonus, goldQuests, ready };
}

/**
 * Claims a reward: "checkin", "bonus", one of today's quests or a gold quest.
 * Mutates the state; returns the gold won, or the reason it can't be claimed.
 */
export function claimQuest(userId: string, s: QuestState, id: string, t: number): { ok: true; gold: number } | { ok: false; error: string } {
  rollDay(s, t);
  const give = (reward: number, mark: () => void) => {
    mark();
    s.gold += reward;
    s.earned += reward;
    return { ok: true as const, gold: reward };
  };
  if (id === "checkin") {
    if (s.claimedToday.includes(id)) return { ok: false, error: "err.questClaimed" };
    return give(CHECKIN_GOLD, () => s.claimedToday.push(id));
  }
  const daily = dailyQuests(userId, s.day);
  if (id === "bonus") {
    if (s.claimedToday.includes(id)) return { ok: false, error: "err.questClaimed" };
    if (!daily.every((q) => s.claimedToday.includes(q.id))) return { ok: false, error: "err.questNotDone" };
    return give(DAILY_BONUS_GOLD, () => s.claimedToday.push(id));
  }
  const today = daily.find((q) => q.id === id);
  if (today) {
    if (s.claimedToday.includes(id)) return { ok: false, error: "err.questClaimed" };
    if (todayProgress(s, today.counter) < today.goal) return { ok: false, error: "err.questNotDone" };
    return give(today.reward, () => s.claimedToday.push(id));
  }
  const once = GOLD_QUESTS.find((q) => q.id === id);
  if (once) {
    if (s.claimed.includes(id)) return { ok: false, error: "err.questClaimed" };
    if (lifeProgress(s, once.counter) < once.goal) return { ok: false, error: "err.questNotDone" };
    return give(once.reward, () => s.claimed.push(id));
  }
  return { ok: false, error: "err.questUnknown" };
}
