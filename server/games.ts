// Saved games: one JSON file per finished game that had a signed-in player,
// so it can be opened again from the match history (GET /games/<id>).
// The oldest files are dropped past MAX_GAMES.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { GAME_ID_PATTERN, type GameRecord } from "../shared/replay";
import { cors as corsFor, json } from "./http";

const MAX_GAMES = 5000;
/** Look for old files to drop every this many saves. */
const PRUNE_EVERY = 50;

export function createGames(dataDir: string, corsOrigin: string[] | "*") {
  const dir = join(dataDir, "games");
  mkdirSync(dir, { recursive: true });
  let saves = 0;

  function prune() {
    try {
      const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
      if (files.length <= MAX_GAMES) return;
      const byAge = files.map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => a.t - b.t);
      for (const { f } of byAge.slice(0, files.length - MAX_GAMES)) unlinkSync(join(dir, f));
    } catch (err) {
      console.error("[games] prune failed", err);
    }
  }

  function save(record: GameRecord) {
    if (!GAME_ID_PATTERN.test(record.id)) return;
    const file = join(dir, `${record.id}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(record));
    renameSync(`${file}.tmp`, file);
    if (++saves % PRUNE_EVERY === 0) prune();
  }

  function load(id: string): GameRecord | null {
    if (!GAME_ID_PATTERN.test(id)) return null;
    const file = join(dir, `${id}.json`);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as GameRecord;
    } catch {
      return null;
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (!path.startsWith("/games/")) return false;
    corsFor(req, res, corsOrigin);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== "GET") return json(res, 405, { ok: false }), true;
    const game = load(decodeURIComponent(path.slice("/games/".length)));
    return game ? json(res, 200, { ok: true, game }) : json(res, 404, { ok: false, error: "err.gameNotFound" }), true;
  }

  return { save, load, handle };
}
