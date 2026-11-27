import { describe, expect, it, vi } from "vitest";
import { createRoom } from "../shared/engine";
import { createDiscordNotifier, isDiscordWebhook, noticeOf, roomMessage } from "../server/discord";

const HOOK = "https://discord.com/api/webhooks/123/abc";

describe("discord room notices", () => {
  it("accepts only Discord webhook URLs", () => {
    expect(isDiscordWebhook(HOOK)).toBe(true);
    expect(isDiscordWebhook("https://discordapp.com/api/webhooks/1/x")).toBe(true);
    expect(isDiscordWebhook("http://discord.com/api/webhooks/1/x")).toBe(false);
    expect(isDiscordWebhook("https://evil.com/api/webhooks/1/x")).toBe(false);
    expect(isDiscordWebhook("not a url")).toBe(false);
  });

  it("builds a card with the code, a join link and no password", () => {
    const room = createRoom("ABCD", "vi");
    room.title = "Lan";
    room.passwordHash = "salt:hash";
    const msg = roomMessage(noticeOf(room), "https://ma-soi.app/");
    const embed = msg.embeds[0];
    expect(embed.title).toContain("Lan");
    expect(embed.url).toBe("https://ma-soi.app/join/ABCD");
    expect(JSON.stringify(msg)).toContain("ABCD");
    expect(JSON.stringify(msg)).not.toContain("salt:hash");
    expect(msg.allowed_mentions.parse).toEqual([]);
  });

  it("posts once per room and stays off without a webhook", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    createDiscordNotifier({ fetchFn: fetchFn as unknown as typeof fetch }).roomCreated(createRoom("OFF1", "vi"));
    expect(fetchFn).not.toHaveBeenCalled();

    const on = createDiscordNotifier({ webhookUrl: HOOK, fetchFn: fetchFn as unknown as typeof fetch });
    expect(on.enabled).toBe(true);
    on.roomCreated(createRoom("ON11", "vi"));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(HOOK);
    expect(String(init.body)).toContain("ON11");
  });

  it("a failing webhook never throws", async () => {
    const fetchFn = vi.fn(async () => { throw new Error("down"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      createDiscordNotifier({ webhookUrl: HOOK, fetchFn: fetchFn as unknown as typeof fetch }).roomCreated(createRoom("ERR1", "vi")),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
