import { describe, expect, it } from "vitest";
import { deviceLocale } from "../src/lib/deviceLocale";

describe("device language", () => {
  it("picks the first preferred language we have", () => {
    expect(deviceLocale(["en-US", "vi"])).toBe("en");
    expect(deviceLocale(["vi-VN", "en"])).toBe("vi");
    expect(deviceLocale(["fr-FR", "EN-gb"])).toBe("en");
    expect(deviceLocale(["ja", "fr"])).toBeNull();
    expect(deviceLocale([])).toBeNull();
  });
});
