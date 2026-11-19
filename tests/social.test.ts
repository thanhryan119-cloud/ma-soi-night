import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import { canSpeak, sanitizeChat, sanitizeStroke, voiceAccess } from "../shared/social";
import type { RoleId } from "../shared/types";

function room4(roles: RoleId[] = ["werewolf", "villager", "villager", "villager"]) {
  const room = createRoom("SOC1", "vi");
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i}` }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  return { room, ids };
}

describe("chat and board permissions", () => {
  it("open in the lobby for everyone", () => {
    const { room, ids } = room4();
    expect(canSpeak(room, { kind: "player", playerId: ids[0] })).toBeNull();
    expect(canSpeak(room, { kind: "host" })).toBeNull();
  });

  it("closed for players at night, open again during the discussion, read-only for the dead", () => {
    const { room, ids } = room4();
    hostAction(room, { type: "updateSettings", settings: { wolvesMustBite: false } });
    hostAction(room, { type: "start" });
    hostAction(room, { type: "next" }); // night
    expect(canSpeak(room, { kind: "player", playerId: ids[1] })).toBe("err.chatClosed");
    expect(canSpeak(room, { kind: "host" })).toBeNull();
    hostAction(room, { type: "next" }); // dawn
    hostAction(room, { type: "next" }); // discussion
    expect(room.phase.kind).toBe("discussion");
    expect(canSpeak(room, { kind: "player", playerId: ids[1] })).toBeNull();
    hostAction(room, { type: "override", action: { kind: "kill", playerId: ids[2] } });
    expect(canSpeak(room, { kind: "player", playerId: ids[2] })).toBe("err.deadNoChat");
  });

  it("unknown players can't speak", () => {
    const { room } = room4();
    expect(canSpeak(room, { kind: "player", playerId: "nope" })).toBe("err.notInRoom");
  });
});

describe("voice access", () => {
  it("follows the phase and the host setting; dead players listen only", () => {
    const { room, ids } = room4();
    expect(voiceAccess(room, { kind: "player", playerId: ids[0] })).toEqual({ ok: true, listenOnly: false });
    hostAction(room, { type: "updateSettings", settings: { voiceChat: false } });
    expect(voiceAccess(room, { kind: "player", playerId: ids[0] }).error).toBe("err.voiceDisabled");
    hostAction(room, { type: "updateSettings", settings: { voiceChat: true, wolvesMustBite: false } });
    hostAction(room, { type: "start" });
    hostAction(room, { type: "next" }); // night
    expect(voiceAccess(room, { kind: "host" }).ok).toBe(false);
    hostAction(room, { type: "next" });
    hostAction(room, { type: "next" }); // discussion
    hostAction(room, { type: "override", action: { kind: "kill", playerId: ids[3] } });
    expect(voiceAccess(room, { kind: "player", playerId: ids[3] })).toEqual({ ok: true, listenOnly: true });
    expect(voiceAccess(room, { kind: "player", playerId: ids[1] })).toEqual({ ok: true, listenOnly: false });
  });
});

describe("sanitizers", () => {
  it("chat text is trimmed, cleaned and capped", () => {
    expect(sanitizeChat("  hello\u0007   world ")).toBe("hello world");
    expect(sanitizeChat("   ")).toBeNull();
    expect(sanitizeChat("x".repeat(500))!.length).toBe(200);
  });

  it("strokes need a known colour and size and are clamped to the board", () => {
    const ok = sanitizeStroke({ color: "#e5383b", size: 5, points: [0.1, 0.2, 1.5, -1] }, "p1", "s1");
    expect(ok).toEqual({ id: "s1", by: "p1", color: "#e5383b", size: 5, points: [0.1, 0.2, 1, 0] });
    expect(sanitizeStroke({ color: "red", size: 5, points: [0, 0] }, "p", "s")).toBeNull();
    expect(sanitizeStroke({ color: "#e5383b", size: 99, points: [0, 0] }, "p", "s")).toBeNull();
    expect(sanitizeStroke({ color: "#e5383b", size: 5, points: [0, 0, 1] }, "p", "s")).toBeNull();
    expect(sanitizeStroke({ color: "#e5383b", size: 5, points: new Array(5000).fill(0.5) }, "p", "s")).toBeNull();
    expect(sanitizeStroke({ color: "#e5383b", size: 5, points: [0, "x"] }, "p", "s")).toBeNull();
  });
});
