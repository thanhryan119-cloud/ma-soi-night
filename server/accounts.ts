// Optional player accounts: "Sign in with Google" + uploaded avatar photos.
// Users and sessions are stored in a JSON file next to the rooms snapshot,
// avatar images in an `avatars/` folder on the same (persistent) volume.

import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  DEFAULT_STYLE,
  SHOP_ITEMS,
  equip,
  limitStyle,
  sanitizeOwned,
  sanitizeStyle,
  type ItemId,
  type PlayerStyle,
} from "../shared/cosmetics";
import { bearer, cors as corsFor, json, readBody } from "./http";
import {
  applyResult,
  casualOf,
  rankLeaderboard,
  winRate,
  type GameResult,
  type LeaderboardRow,
  type PublicProfile,
  type UserStats,
} from "../shared/stats";

export interface User {
  id: string;
  googleSub: string;
  name: string;
  /** "/avatars/<file>" for an uploaded photo, or the Google profile photo URL. */
  avatarUrl: string | null;
  style?: PlayerStyle;
  /** Shop items bought with payOS. */
  owned?: string[];
  /** Google account email, refreshed at every sign-in (used to recognise admins). */
  email?: string;
  createdAt: number;
}

interface Store {
  users: Record<string, User>;
  /** session token -> user id */
  sessions: Record<string, { userId: string; createdAt: number }>;
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
/**
 * Google emails of the game's admins (comma separated): they manage discount
 * codes and own every shop item. Read on use, after .env is loaded.
 */
const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
const MAX_AVATAR_BYTES = 1024 * 1024; // the client resizes to 256px, so this is generous
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function createAccounts(dataDir: string, corsOrigin: string[] | "*") {
  const file = join(dataDir, "users.json");
  const avatarDir = join(dataDir, "avatars");
  mkdirSync(avatarDir, { recursive: true });
  let store: Store = { users: {}, sessions: {} };
  try {
    if (existsSync(file)) store = JSON.parse(readFileSync(file, "utf8")) as Store;
  } catch (err) {
    console.error("[accounts] load failed", err);
  }

  const save = () => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(store));
    renameSync(tmp, file);
  };

  // Career stats live in their own file (user id -> stats).
  const statsFile = join(dataDir, "stats.json");
  let stats: Record<string, UserStats> = {};
  try {
    if (existsSync(statsFile)) stats = JSON.parse(readFileSync(statsFile, "utf8")) as Record<string, UserStats>;
  } catch (err) {
    console.error("[stats] load failed", err);
  }
  const saveStats = () => {
    const tmp = `${statsFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(stats));
    renameSync(tmp, statsFile);
  };

  /** Adds a finished game to every signed-in player's stats. */
  function recordGame(results: GameResult[]) {
    let changed = false;
    for (const r of results) {
      if (!store.users[r.userId]) continue;
      stats[r.userId] = applyResult(stats[r.userId], r.game);
      changed = true;
    }
    if (changed) saveStats();
  }

  function profileOf(userId: string | null | undefined): PublicProfile | null {
    const u = userId ? store.users[userId] : undefined;
    if (!u) return null;
    return {
      userId: u.id,
      name: u.name,
      avatar: "",
      avatarUrl: u.avatarUrl,
      style: styleOf(u),
      isBot: false,
      memberSince: u.createdAt,
      stats: stats[u.id] ?? null,
    };
  }

  function leaderboard(): LeaderboardRow[] {
    return rankLeaderboard(
      Object.values(store.users).map((u) => {
        const s = stats[u.id];
        return {
          userId: u.id,
          name: u.name,
          avatarUrl: u.avatarUrl,
          style: styleOf(u),
          games: s?.games ?? 0,
          wins: s?.wins ?? 0,
          winRate: s ? winRate(s) : 0,
          wolfGames: s?.byRole.werewolf?.games ?? 0,
          casual: (() => {
            const c = casualOf(s);
            return { games: c.games, wins: c.wins, winRate: winRate(c), wolfGames: c.byRole.werewolf?.games ?? 0 };
          })(),
          createdAt: u.createdAt ?? 0,
        };
      }),
    );
  }

  function userForToken(token: unknown): User | null {
    if (typeof token !== "string" || !token) return null;
    const s = store.sessions[token];
    if (!s) return null;
    if (Date.now() - s.createdAt > SESSION_TTL_MS) {
      delete store.sessions[token];
      return null;
    }
    return store.users[s.userId] ?? null;
  }

  const isAdmin = (u: User) => !!u.email && adminEmails().includes(u.email.toLowerCase());
  /** What an account owns. Admins own the whole shop, items added later included. */
  const ownedOf = (u: User | undefined | null) => (u && isAdmin(u) ? [...SHOP_ITEMS] : sanitizeOwned(u?.owned));
  /** The style others see: anything not (or no longer) owned falls back to the default. */
  const styleOf = (u: User) => limitStyle(u.style ?? DEFAULT_STYLE, ownedOf(u));
  const publicUser = (u: User) => ({
    id: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl,
    style: styleOf(u),
    owned: ownedOf(u),
    isAdmin: isAdmin(u),
  });

  /** Adds a bought item to the account and equips it. Safe to call twice. */
  function grantItem(userId: string, item: ItemId) {
    const u = store.users[userId];
    if (!u) return null;
    u.owned = sanitizeOwned([...ownedOf(u), item]);
    u.style = equip(styleOf(u), item);
    save();
    return publicUser(u);
  }

  // ------------------------------------------------------------------ HTTP --

  const cors = (req: IncomingMessage, res: ServerResponse) => corsFor(req, res, corsOrigin);

  function imageExt(buf: Buffer): "jpg" | "png" | "webp" | null {
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
    if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "webp";
    return null;
  }

  /** Returns true when the request was handled. */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname;

    if (path.startsWith("/avatars/") && req.method === "GET") {
      const name = path.slice("/avatars/".length);
      if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) return json(res, 404, { ok: false }), true;
      const full = join(avatarDir, name);
      if (!existsSync(full)) return json(res, 404, { ok: false }), true;
      const ext = name.split(".").pop()!;
      res.setHeader("Content-Type", ext === "jpg" ? "image/jpeg" : `image/${ext}`);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(readFileSync(full));
      return true;
    }

    const publicPath = path === "/leaderboard" || path.startsWith("/profiles/");
    if (!path.startsWith("/auth/") && path !== "/me" && path !== "/me/avatar" && !publicPath) return false;
    cors(req, res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }

    // Public: the ranking and anyone's profile card.
    if (publicPath) {
      if (req.method !== "GET") return json(res, 405, { ok: false }), true;
      if (path === "/leaderboard") return json(res, 200, { ok: true, rows: leaderboard() }), true;
      const profile = profileOf(decodeURIComponent(path.slice("/profiles/".length)));
      return profile ? json(res, 200, { ok: true, profile }) : json(res, 404, { ok: false, error: "err.profileNotFound" }), true;
    }

    try {
      if (path === "/auth/google" && req.method === "POST") {
        if (!GOOGLE_CLIENT_ID) return json(res, 503, { ok: false, error: "err.authDisabled" }), true;
        const body = await readBody(req, 16 * 1024);
        const credential = body ? (JSON.parse(body.toString()) as { credential?: string }).credential : null;
        if (!credential) return json(res, 400, { ok: false, error: "err.authFailed" }), true;
        const { payload } = await jwtVerify(credential, googleKeys, {
          audience: GOOGLE_CLIENT_ID,
          issuer: ["https://accounts.google.com", "accounts.google.com"],
        });
        const sub = String(payload.sub);
        let user = Object.values(store.users).find((u) => u.googleSub === sub);
        if (!user) {
          user = {
            id: randomUUID(),
            googleSub: sub,
            name: String(payload.given_name || payload.name || "Player").slice(0, 24),
            avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
            createdAt: Date.now(),
          };
          store.users[user.id] = user;
        }
        // Only a verified Google email can make someone an admin.
        if (typeof payload.email === "string" && payload.email_verified !== false) user.email = payload.email.toLowerCase();
        const token = randomBytes(32).toString("hex");
        store.sessions[token] = { userId: user.id, createdAt: Date.now() };
        save();
        return json(res, 200, { ok: true, token, user: publicUser(user) }), true;
      }

      if (path === "/auth/logout" && req.method === "POST") {
        delete store.sessions[bearer(req)];
        save();
        return json(res, 200, { ok: true }), true;
      }

      const user = userForToken(bearer(req));
      if (!user) return json(res, 401, { ok: false, error: "err.sessionExpired" }), true;

      if (path === "/me" && req.method === "GET")
        return json(res, 200, { ok: true, user: publicUser(user), stats: stats[user.id] ?? null }), true;

      if (path === "/me" && req.method === "PATCH") {
        const body = await readBody(req, 4 * 1024);
        const patch = body
          ? (JSON.parse(body.toString()) as { name?: string; style?: unknown; removePhoto?: boolean })
          : {};
        if (patch.removePhoto) {
          if (user.avatarUrl?.startsWith("/avatars/")) {
            try {
              unlinkSync(join(avatarDir, user.avatarUrl.slice("/avatars/".length)));
            } catch {}
          }
          user.avatarUrl = null;
        }
        if (patch.name !== undefined) {
          const clean = String(patch.name).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
          if (!clean) return json(res, 400, { ok: false, error: "err.nameRequired" }), true;
          user.name = clean;
        }
        if (patch.style !== undefined) user.style = limitStyle(sanitizeStyle(patch.style), ownedOf(user));
        save();
        return json(res, 200, { ok: true, user: publicUser(user) }), true;
      }

      if (path === "/me/avatar" && req.method === "POST") {
        const buf = await readBody(req, MAX_AVATAR_BYTES);
        if (!buf) return json(res, 413, { ok: false, error: "err.imageTooLarge" }), true;
        const ext = imageExt(buf);
        if (!ext) return json(res, 400, { ok: false, error: "err.imageInvalid" }), true;
        const name = `${user.id.slice(0, 8)}-${Date.now().toString(36)}.${ext}`;
        writeFileSync(join(avatarDir, name), buf);
        // Remove the previous uploaded photo.
        if (user.avatarUrl?.startsWith("/avatars/")) {
          try {
            unlinkSync(join(avatarDir, user.avatarUrl.slice("/avatars/".length)));
          } catch {}
        }
        user.avatarUrl = `/avatars/${name}`;
        save();
        return json(res, 200, { ok: true, user: publicUser(user) }), true;
      }

      return json(res, 404, { ok: false }), true;
    } catch (err) {
      console.error("[accounts]", err);
      return json(res, 400, { ok: false, error: "err.authFailed" }), true;
    }
  }

  return {
    handle,
    userForToken,
    recordGame,
    profileOf,
    grantItem,
    publicUser,
    isAdmin,
    hasUser: (userId: string) => !!store.users[userId],
    statsOf: (userId: string) => stats[userId] ?? null,
    /** Shop items a user owns (empty for guests). */
    ownedFor: (userId: string | null | undefined) => ownedOf(userId ? store.users[userId] : null),
    enabled: !!GOOGLE_CLIENT_ID,
  };
}
