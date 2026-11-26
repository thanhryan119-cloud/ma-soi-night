import { describe, expect, it } from "vitest";
import { botTalks } from "../shared/bots";

describe("away players a bot stands in for", () => {
  it("talk like bots, while people and returned players do not", () => {
    expect(botTalks({ isBot: true })).toBe(true);
    expect(botTalks({ isBot: false, standIn: true })).toBe(true);
    expect(botTalks({ isBot: false, standIn: false })).toBe(false);
    expect(botTalks({ isBot: false })).toBe(false);
  });
});
