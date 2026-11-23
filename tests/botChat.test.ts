import { describe, expect, it } from "vitest";
import { addPlayer, autoReady, createRoom, hostAction, playerAction } from "../shared/engine";
import { botChatLine, newBotChatMemory, truthChance } from "../shared/botChat";
import { botDecide } from "../shared/bots";
import { ingestChat, newChatIntel, ranked, suspicion } from "../shared/botIntel";
import type { RoleId, Room } from "../shared/types";

function setup(roles: RoleId[]): { room: Room; ids: string[] } {
  const room = createRoom("CHAT1", "vi");
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i + 1}` }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  return { room, ids };
}

describe("bot chat honesty", () => {
  it("wolves tell the truth 20–40% of the time, the village always", () => {
    const { room, ids } = setup(["werewolf", "werewolf", "seer", "villager", "villager", "bodyguard"]);
    for (const id of ids.slice(0, 2)) {
      const p = truthChance(room, id);
      expect(p).toBeGreaterThanOrEqual(0.2);
      expect(p).toBeLessThanOrEqual(0.4);
    }
    for (const id of ids.slice(2)) {
      const p = truthChance(room, id);
      expect(p).toBeGreaterThanOrEqual(0.8);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("an honest seer reports its real result; a lying wolf never accuses its packmate", () => {
    const { room, ids } = setup(["werewolf", "werewolf", "seer", "villager", "villager"]);
    room.game!.seerResults[ids[2]] = [{ night: 1, targetId: ids[0], isWolf: true }];
    const seer = room.players[2];
    const mem = newBotChatMemory();
    const line = botChatLine(room, seer, mem, newChatIntel(), () => 0); // rnd 0 → honest, shares the result
    expect(line).toContain("P1");
    expect(line).toContain("là Sói");

    const wolf = room.players[0];
    for (let i = 0; i < 200; i++) {
      const m = newBotChatMemory();
      const text = botChatLine(room, wolf, m) ?? "";
      if (/Treo|vote|là Sói!/.test(text)) expect(text).not.toContain("P2");
    }
  });
});

describe("auto narrator readiness", () => {
  it("is ready once the night role has acted", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager"]);
    for (const p of room.players) p.connected = true;
    hostAction(room, { type: "next" }); // role reveal → night
    while (room.phase.kind === "night" && room.phase.steps[room.phase.stepIndex] !== "seer") {
      if (room.phase.steps[room.phase.stepIndex] === "werewolf") playerAction(room, ids[0], { type: "night", targets: [ids[2]] });
      hostAction(room, { type: "next" });
    }
    expect(room.phase.steps[room.phase.stepIndex]).toBe("seer");
    expect(autoReady(room)).toBe(false);
    expect(playerAction(room, ids[1], { type: "night", targets: [ids[0]] }).ok).toBe(true);
    expect(autoReady(room)).toBe(true);
  });
});

describe("bots read the chat", () => {
  it("parses claims, seer reports, accusations and defences (VI and EN)", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager", "bodyguard"]);
    const intel = newChatIntel();
    ingestChat(room, intel, ids[1], "Mình là Tiên tri. Đêm 1 mình soi P1: là Sói!");
    ingestChat(room, intel, ids[2], "Treo P4 đi");
    ingestChat(room, intel, ids[3], "I'm the Bodyguard. P2 is not a wolf, I trust P2.");
    expect(intel.claims[ids[1]]).toEqual(["seer"]);
    expect(intel.claims[ids[3]]).toEqual(["bodyguard"]);
    expect(intel.reports).toContainEqual({ by: ids[1], targetId: ids[0], isWolf: true });
    expect(intel.accuse).toContainEqual({ by: ids[2], targetId: ids[3] });
    expect(intel.defend).toContainEqual({ by: ids[3], targetId: ids[1] });
  });

  it("a villager bot votes the player the lone Seer claimant called a wolf", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager", "villager"]);
    const intel = newChatIntel();
    ingestChat(room, intel, ids[1], "Mình là Tiên tri, đêm qua soi P1: là Sói");
    const r = suspicion(room, intel, ids[2]);
    expect(ranked(r, ids.filter((id) => id !== ids[2]))[0]).toBe(ids[0]);
    expect(r.reasons.get(ids[0])).toEqual({ kind: "report", by: ids[1] });
  });

  it("the real Seer flags a rival Seer claim as fake", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager", "villager"]);
    const intel = newChatIntel();
    ingestChat(room, intel, ids[0], "Mình là Tiên tri, P3 là Sói");
    const r = suspicion(room, intel, ids[1]);
    expect(ranked(r, [ids[0], ids[2], ids[3], ids[4]])[0]).toBe(ids[0]);
    expect(r.reasons.get(ids[0])).toEqual({ kind: "fakeSeer" });
  });

  it("wolf bots never vote for a packmate", () => {
    const { room, ids } = setup(["werewolf", "werewolf", "villager", "villager", "villager", "seer"]);
    for (const p of room.players) p.isBot = true;
    const intel = newChatIntel();
    ingestChat(room, intel, ids[5], "Mình là Tiên tri, soi P2: là Sói");
    room.game!.vote = { kind: "nominate", ballots: {}, closed: false, candidates: null, nomineeId: null };
    room.phase = { ...room.phase, kind: "nominate" };
    for (let i = 0; i < 50; i++) {
      const a = botDecide(room, ids[0], intel);
      expect(a && a.type === "vote" ? a.choice : "").not.toBe(ids[1]);
    }
  });

  it("a bot never repeats a line within the same day", () => {
    const { room } = setup(["werewolf", "seer", "villager", "villager", "villager"]);
    const mem = newBotChatMemory();
    const bot = room.players[2];
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      const l = botChatLine(room, bot, mem);
      if (l) lines.push(l);
    }
    expect(new Set(lines).size).toBe(lines.length);
  });
});


describe("roles must confirm", () => {
  it("the host can't move past a night role that is online and hasn't acted", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager"]);
    for (const p of room.players) p.connected = true;
    hostAction(room, { type: "next" }); // night
    while (room.phase.steps[room.phase.stepIndex] !== "werewolf") hostAction(room, { type: "next" });
    expect(hostAction(room, { type: "next" }).error).toBe("err.roleNotDone");
    expect(autoReady(room)).toBe(false);
    playerAction(room, ids[0], { type: "night", targets: [ids[2]] });
    expect(autoReady(room)).toBe(true);
    expect(hostAction(room, { type: "next" }).ok).toBe(true);
  });

  it("an offline role doesn't block the night", () => {
    const { room } = setup(["werewolf", "seer", "villager", "villager"]);
    for (const p of room.players) p.connected = p.name !== "P2"; // the Seer is offline
    hostAction(room, { type: "next" });
    while (room.phase.steps[room.phase.stepIndex] !== "seer") {
      if (room.phase.steps[room.phase.stepIndex] === "werewolf") playerAction(room, room.players[0].id, { type: "night", targets: [room.players[2].id] });
      expect(hostAction(room, { type: "next" }).ok).toBe(true);
    }
    expect(autoReady(room)).toBe(true);
    expect(hostAction(room, { type: "next" }).ok).toBe(true);
  });
});

describe("votes must be in", () => {
  it("can't close the vote while online players haven't voted and time remains", () => {
    const { room, ids } = setup(["werewolf", "villager", "villager", "villager"]);
    hostAction(room, { type: "updateSettings", settings: { wolvesMustBite: false } });
    hostAction(room, { type: "next" }); // night (nobody online yet)
    while (room.phase.kind !== "nominate") hostAction(room, { type: "next" });
    for (const p of room.players) p.connected = true;
    hostAction(room, { type: "timer", op: "start", seconds: 60 });
    playerAction(room, ids[1], { type: "vote", choice: ids[0] });
    expect(hostAction(room, { type: "next" }).error).toBe("err.votesMissing");
    for (const id of [ids[0], ids[2], ids[3]]) playerAction(room, id, { type: "vote", choice: ids[1] });
    expect(hostAction(room, { type: "next" }).ok).toBe(true);
  });
});

describe("timeline for the dead", () => {
  it("dead players can read the full story, the living can't", async () => {
    const { buildView } = await import("../shared/views");
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager"]);
    room.players[2].alive = false;
    expect(buildView(room, "player", ids[3]).log).toBeUndefined();
    const dead = buildView(room, "player", ids[2]).log ?? [];
    expect(dead.some((e) => e.key === "log.roleOf")).toBe(true);
    room.settings.deadSeeRoles = false;
    expect((buildView(room, "player", ids[2]).log ?? []).every((e) => e.public)).toBe(true);
  });
});
