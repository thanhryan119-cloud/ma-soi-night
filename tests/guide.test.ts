import { generateKeyPairSync, sign } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import viGuide from "../server/guide/vi.json";
import enGuide from "../server/guide/en.json";
import {
  INTERACTIONS_PATH,
  commandDefinitions,
  createDiscordGuide,
  langOf,
  publicKeyFromHex,
  respond,
  tr,
  verifySignature,
  type Interaction,
  type MessageData,
} from "../server/discordGuide";
import { FAQ, GUIDE_ROLE_ORDER, STARTER_ROLES, nightRule, seerTricks } from "../shared/guide";
import { ROLE_IDS } from "../shared/roles";

const WEB = { webUrl: "https://ma-soi.example" };
const cmd = (name: string, options?: { name: string; value: unknown }[], locale = "vi"): Interaction => ({ type: 2, locale, data: { name, options } });
const click = (custom_id: string, ephemeral = true, values?: string[]): Interaction => ({
  type: 3,
  locale: "vi",
  data: { custom_id, values },
  message: { flags: ephemeral ? 64 : 0 },
});

/** Discord's size limits, so a reply is never rejected. */
function checkLimits(d: MessageData) {
  expect((d.components ?? []).length).toBeLessThanOrEqual(5);
  for (const r of d.components ?? []) {
    expect(r.components.length).toBeLessThanOrEqual(5);
    for (const c of r.components) {
      if (c.type === 2) {
        expect(c.label.length).toBeLessThanOrEqual(80);
        if (c.custom_id) expect(c.custom_id.length).toBeLessThanOrEqual(100);
      } else {
        expect(c.options.length).toBeLessThanOrEqual(25);
        for (const o of c.options) {
          expect(o.label.length).toBeLessThanOrEqual(100);
          expect((o.description ?? "").length).toBeLessThanOrEqual(100);
        }
      }
    }
  }
  for (const e of d.embeds ?? []) {
    expect((e.title ?? "").length).toBeLessThanOrEqual(256);
    expect((e.description ?? "").length).toBeLessThanOrEqual(4096);
    expect((e.fields ?? []).length).toBeLessThanOrEqual(25);
    for (const f of e.fields ?? []) {
      expect(f.name.length).toBeLessThanOrEqual(256);
      expect(f.value.length).toBeGreaterThan(0);
      expect(f.value.length).toBeLessThanOrEqual(1024);
    }
    // Nothing left as a raw key or an unfilled {placeholder}.
    expect(JSON.stringify(e)).not.toMatch(/\{\w+\}|"(roles|faq|onboard|discord|features)\.[a-zA-Z.]+"/);
  }
}

describe("guide content", () => {
  it("vi and en have the same keys", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [p + k] : keys(v, `${p}${k}.`)));
    expect(keys(viGuide).sort()).toEqual(keys(enGuide).sort());
  });

  it("knows when roles wake up and who fools the Seer", () => {
    expect(nightRule("seer")).toBe("every");
    expect(nightRule("villager")).toBe("never");
    expect(nightRule("cupid")).toBe("firstNight");
    expect(nightRule("whiteWolf")).toBe("otherNight");
    expect(nightRule("medium")).toBe("afterDeath");
    expect(seerTricks()).toContain("lycan");
    expect(seerTricks()).not.toContain("werewolf");
    expect(GUIDE_ROLE_ORDER.slice(0, 6)).toEqual(STARTER_ROLES);
    expect(new Set(GUIDE_ROLE_ORDER).size).toBe(ROLE_IDS.length);
  });

  it("picks the language from the Discord client", () => {
    expect(langOf("en-US")).toBe("en");
    expect(langOf("vi")).toBe("vi");
    expect(langOf(undefined)).toBe("vi");
    expect(tr("en", "discord.rolesDesc", { n: 3 })).toContain("3");
  });
});

