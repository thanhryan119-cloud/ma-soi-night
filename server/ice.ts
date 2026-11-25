// ICE servers for the voice chat mesh. STUN alone fails between many phones on
// 4G / carrier NAT, so a TURN relay is used when one is configured:
//   - Cloudflare Realtime TURN: CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
//     (short-lived credentials are minted and cached), or
//   - any TURN server: TURN_URLS (comma separated) + TURN_USERNAME + TURN_CREDENTIAL.

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const DEFAULT_STUN: IceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

type Env = Record<string, string | undefined>;

/** Static TURN from the environment (null when not configured). */
export function staticTurn(env: Env = process.env): IceServer | null {
  const urls = (env.TURN_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => /^turns?:/.test(u));
  if (!urls.length) return null;
  return { urls, username: env.TURN_USERNAME || undefined, credential: env.TURN_CREDENTIAL || undefined };
}

/** Browsers refuse port 53, so those URLs only slow ICE down. */
const usable = (url: string) => !/:53(\?|$)/.test(url);

/** Normalises Cloudflare's reply ({iceServers: [...]} or {iceServers: {...}}). */
export function parseCloudflare(body: unknown): IceServer[] {
  const raw = (body as { iceServers?: unknown } | null)?.iceServers;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: IceServer[] = [];
  for (const s of list as IceServer[]) {
    if (!s || !s.urls) continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === "string" && usable(u));
    if (urls.length) out.push({ urls, username: s.username, credential: s.credential });
  }
  return out;
}

const TTL_S = 24 * 3600;
let cached: { servers: IceServer[]; until: number } | null = null;
let pending: Promise<IceServer[]> | null = null;

async function cloudflare(env: Env): Promise<IceServer[] | null> {
  const id = env.CLOUDFLARE_TURN_KEY_ID;
  const token = env.CLOUDFLARE_TURN_API_TOKEN;
  if (!id || !token) return null;
  if (cached && cached.until > Date.now()) return cached.servers;
  pending ??= (async () => {
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: TTL_S }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const servers = parseCloudflare(await res.json());
      if (!servers.length) throw new Error("no ICE servers in reply");
      // Refresh well before the credentials run out.
      cached = { servers, until: Date.now() + (TTL_S / 2) * 1000 };
      return servers;
    } catch (err) {
      console.warn("[voice] Cloudflare TURN unavailable, using STUN only:", (err as Error).message);
      return [];
    } finally {
      pending = null;
    }
  })();
  const servers = await pending;
  return servers.length ? servers : null;
}

/** The ICE servers handed to every voice participant. */
export async function iceServers(env: Env = process.env): Promise<IceServer[]> {
  const cf = await cloudflare(env);
  if (cf) return cf;
  const turn = staticTurn(env);
  return turn ? [...DEFAULT_STUN, turn] : DEFAULT_STUN;
}

/** Logged once at boot so a missing relay is visible in the server logs. */
export function describeIce(env: Env = process.env): string {
  if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) return "Cloudflare TURN";
  if (staticTurn(env)) return "TURN from TURN_URLS";
  return "STUN only (set CLOUDFLARE_TURN_KEY_ID/CLOUDFLARE_TURN_API_TOKEN or TURN_URLS so voice works across mobile networks)";
}
