// Posts a short card to a Discord channel (through a channel webhook) each time
// a room is made, so the community sees new tables and can jump in.
// Off unless DISCORD_WEBHOOK_URL is set. Never blocks or breaks room creation.

import type { Room } from "../shared/types";

export interface RoomNotice {
  code: string;
  title?: string;
  locale: Room["locale"];
  machineHost: boolean;
  locked: boolean;
  listed: boolean;
}

export function noticeOf(room: Room): RoomNotice {
  return {
    code: room.code,
    title: room.title,
    locale: room.locale,
    machineHost: !!room.machineHost,
    locked: !!room.passwordHash,
    listed: !!room.listed,
  };
}

/** Only real Discord webhook URLs, so a typo in the env never sends data elsewhere. */
export function isDiscordWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      /^(?:canary\.|ptb\.)?discord(?:app)?\.com$/.test(u.hostname) &&
      u.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

/** The webhook body: one embed with the room code and a join link when the web URL is known. */
export function roomMessage(n: RoomNotice, webUrl?: string) {
  const link = webUrl ? `${webUrl.replace(/\/+$/, "")}/join/${n.code}` : undefined;
  const fields = [
    { name: "Mã phòng", value: `\`${n.code}\``, inline: true },
    { name: "Quản trò", value: n.machineHost ? "Máy dẫn" : "Người dẫn", inline: true },
    { name: "Mật khẩu", value: n.locked ? "Có 🔒" : "Không", inline: true },
  ];
  if (n.locale === "en") fields.push({ name: "Ngôn ngữ", value: "English", inline: true });
  const title = n.title && n.title !== n.code ? `Phòng mới của ${n.title}` : "Có phòng Ma Sói mới";
  return {
    username: "Ma Sói Online",
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title,
        description: link ? `Vào chơi ngay tại ${link}` : `Nhập mã **${n.code}** để vào phòng.`,
        url: link,
        color: 0x8b1e3f,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export interface DiscordNotifier {
  enabled: boolean;
  roomCreated(room: Room): void;
}

export function createDiscordNotifier(opts: {
  webhookUrl?: string;
  webUrl?: string;
  fetchFn?: typeof fetch;
}): DiscordNotifier {
  const url = opts.webhookUrl?.trim() ?? "";
  if (url && !isDiscordWebhook(url)) console.warn("[discord] DISCORD_WEBHOOK_URL is not a Discord webhook URL: ignored");
  const enabled = !!url && isDiscordWebhook(url);
  const doFetch = opts.fetchFn ?? fetch;
  return {
    enabled,
    roomCreated(room) {
      if (!enabled) return;
      const body = JSON.stringify(roomMessage(noticeOf(room), opts.webUrl));
      doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(5000),
      })
        .then((res) => {
          if (!res.ok) console.warn(`[discord] webhook answered ${res.status} for room ${room.code}`);
        })
        .catch((err) => console.warn(`[discord] webhook failed for room ${room.code}:`, err?.message ?? err));
    },
  };
}
