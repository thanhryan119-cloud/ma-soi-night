import { describe, expect, it } from "vitest";
import { chatStage, currentGameChat, newStage, type ChatMessage } from "../shared/social";

const msg = (id: string, g: number, stage: ChatMessage["stage"], n = 0): ChatMessage => ({ id, from: "p1", text: id, t: 0, stage, n, g });

describe("the room chat across games", () => {
  it("marks each line with the game it was said in", () => {
    const room = { game: null, phase: { kind: "lobby" }, gameNo: 3 } as unknown as Parameters<typeof chatStage>[0];
    expect(chatStage(room)).toEqual({ stage: "lobby", n: 0, g: 3 });
    const first = { game: null, phase: { kind: "lobby" } } as unknown as Parameters<typeof chatStage>[0];
    expect(chatStage(first).g).toBe(1);
  });

  it("puts a marker where a new game starts, even in the lobby", () => {
    expect(newStage(msg("a", 2, "lobby"), msg("b", 1, "over"))).toBe(true);
    expect(newStage(msg("a", 2, "lobby"), msg("b", 2, "lobby"))).toBe(false);
    expect(newStage(msg("a", 2, "lobby"), undefined)).toBe(true);
    expect(newStage(msg("a", 1, "lobby"), undefined)).toBe(false);
    expect(newStage(msg("a", 2, "night", 1), msg("b", 1, "night", 1))).toBe(true);
  });

  it("lets the bots read only the game being played", () => {
    const chat = [msg("old", 1, "day", 2), msg("new", 2, "night", 1), { id: "legacy", from: "p1", text: "x", t: 0 } as ChatMessage];
    expect(currentGameChat(chat, 2).map((m) => m.id)).toEqual(["new"]);
    expect(currentGameChat(chat, undefined).map((m) => m.id)).toEqual(["old", "legacy"]);
  });
});
