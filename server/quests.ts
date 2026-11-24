// Quests and gold for signed-in players.
//
//   GET   /quests          my gold, today's quests and the gold quests
//   POST  /quests/claim    { id } -> collect a finished quest's gold
//   POST  /quests/buy      { itemId } -> buy a shop item with gold (GOLD_PRICES only)
//
// Progress comes from finished games (recordGame, called before the career
// stats are updated). State lives in quests.json, one record per account.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { isShopItem, type ItemId } from "../shared/cosmetics";
import { GOLD_PRICES, applyGame, claimQuest, goldPrice, newQuestState, questsView, rollDay, type QuestState } from "../shared/quests";
import type { GameResult, UserStats } from "../shared/stats";
import { bearer, cors, json, readJson } from "./http";

interface QuestUser {
  id: string;
}

export interface QuestDeps<U extends QuestUser> {
  dataDir: string;
  corsOrigin: string[] | "*";
  accounts: {
    userForToken: (token: unknown) => U | null;
    hasUser: (userId: string) => boolean;
    statsOf: (userId: string) => UserStats | null;
    ownedFor: (userId: string) => string[];
    grantItem: (userId: string, item: ItemId) => unknown;
    publicUser: (u: U) => unknown;
  };
  now?: () => number;
}

export function createQuests<U extends QuestUser>(deps: QuestDeps<U>) {
  const now = deps.now ?? Date.now;
  const file = join(deps.dataDir, "quests.json");
  let store: Record<string, QuestState> = {};
  try {
    if (existsSync(file)) store = JSON.parse(readFileSync(file, "utf8")) as Record<string, QuestState>;
  } catch (err) {
    console.error("[quests] load failed", err);
  }
  const save = () => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(store));
    renameSync(tmp, file);
  };

  /** A player's quests, started from their career stats the first time. */
  const stateFor = (userId: string) => (store[userId] ??= newQuestState(now(), deps.accounts.statsOf(userId)));

  /** Counts finished (or left) games toward the quests. Call before the stats take the same games. */
  function recordGame(results: GameResult[]) {
    let changed = false;
    for (const r of results) {
      if (!deps.accounts.hasUser(r.userId)) continue;
      applyGame(stateFor(r.userId), r.game, now());
      changed = true;
    }
    if (changed) save();
  }

  const view = (userId: string) => questsView(userId, rollDay(stateFor(userId), now()), now());

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path !== "/quests" && !path.startsWith("/quests/")) return false;
    cors(req, res, deps.corsOrigin);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }
    const user = deps.accounts.userForToken(bearer(req));
    if (!user) return json(res, 401, { ok: false, error: "err.sessionExpired" }), true;

    try {
      if (path === "/quests" && req.method === "GET") return json(res, 200, { ok: true, quests: view(user.id), prices: GOLD_PRICES }), true;

      if (path === "/quests/claim" && req.method === "POST") {
        const body = await readJson<{ id?: unknown }>(req, 1024);
        const r = claimQuest(user.id, stateFor(user.id), String(body?.id ?? ""), now());
        if (!r.ok) return json(res, 400, { ok: false, error: r.error, quests: view(user.id) }), true;
        save();
        return json(res, 200, { ok: true, gold: r.gold, quests: view(user.id) }), true;
      }

      if (path === "/quests/buy" && req.method === "POST") {
        const body = await readJson<{ itemId?: unknown }>(req, 1024);
        const itemId = body?.itemId;
        if (!isShopItem(itemId)) return json(res, 400, { ok: false, error: "err.itemUnknown" }), true;
        const price = goldPrice(itemId);
        if (price === null) return json(res, 400, { ok: false, error: "err.notForGold" }), true;
        if (deps.accounts.ownedFor(user.id).includes(itemId)) return json(res, 409, { ok: false, error: "err.itemOwned" }), true;
        const s = stateFor(user.id);
        if (s.gold < price) return json(res, 400, { ok: false, error: "err.notEnoughGold", quests: view(user.id) }), true;
        s.gold -= price;
        save();
        deps.accounts.grantItem(user.id, itemId);
        console.log(`[quests] ${user.id} bought ${itemId} for ${price} gold`);
        return json(res, 200, { ok: true, quests: view(user.id), user: deps.accounts.publicUser(user) }), true;
      }

      return json(res, 404, { ok: false }), true;
    } catch (err) {
      console.error("[quests]", err);
      return json(res, 500, { ok: false, error: "err.server" }), true;
    }
  }

  return { handle, recordGame, goldOf: (userId: string) => store[userId]?.gold ?? 0 };
}