describe("guide bot replies", () => {
  it("answers Discord's ping", () => {
    expect(respond({ type: 1 })).toEqual({ type: 1 });
  });

  it("every command replies only to the person who asked", () => {
    for (const name of ["huongdan", "vai", "hoidap", "chucnang"]) {
      const r = respond(cmd(name), WEB);
      expect(r.type, name).toBe(4);
      expect(r.data!.flags, name).toBe(64);
      checkLimits(r.data!);
    }
  });

  it("/vai with a role shows that role, in English for English clients", () => {
    const r = respond(cmd("vai", [{ name: "ten", value: "seer" }], "en-US"));
    expect(r.data!.embeds![0].title).toContain("Seer");
    checkLimits(r.data!);
  });

  it("the panel is public and its buttons open private replies", () => {
    const p = respond(cmd("bang-huongdan"), WEB);
    expect(p.type).toBe(4);
    expect(p.data!.flags).toBeUndefined();
    checkLimits(p.data!);
    const ids = p.data!.components!.flatMap((r) => r.components).flatMap((c) => (c.type === 2 && c.custom_id ? [c.custom_id] : []));
    expect(ids).toEqual(["g:new", "g:roles", "g:features", "g:faq"]);
    for (const id of ids) {
      const r = respond(click(id, false), WEB);
      expect(r).toMatchObject({ type: 4, data: { flags: 64 } });
    }
  });

  it("walks both onboarding flows to the end without a dead button", () => {
    const seen = new Set<string>();
    const queue = ["g:new"];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const r = respond(click(id), WEB);
      expect(r.type, id).toBe(7);
      checkLimits(r.data!);
      for (const row of r.data!.components ?? [])
        for (const c of row.components) if (c.type === 2 && c.custom_id?.startsWith("g:flow")) queue.push(c.custom_id);
    }
    expect([...seen]).toEqual(expect.arrayContaining(["g:flow:new:4", "g:flow:know:2"]));
    // The last step links to the web app.
    const end = respond(click("g:flow:new:4"), WEB).data!;
    expect(JSON.stringify(end)).toContain("https://ma-soi.example/lobby?quick=1");
  });

  it("every role and every question has a full reply", () => {
    for (const r of ROLE_IDS) {
      const res = respond(click("g:role", true, [r]));
      expect(res.type).toBe(7);
      checkLimits(res.data!);
      checkLimits(respond(click(`g:rolego:${r}`)).data!);
    }
    for (const f of FAQ) {
      const res = respond(click("g:faqq", true, [f.id]));
      checkLimits(res.data!);
      expect(res.data!.embeds![0].description!.length).toBeGreaterThan(20);
    }
    expect(respond(click("g:faqq", true, ["seer"])).data!.embeds![0].description).toContain(tr("vi", "roles.lycan.name"));
  });

  it("unknown clicks get a polite private message", () => {
    expect(respond(click("nope"))).toMatchObject({ type: 4, data: { flags: 64 } });
  });

  it("the commands fit Discord's rules", () => {
    const defs = commandDefinitions();
    for (const d of defs) {
      expect(d.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(d.description.length).toBeLessThanOrEqual(100);
    }
    const vai = defs.find((d) => d.name === "vai") as { options: { choices: unknown[] }[] };
    const choices = vai.options[0].choices;
    expect(choices.length).toBeLessThanOrEqual(25);
  });
});

describe("interactions endpoint", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const hex = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("hex");

  function call(guide: ReturnType<typeof createDiscordGuide>, body: string, headers: Record<string, string>) {
    const req = Object.assign(Readable.from([Buffer.from(body)]), { url: INTERACTIONS_PATH, method: "POST", headers }) as unknown as IncomingMessage;
    let status = 0;
    let out = "";
    const res = {
      statusCode: 200,
      setHeader() {},
      end(this: { statusCode: number }, s: string) {
        status = this.statusCode;
        out = s;
      },
    } as unknown as ServerResponse;
    return guide.handle(req, res).then((handled) => ({ handled, status, json: JSON.parse(out) }));
  }

  it("checks Discord's signature", () => {
    const key = publicKeyFromHex(hex)!;
    const body = Buffer.from('{"type":1}');
    const sig = sign(null, Buffer.concat([Buffer.from("123"), body]), privateKey).toString("hex");
    expect(verifySignature(key, sig, "123", body)).toBe(true);
    expect(verifySignature(key, sig, "124", body)).toBe(false);
    expect(publicKeyFromHex("nothex")).toBeNull();
  });

  it("answers a signed ping and refuses an unsigned one", async () => {
    const guide = createDiscordGuide({ publicKey: hex });
    expect(guide.enabled).toBe(true);
    const body = '{"type":1}';
    const ts = String(Date.now());
    const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");
    const ok = await call(guide, body, { "x-signature-ed25519": sig, "x-signature-timestamp": ts });
    expect(ok).toMatchObject({ handled: true, status: 200, json: { type: 1 } });
    const bad = await call(guide, body, { "x-signature-ed25519": "0".repeat(128), "x-signature-timestamp": ts });
    expect(bad.status).toBe(401);
  });

  it("stays off without a key", async () => {
    const guide = createDiscordGuide({});
    expect(guide.enabled).toBe(false);
    expect((await call(guide, "{}", {})).status).toBe(404);
  });
});
