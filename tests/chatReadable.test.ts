import { describe, expect, it } from "vitest";
import {
  CHAT_BURST,
  CHAT_MIN_GAP_MS,
  CHAT_WINDOW_MS,
  chatWaitMs,
  mentionsName,
  recentSends,
  tableBusy,
  type ChatMessage,
} from "../shared/social";

describe("slow mode", () => {
  it("lets a player send a few messages, then makes them wait", () => {
    const now = 100_000;
    expect(chatWaitMs([], now)).toBe(0);
    const sent = [now - 3000, now - 2000, now - 1000];
    expect(sent.length).toBe(CHAT_BURST);
    // The oldest of the burst leaves the window 8 s after it was sent.
    expect(chatWaitMs(sent, now)).toBe(CHAT_WINDOW_MS - 3000);
    expect(chatWaitMs(sent, now + CHAT_WINDOW_MS - 3000)).toBe(0);
  });

  it("still blocks two messages in a row that are too close", () => {
    const now = 50_000;
    expect(chatWaitMs([now - 100], now)).toBe(CHAT_MIN_GAP_MS - 100);
    expect(chatWaitMs([now - CHAT_MIN_GAP_MS], now)).toBe(0);
  });

  it("forgets old messages", () => {
    const now = 200_000;
    const old = [now - 20_000, now - 15_000, now - 9_000];
    expect(recentSends(old, now)).toEqual([]);
    expect(chatWaitMs(old, now)).toBe(0);
  });
});

describe("mentions", () => {
  it("finds a name as a whole word, ignoring case and with @", () => {
    expect(mentionsName("Hương nói dối đó", "Hương")).toBe(true);
    expect(mentionsName("vote hương đi", "Hương")).toBe(true);
    expect(mentionsName("@Minh Anh sao im vậy", "Minh Anh")).toBe(true);
    expect(mentionsName("Minh, bạn là ai?", "Minh")).toBe(true);
  });

  it("does not match inside another word or a different accent", () => {
    expect(mentionsName("Anh ơi", "An")).toBe(false);
    expect(mentionsName("Huong ở đâu", "Hương")).toBe(false);
    expect(mentionsName("Bảo vệ ai", "Bảo")).toBe(true);
  });

  it("ignores one-letter names and odd characters", () => {
    expect(mentionsName("a b c", "A")).toBe(false);
    // Symbols in a name are matched literally, not as a pattern.
    expect(mentionsName("ok (x)", "(x)")).toBe(true);
    expect(mentionsName("ok x", "(x)")).toBe(false);
    expect(mentionsName("hi Dr.Who", "Dr.Who")).toBe(true);
    expect(mentionsName("hi DrxWho", "Dr.Who")).toBe(false);
  });
});

describe("bots wait while people talk", () => {
  const msg = (from: string, t: number): ChatMessage => ({ id: `${from}${t}`, from, text: "…", t });
  const human = (from: string) => from.startsWith("p");

  it("is busy after 4 lines from people in 10 s", () => {
    const now = 100_000;
    const chat = [msg("p1", now - 9000), msg("bot1", now - 8000), msg("p2", now - 5000), msg("p1", now - 3000), msg("p3", now - 1000)];
    expect(tableBusy(chat, human, now)).toBe(true);
  });

  it("is not busy when bots do the talking or the lines are old", () => {
    const now = 100_000;
    const bots = [msg("bot1", now - 4000), msg("bot2", now - 3000), msg("bot1", now - 2000), msg("p1", now - 1000)];
    expect(tableBusy(bots, human, now)).toBe(false);
    const old = [msg("p1", now - 30_000), msg("p2", now - 20_000), msg("p1", now - 12_000), msg("p3", now - 1000)];
    expect(tableBusy(old, human, now)).toBe(false);
  });
});
