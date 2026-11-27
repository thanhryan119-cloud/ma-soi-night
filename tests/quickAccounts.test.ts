import { mkdtempSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERNAME_RE, checkPassword, createAccounts, hashPassword } from "../server/accounts";

describe("password hashing", () => {
  it("accepts the right password and refuses others", () => {
    const h = hashPassword("secret1");
    expect(h.startsWith("scrypt:")).toBe(true);
    expect(checkPassword("secret1", h)).toBe(true);
    expect(checkPassword("secret2", h)).toBe(false);
    expect(checkPassword("secret1", undefined)).toBe(false);
    expect(hashPassword("secret1")).not.toBe(h);
  });

  it("limits login names", () => {
    expect(USERNAME_RE.test("soi_gia.1")).toBe(true);
    expect(USERNAME_RE.test("ab")).toBe(false);
    expect(USERNAME_RE.test("Sói")).toBe(false);
  });
});

describe("quick account endpoints", () => {
  let server: HttpServer;
  let base = "";
  const accounts = createAccounts(mkdtempSync(join(tmpdir(), "msn-acc-")), "*");
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(
      (r) => r.json() as Promise<{ ok: boolean; error?: string; token?: string; user?: { name: string; username: string; hasGoogle: boolean } }>,
    );

  beforeAll(async () => {
    server = createServer((req, res) => void accounts.handle(req, res));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("registers, refuses a taken name, and logs in", async () => {
    const reg = await post("/auth/register", { username: "Soi_Gia", password: "matkhau1" });
    expect(reg.ok).toBe(true);
    expect(reg.user).toMatchObject({ name: "soi_gia", username: "soi_gia", hasGoogle: false });
    expect(accounts.userForToken(reg.token)?.username).toBe("soi_gia");

    expect((await post("/auth/register", { username: "soi_gia", password: "khac1234" })).error).toBe("err.usernameTaken");
    expect((await post("/auth/register", { username: "x", password: "matkhau1" })).error).toBe("err.usernameInvalid");
    expect((await post("/auth/register", { username: "soi_moi", password: "123" })).error).toBe("err.passwordWeak");

    expect((await post("/auth/login", { username: "soi_gia", password: "sai" })).error).toBe("err.loginWrong");
    const login = await post("/auth/login", { username: "SOI_GIA", password: "matkhau1" });
    expect(login.ok).toBe(true);
    expect(login.token).not.toBe(reg.token);
  });

  it("pauses a login name after too many wrong passwords", async () => {
    await post("/auth/register", { username: "tho_san", password: "matkhau1" });
    for (let i = 0; i < 5; i++) await post("/auth/login", { username: "tho_san", password: "nope" });
    expect((await post("/auth/login", { username: "tho_san", password: "matkhau1" })).error).toBe("err.loginPaused");
  });
});
