import { mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { SHOP_ITEMS, type ItemId } from "../shared/cosmetics";
import {
  CHECKIN_GOLD,
  DAILY_BONUS_GOLD,
  GOLD_PRICES,
  applyGame,
  claimQuest,
  dailyQuests,
  dayKey,
  newQuestState,
  nextReset,
  questsView,
} from "../shared/quests";
import { emptyStats, applyResult, type RecentGame } from "../shared/stats";
import type { RoleId } from "../shared/types";
import { createQuests } from "../server/quests";

const T0 = Date.UTC(2026, 10, 23, 3); // 23 Nov 2026, 10:00 in Vietnam
const game = (role: RoleId, outcome: RecentGame["outcome"], survived = true): RecentGame => ({
  t: T0,
  role,
  outcome,
  winner: outcome === "win" ? (role === "werewolf" ? "wolves" : "village") : null,
  survived,
  lover: false,
  players: 8,
  humans: 1,
  counted: false,
});

describe("gold prices", () => {
  it("only some shop items sell for gold", () => {
    for (const id of Object.keys(GOLD_PRICES)) expect(SHOP_ITEMS).toContain(id);
    expect(Object.keys(GOLD_PRICES).length).toBeLessThan(SHOP_ITEMS.length);
  });
});

describe("daily quests", () => {
  it("days turn over at midnight in Vietnam", () => {
    expect(dayKey(Date.UTC(2026, 10, 23, 16, 59))).toBe("2026-11-23");
    expect(dayKey(Date.UTC(2026, 10, 23, 17, 0))).toBe("2026-11-24");
    expect(nextReset(T0)).toBe(Date.UTC(2026, 10, 23, 17));
  });

  it("three quests a day, on different counters, the same all day", () => {
    const qs = dailyQuests("u1", "2026-11-23");
    expect(qs).toHaveLength(3);
    expect(new Set(qs.map((q) => q.counter)).size).toBe(3);
    expect(dailyQuests("u1", "2026-11-23")).toEqual(qs);
    const days = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"].map((d) => dailyQuests("u1", d).map((q) => q.id).join());
    expect(new Set([qs.map((q) => q.id).join(), ...days]).size).toBeGreaterThan(1);
  });

  it("check-in once a day; quests pay when done; the bonus once all three are collected", () => {
    const s = newQuestState(T0);
    expect(claimQuest("u1", s, "checkin", T0)).toEqual({ ok: true, gold: CHECKIN_GOLD });
    expect(claimQuest("u1", s, "checkin", T0)).toEqual({ ok: false, error: "err.questClaimed" });
    const [first] = dailyQuests("u1", s.day);
    expect(claimQuest("u1", s, first.id, T0)).toEqual({ ok: false, error: "err.questNotDone" });
    expect(claimQuest("u1", s, "bonus", T0)).toEqual({ ok: false, error: "err.questNotDone" });

    // Enough games to finish any daily quest: 5 wins as a wolf, 5 as a seer.
    for (let i = 0; i < 5; i++) {
      applyGame(s, game("werewolf", "win"), T0);
      applyGame(s, game("seer", "win"), T0);
    }
    let total = CHECKIN_GOLD;
    for (const q of dailyQuests("u1", s.day)) {
      const r = claimQuest("u1", s, q.id, T0);
      expect(r).toEqual({ ok: true, gold: q.reward });
      total += q.reward;
    }
    expect(questsView("u1", s, T0).bonus).toEqual({ reward: DAILY_BONUS_GOLD, ready: true, claimed: false });
    expect(claimQuest("u1", s, "bonus", T0)).toEqual({ ok: true, gold: DAILY_BONUS_GOLD });
    expect(s.gold).toBe(total + DAILY_BONUS_GOLD);

    // Next day: fresh quests, nothing carried over.
    const tomorrow = T0 + 24 * 3600 * 1000;
    const v = questsView("u1", (claimQuest("u1", s, "checkin", tomorrow), s), tomorrow);
    expect(v.checkin.claimed).toBe(true);
    expect(v.daily.every((q) => q.progress === 0 && !q.claimed)).toBe(true);
  });

  it("leaving a game counts for nothing and breaks the streak", () => {
    const s = newQuestState(T0);
    applyGame(s, game("villager", "win"), T0);
    applyGame(s, game("villager", "win"), T0);
    applyGame(s, game("villager", "abandon", false), T0);
    expect(s.today.play).toBe(2);
    expect(s.life.streak).toBe(0);
    expect(s.life.bestStreak).toBe(2);
  });
});

describe("gold quests", () => {
  it("pay once each, when the milestone is reached", () => {
    const s = newQuestState(T0);
    expect(claimQuest("u1", s, "firstWin", T0)).toEqual({ ok: false, error: "err.questNotDone" });
    applyGame(s, game("hunter", "win"), T0);
    expect(claimQuest("u1", s, "firstGame", T0)).toEqual({ ok: true, gold: 200 });
    expect(claimQuest("u1", s, "firstWin", T0)).toEqual({ ok: true, gold: 300 });
    expect(claimQuest("u1", s, "firstWin", T0)).toEqual({ ok: false, error: "err.questClaimed" });
    expect(claimQuest("u1", s, "nope", T0)).toEqual({ ok: false, error: "err.questUnknown" });
  });

  it("existing players start from their career stats", () => {
    let stats = emptyStats();
    for (let i = 0; i < 20; i++) stats = applyResult(stats, { ...game(i % 2 ? "werewolf" : "seer", "win"), counted: true });
    const s = newQuestState(T0, stats);
    const v = questsView("u1", s, T0);
    const done = v.goldQuests.filter((q) => q.progress >= q.goal).map((q) => q.id);
    expect(done).toEqual(expect.arrayContaining(["firstGame", "firstWin", "games10", "firstWolfWin", "streak3", "wolfWins5", "villageWins10"]));
    expect(v.ready).toBe(1 + done.length); // + the check-in
  });
});

// ------------------------------------------------------------- HTTP --

type Res = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
function call(handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>, method: string, url: string, body?: unknown, token?: string) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { method, url, headers: { origin: "http://localhost:3000", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return new Promise<Res>((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(text?: string) {
        resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} });
      },
    } as unknown as ServerResponse;
    void handle(req, res);
  });
}

