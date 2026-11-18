import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, playerAction } from "../shared/engine";
import { DEFAULT_STYLE, sanitizeAvatarUrl, sanitizeStyle } from "../shared/cosmetics";
import { buildView } from "../shared/views";

describe("profile cosmetics", () => {
  it("keeps known ids and drops unknown ones", () => {
    expect(sanitizeStyle({ font: "script", effect: "glitch", frame: "moon" })).toEqual({ font: "script", effect: "glitch", frame: "moon" });
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
    const p = addPlayer(room, { name: "Lan", style: { font: "brush", effect: "blood", frame: "thorns" }, avatarUrl: "https://evil.example/x.png" }).player!;
    expect(p.avatarUrl).toBeNull();
    const screen = buildView(room, "screen");
    expect(screen.players[0].style).toEqual({ font: "brush", effect: "blood", frame: "thorns" });
    expect(playerAction(room, p.id, { type: "updateProfile", style: { effect: "glow" } }).ok).toBe(true);
    expect(buildView(room, "host").players[0].style.effect).toBe("glow");
  });
});
