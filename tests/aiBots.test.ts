import { afterEach, describe, expect, it, vi } from "vitest";
import { newChatIntel } from "../shared/botIntel";
import { createAiBots } from "../server/aiBots";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import type { ChatMessage } from "../shared/social";
import type { RoleId, Room } from "../shared/types";

function setup(roles: RoleId[]): Room {
  const room = createRoom("AIBOT", "vi");
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i + 1}` }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  hostAction(room, { type: "start" });
  room.phase = { ...room.phase, kind: "discussion", day: 1 };
  return room;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Gemini chat bots", () => {
  it("does nothing without an API key", () => {
    const ai = createAiBots({ apiKey: undefined, model: "m", intel: () => newChatIntel(),
      recentChat: () => [], post: () => {}, canTalk: () => true });
    expect(ai.enabled).toBe(false);
  });

  it("the bot a human names answers, knowing only its own secrets", async () => {
    vi.useFakeTimers();
    const room = setup(["werewolf", "werewolf", "seer", "villager"]);
    const [w1, w2, , human] = room.players;
    w1.isBot = true;
    w2.isBot = true;
    room.players[2].isBot = true;
    const chat: ChatMessage[] = [{ id: "1", from: human.id, text: "P1 bạn là vai gì vậy?", t: 1 }];
    const calls: { url: string; body: { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[] }; key: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
        calls.push({ url, body: JSON.parse(init.body), key: init.headers["x-goog-api-key"] });
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '"P1: Mình là dân làng thôi mà."' }] } }] }) };
      }),
    );
    const posted: [string, string][] = [];
    const ai = createAiBots({
      apiKey: "test-key",
      model: "gemini-3.5-flash-lite",
      intel: () => newChatIntel(),
      recentChat: () => chat,
      post: (_r, id, text) => posted.push([id, text]),
      canTalk: () => true,
    });
    ai.onHumanChat(room, human.id, chat[0].text);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/models/gemini-3.5-flash-lite:generateContent");
    expect(calls[0].key).toBe("test-key");
    const system = calls[0].body.systemInstruction.parts[0].text;
    expect(system).toContain('"P1"');
    expect(system).toContain("Ma Sói");
    expect(system).toContain("P2"); // knows its packmate
    expect(system).toContain("WOLVES' side");
    expect(calls[0].body.contents[0].parts[0].text).toContain("P1 bạn là vai gì vậy?");
    // Quotes and a "Name:" prefix are stripped from the reply.
    expect(posted).toEqual([[w1.id, "Mình là dân làng thôi mà."]]);
  });

  it("a villager bot is never told who the wolves are", async () => {
    vi.useFakeTimers();
    const room = setup(["werewolf", "villager", "villager", "villager"]);
    room.players[1].isBot = true;
    const human = room.players[2];
    const systems: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { body: string }) => {
        systems.push(JSON.parse(init.body).systemInstruction.parts[0].text);
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "Ừ mình cũng nghĩ vậy" }] } }] }) };
      }),
    );
    const ai = createAiBots({ apiKey: "k", model: "m", intel: () => newChatIntel(),
      recentChat: () => [], post: () => {}, canTalk: () => true });
    ai.onHumanChat(room, human.id, "P2 nghi ai?");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(systems.length).toBe(1);
    expect(systems[0]).toContain("VILLAGE side");
    expect(systems[0]).not.toContain("P1");
  });
});
