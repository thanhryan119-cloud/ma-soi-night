// The server-wide chat: one channel everyone on the home page or in the online
// lobby can read. Posting needs a Google account (a name others can see on
// the profile card), one line every few seconds; admins may remove a line.
// The last lines are kept on disk so a redeploy doesn't wipe the talk.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server, Socket } from "socket.io";
import { GLOBAL_CHAT_HISTORY, GLOBAL_CHAT_WAIT_MS, sanitizeChat, type GlobalMessage } from "../shared/social";
import type { PlayerStyle } from "../shared/cosmetics";

const CHANNEL = "global-chat";

interface Account {
  id: string;
  name: string;
  avatarUrl: string | null;
  style: PlayerStyle | null;
  isAdmin: boolean;
}

type Ack = (res: Record<string, unknown>) => void;

export function createGlobalChat(io: Server, opts: { dataDir: string; accountFor: (token: unknown) => Account | null }) {
  const file = join(opts.dataDir, "global-chat.json");
  let messages: GlobalMessage[] = [];
  try {
    if (existsSync(file)) messages = (JSON.parse(readFileSync(file, "utf8")) as GlobalMessage[]).slice(-GLOBAL_CHAT_HISTORY);
  } catch (err) {
    console.error("[global chat] load failed", err);
  }
  let saveTimer: NodeJS.Timeout | null = null;
  const saveSoon = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        writeFileSync(`${file}.tmp`, JSON.stringify(messages));
        renameSync(`${file}.tmp`, file);
      } catch (err) {
        console.error("[global chat] save failed", err);
      }
    }, 1000);
  };
  /** userId -> when they last posted. */
  const lastPost = new Map<string, number>();
  let seq = 0;

  function register(socket: Socket) {
    const on = (event: string, fn: (p: Record<string, unknown>, ack: Ack) => void) =>
      socket.on(event, (p: unknown, ack: unknown) => {
        try {
          fn((p ?? {}) as Record<string, unknown>, typeof ack === "function" ? (ack as Ack) : () => {});
        } catch (err) {
          console.error(err);
          if (typeof ack === "function") (ack as Ack)({ ok: false, error: "err.server" });
        }
      });

    on("global:join", (_p, ack) => {
      socket.join(CHANNEL);
      ack({ ok: true, messages });
    });

    on("global:leave", (_p, ack) => {
      socket.leave(CHANNEL);
      ack({ ok: true });
    });

    on("global:send", (p, ack) => {
      const user = opts.accountFor(p.authToken);
      if (!user) return ack({ ok: false, error: "err.signInToChat" });
      const text = sanitizeChat(p.text);
      if (!text) return ack({ ok: false, error: "err.chatEmpty" });
      const now = Date.now();
      const wait = (lastPost.get(user.id) ?? 0) + GLOBAL_CHAT_WAIT_MS - now;
      if (wait > 0) return ack({ ok: false, error: "err.chatSlow", params: { seconds: Math.ceil(wait / 1000) } });
      lastPost.set(user.id, now);
      const msg: GlobalMessage = {
        id: `${now.toString(36)}${(seq++).toString(36)}`,
        t: now,
        userId: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        style: user.style,
        text,
      };
      messages.push(msg);
      if (messages.length > GLOBAL_CHAT_HISTORY) messages.splice(0, messages.length - GLOBAL_CHAT_HISTORY);
      io.to(CHANNEL).emit("global:new", msg);
      saveSoon();
      ack({ ok: true });
    });

    on("global:delete", (p, ack) => {
      const user = opts.accountFor(p.authToken);
      if (!user?.isAdmin) return ack({ ok: false, error: "err.notAdmin" });
      const before = messages.length;
      messages = messages.filter((m) => m.id !== p.id);
      if (messages.length !== before) {
        io.to(CHANNEL).emit("global:deleted", { id: p.id });
        saveSoon();
      }
      ack({ ok: true });
    });
  }

  return { register };
}
