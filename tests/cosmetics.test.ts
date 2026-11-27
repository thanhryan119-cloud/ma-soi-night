import { describe, expect, it } from "vitest";
import { MAX_PLAYERS, addPlayer, createRoom, hostAction, playerAction } from "../shared/engine";
import { CHAT_COLORS, DEFAULT_STYLE, sanitizeAvatarUrl, sanitizeStyle } from "../shared/cosmetics";
import { buildView } from "../shared/views";

describe("profile cosmetics", () => {
  it("keeps known ids and drops unknown ones", () => {
    expect(sanitizeStyle({ font: "script", effect: "glitch", frame: "moon" })).toEqual({ font: "script", effect: "glitch", frame: "moon", chat: "plain", card: "plain" });
    expect(sanitizeStyle({ font: "<script>", effect: 5, frame: null })).toEqual(DEFAULT_STYLE);
    expect(sanitizeStyle(undefined)).toEqual(DEFAULT_STYLE);
  });

  it("only accepts avatar photos from our uploads or Google", () => {
    expect(sanitizeAvatarUrl("/avatars/abcd1234-lk2j3.jpg")).toBe("/avatars/abcd1234-lk2j3.jpg");
    expect(sanitizeAvatarUrl("https://lh3.googleusercontent.com/a/ACg8oc=s96-c")).toBe("https://lh3.googleusercontent.com/a/ACg8oc=s96-c");
    expect(sanitizeAvatarUrl("https://evil.example/x.jpg")).toBeNull();
    expect(sanitizeAvatarUrl("/avatars/../../etc/passwd")).toBeNull();
    expect(sanitizeAvatarUrl("javascript:alert(1)")).toBeNull();
  });

  it("players carry their style into every view and can change it in the lobby", () => {
    const room = createRoom("STYLE", "vi");
    const p = addPlayer(room, {
      name: "Lan",
      style: { font: "brush", effect: "blood", frame: "thorns", chat: "stars" },
      avatarUrl: "https://evil.example/x.png",
    }).player!;
    expect(p.avatarUrl).toBeNull();
    const screen = buildView(room, "screen");
    expect(screen.players[0].style).toEqual({ font: "brush", effect: "blood", frame: "thorns", chat: "stars", card: "plain" });
    expect(playerAction(room, p.id, { type: "updateProfile", style: { effect: "glow" } }).ok).toBe(true);
    expect(buildView(room, "host").players[0].style.effect).toBe("glow");
  });

  it("gives every player in a room their own chat colour, reusing a freed one", () => {
    expect(CHAT_COLORS.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
    const room = createRoom("COLOR", "vi");
    const ids = Array.from({ length: MAX_PLAYERS }, (_, i) => addPlayer(room, { name: `P${i}` }).player!.id);
    const colors = buildView(room, "screen").players.map((p) => p.chatColor);
    expect(new Set(colors).size).toBe(MAX_PLAYERS);
    expect(hostAction(room, { type: "kick", playerId: ids[3] }).ok).toBe(true);
    const back = addPlayer(room, { name: "Again" }).player!;
    expect(back.chatColor).toBe(3);
  });

  it("names bots with two words, all different", () => {
    const room = createRoom("BOTS", "vi");
    expect(hostAction(room, { type: "addBots", count: 12 }).ok).toBe(true);
    const bots = room.players.filter((p) => p.isBot).map((p) => p.name);
    expect(bots.length).toBeGreaterThan(0);
    for (const n of bots) expect(n.split(" ").length).toBeGreaterThanOrEqual(2);
    expect(new Set(bots.map((n) => n.split(" ")[0])).size).toBe(bots.length);
  });
});
