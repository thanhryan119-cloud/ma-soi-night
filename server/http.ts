// Small helpers shared by the HTTP routes (accounts, quests).

import type { IncomingMessage, ServerResponse } from "node:http";

export function cors(req: IncomingMessage, res: ServerResponse, corsOrigin: string[] | "*") {
  const origin = req.headers.origin ?? "";
  const allowed = corsOrigin === "*" || corsOrigin.includes(origin);
  if (allowed) res.setHeader("Access-Control-Allow-Origin", corsOrigin === "*" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

export function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

export async function readJson<T>(req: IncomingMessage, limit: number): Promise<T | null> {
  const body = await readBody(req, limit);
  if (!body) return null;
  try {
    return JSON.parse(body.toString()) as T;
  } catch {
    return null;
  }
}

export const bearer = (req: IncomingMessage) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
