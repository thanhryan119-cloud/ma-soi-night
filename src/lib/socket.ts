"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Socket server URL: env var in production, same hostname :4000 in local/LAN dev. */
export function socketUrl(): string {
  const env = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (env) return env;
  if (typeof window === "undefined") return "http://localhost:4000";
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(socketUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
  }
  return socket;
}

export interface AckResult {
  ok: boolean;
  error?: string;
  params?: Record<string, string | number>;
  [k: string]: unknown;
}

export function emitAck<R = object>(event: string, payload: unknown = {}): Promise<AckResult & Partial<R>> {
  return new Promise((resolve) => {
    getSocket()
      .timeout(8000)
      .emit(event, payload, (err: unknown, res: AckResult & Partial<R>) => {
        resolve(err ? ({ ok: false, error: "err.disconnected" } as AckResult & Partial<R>) : res);
      });
  });
}

// --- Local session storage -------------------------------------------------

export const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

export const hostKey = (code: string) => `msn:host:${code}`;
export const playerKey = (code: string) => `msn:player:${code}`;
export interface PlayerSession {
  playerId: string;
  token: string;
}
