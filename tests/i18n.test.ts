import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import vi from "../messages/vi.json";
import en from "../messages/en.json";
import { ROLE_IDS } from "../shared/roles";
import { DEFAULT_NIGHT_ORDER } from "../shared/roles";

type Tree = { [k: string]: string | Tree };

function flatten(obj: Tree, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`),
  );
}

function get(obj: Tree, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o as Tree | undefined)?.[k], obj);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const root = join(__dirname, "..");
const viKeys = flatten(vi as Tree).sort();
const enKeys = flatten(en as Tree).sort();

describe("i18n messages", () => {
  it("vi.json and en.json have exactly the same keys", () => {
    expect(viKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !viKeys.includes(k))).toEqual([]);
  });

  it("no message is empty", () => {
    for (const k of viKeys) expect(String(get(vi as Tree, k)).trim(), `vi:${k}`).not.toBe("");
    for (const k of enKeys) expect(String(get(en as Tree, k)).trim(), `en:${k}`).not.toBe("");
  });

  it("both languages use the same placeholders", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(",");
    for (const k of viKeys) {
      expect(vars(String(get(en as Tree, k))), k).toBe(vars(String(get(vi as Tree, k))));
    }
  });

  it("every role has a name, description and action in both languages", () => {
    for (const r of ROLE_IDS)
      for (const f of ["name", "desc", "action"]) {
        expect(viKeys, `roles.${r}.${f}`).toContain(`roles.${r}.${f}`);
        expect(enKeys).toContain(`roles.${r}.${f}`);
      }
    for (const step of DEFAULT_NIGHT_ORDER) expect(viKeys).toContain(`script.step.${step}`);
  });

  it("every static key used in the code exists", () => {
    const files = [...walk(join(root, "src")), ...walk(join(root, "shared"))];
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bt\(\s*["']([a-zA-Z0-9_.]+)["']/g)) used.add(m[1]);
      for (const m of src.matchAll(/["']((?:err|log)\.[a-zA-Z0-9_.]+)["']/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !viKeys.includes(k));
    expect(missing).toEqual([]);
  });
});