function setup() {
  const owned: Record<string, ItemId[]> = { u1: [] };
  let now = T0;
  const dir = mkdtempSync(join(tmpdir(), "quests-"));
  const make = () =>
    createQuests({
      dataDir: dir,
      corsOrigin: "*",
      now: () => now,
      accounts: {
        userForToken: (t) => (t === "tok1" ? { id: "u1" } : null),
        hasUser: (id) => id === "u1",
        statsOf: () => null,
        ownedFor: (id) => owned[id] ?? [],
        grantItem: (id, item) => owned[id].push(item),
        publicUser: (u) => ({ id: u.id, owned: owned[u.id] }),
      },
    });
  return { quests: make(), make, owned, setNow: (t: number) => (now = t) };
}

describe("quests server", () => {
  it("needs a signed-in player", async () => {
    const { quests } = setup();
    expect((await call(quests.handle, "GET", "/quests")).status).toBe(401);
  });

  it("records games, pays rewards, buys gold items and keeps it all on disk", async () => {
    const { quests, make, owned } = setup();
    quests.recordGame([{ userId: "ghost", game: game("seer", "win") }, ...Array.from({ length: 10 }, () => ({ userId: "u1", game: game("werewolf", "win") }))]);
    let r = await call(quests.handle, "GET", "/quests", undefined, "tok1");
    expect(r.body.quests.goldQuests.find((q: { id: string }) => q.id === "firstWolfWin").progress).toBe(1);

    for (const id of ["checkin", "firstGame", "firstWin", "firstWolfWin", "games10"]) {
      r = await call(quests.handle, "POST", "/quests/claim", { id }, "tok1");
      expect([id, r.status, r.body.error]).toEqual([id, 200, undefined]);
    }
    expect(r.body.quests.gold).toBe(CHECKIN_GOLD + 200 + 300 + 300 + 400);

    // Paid-only items and items beyond the balance are refused.
    r = await call(quests.handle, "POST", "/quests/buy", { itemId: "effect:blood" }, "tok1");
    expect(r.body.error).toBe("err.notForGold");
    r = await call(quests.handle, "POST", "/quests/buy", { itemId: "effect:glow" }, "tok1");
    expect(r.body.error).toBe("err.notEnoughGold");

    r = await call(quests.handle, "POST", "/quests/buy", { itemId: "chat:stars" }, "tok1");
    expect(r.status).toBe(200);
    expect(owned.u1).toEqual(["chat:stars"]);
    expect(r.body.quests.gold).toBe(1250 - GOLD_PRICES["chat:stars"]!);
    r = await call(quests.handle, "POST", "/quests/buy", { itemId: "chat:stars" }, "tok1");
    expect(r.body.error).toBe("err.itemOwned");

    // A restart keeps the gold and what was claimed.
    const again = make();
    r = await call(again.handle, "GET", "/quests", undefined, "tok1");
    expect(r.body.quests.gold).toBe(1250 - GOLD_PRICES["chat:stars"]!);
    expect(r.body.quests.checkin.claimed).toBe(true);
  });
});
