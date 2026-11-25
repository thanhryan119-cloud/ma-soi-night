import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import { botChatLine, botDefenseLine, botReplyLine, chatSide, newBotChatMemory, truthChance } from "../shared/botChat";
import { botDecide } from "../shared/bots";
import { ingestChat, newChatIntel, suspicion, type ChatIntel } from "../shared/botIntel";
import { PREMIUM_ROLES, roleItem } from "../shared/roles";
import type { RoleId, Room } from "../shared/types";

function setup(roles: RoleId[]): { room: Room; ids: string[] } {
  const room = createRoom("ROLES", "vi");
  room.hostOwned = PREMIUM_ROLES.map(roleItem);
  room.settings.mandatoryVote = false;
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i + 1}` }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  return { room, ids };
}

/** A small seeded RNG so every run sees the same many situations. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Everything a bot might say in a day: free chat, accused replies, its defence. */
function everythingSaid(room: Room, botIndex: number, intel: ChatIntel, runs = 150): string[] {
  const bot = room.players[botIndex];
  const accuser = room.players.find((p) => p.id !== bot.id)!.id;
  const out: string[] = [];
  for (let s = 0; s < runs; s++) {
    const rnd = seeded(s);
    const mem = newBotChatMemory();
    for (let i = 0; i < 4; i++) {
      const line = botChatLine(room, bot, mem, intel, rnd);
      if (line) out.push(line);
    }
    const reply = botReplyLine(room, bot, accuser, `${bot.name} là sói, treo đi`, mem, intel, rnd);
    if (reply) out.push(reply);
    for (let said = 0; said < 2; said++) {
      const d = botDefenseLine(room, bot, said, intel, rnd);
      if (d) out.push(d);
    }
  }
  return out;
}

describe("who lies, by role", () => {
  it("sorts every role into the side it plays the chat for", () => {
    expect(chatSide("villager")).toBe("village");
    expect(chatSide("lycan")).toBe("village");
    expect(chatSide("werewolf")).toBe("pack");
    expect(chatSide("wolfSeer")).toBe("pack");
    expect(chatSide("minion")).toBe("minion");
    expect(chatSide("whiteWolf")).toBe("whiteWolf");
    expect(chatSide("serialKiller")).toBe("solo");
    expect(chatSide("arsonist")).toBe("solo");
    expect(chatSide("tanner")).toBe("tanner");
  });

  it("the Minion and the solo roles lie, and never say their real role", () => {
    const names: Partial<Record<RoleId, RegExp>> = { minion: /Phản Bội/i, serialKiller: /Sát Nhân/i, arsonist: /Phóng Hỏa/i, tanner: /Chán Đời/i, whiteWolf: /Sói Trắng/i };
    for (const role of Object.keys(names) as RoleId[]) {
      const { room, ids } = setup([role, "werewolf", "seer", "villager", "villager", "bodyguard"]);
      expect(truthChance(room, ids[0])).toBeLessThan(1);
      const intel = newChatIntel();
      ingestChat(room, intel, ids[3], "P1 đáng ngờ lắm, treo P1 đi");
      ingestChat(room, intel, ids[4], "Mình cũng nghi P1");
      for (const line of everythingSaid(room, 0, intel)) expect(line, `${role}: ${line}`).not.toMatch(names[role]!);
    }
  });

  it("the Minion never accuses a wolf", () => {
    const { room } = setup(["minion", "werewolf", "seer", "villager", "villager", "villager"]);
    const intel = newChatIntel();
    for (const line of everythingSaid(room, 0, intel)) if (/treo|vote|nghi|là Sói!/i.test(line)) expect(line).not.toContain("P2");
  });

  it("a hidden power role doesn't claim unprompted, but comes out with proof on the stand", () => {
    const { room, ids } = setup(["bodyguard", "werewolf", "seer", "villager", "villager"]);
    room.game!.bodyguardLast = ids[3];
    for (let s = 0; s < 200; s++) {
      const mem = newBotChatMemory();
      const line = botChatLine(room, room.players[0], mem, newChatIntel(), seeded(s));
      expect(line ?? "").not.toMatch(/Bảo vệ\./);
      expect(mem.claims[ids[0]]).toBeUndefined();
    }
    const stand = botDefenseLine(room, room.players[0], 0, newChatIntel(), seeded(1));
    expect(stand).toMatch(/Bảo vệ/);
    expect(stand).toContain("P4");
  });

  it("the Lycan the Seer called a wolf backs the Seer instead of calling a frame", () => {
    const { room, ids } = setup(["lycan", "werewolf", "seer", "villager", "villager"]);
    const intel = newChatIntel();
    ingestChat(room, intel, ids[2], "Mình là Tiên tri. Đêm 1 mình soi P1: là Sói.");
    expect(intel.reports.some((r) => r.targetId === ids[0] && r.isWolf)).toBe(true);
    // The real Seer looks trustworthy to the Lycan, not like a liar.
    expect(suspicion(room, intel, ids[0]).score.get(ids[2])!).toBeLessThan(0);
    const line = botChatLine(room, room.players[0], newBotChatMemory(), intel, () => 0);
    expect(line).toMatch(/Sói Lai/i);
    expect(line).toContain("P3");
    // Read back, it is a Lycan claim and no report against the Seer.
    const after = newChatIntel();
    ingestChat(room, after, ids[0], line!);
    expect(after.claims[ids[0]]).toContain("lycan");
    expect(after.reports.some((r) => r.targetId === ids[2])).toBe(false);
  });

  it("a Medium shares a dead wolf's reading", () => {
    const { room, ids } = setup(["medium", "werewolf", "werewolf", "villager", "villager"]);
    room.players[1].alive = false;
    room.game!.seerResults[ids[0]] = [{ night: 1, targetId: ids[1], isWolf: true, roleId: "werewolf" }];
    let shared = false;
    for (let s = 0; s < 50 && !shared; s++) shared = /hồn P2/.test(botChatLine(room, room.players[0], newBotChatMemory(), newChatIntel(), seeded(s)) ?? "");
    expect(shared).toBe(true);
  });

  it("a wolf that claimed Seer backs it with fake results, one a day, never contradicting itself", () => {
    const { room, ids } = setup(["werewolf", "werewolf", "seer", "villager", "villager", "villager"]);
    const mem = newBotChatMemory();
    mem.claims[ids[0]] = "seer";
    let report: string | null = null;
    for (let s = 0; s < 30 && !report; s++) {
      const line = botChatLine(room, room.players[0], mem, newChatIntel(), seeded(s));
      if (line && /soi/.test(line)) report = line;
    }
    expect(report).toBeTruthy();
    const checks = mem.fakeChecks[ids[0]];
    expect(checks).toHaveLength(1);
    // Never calls its own pack mate a wolf.
    if (checks[0].targetId === ids[1]) expect(checks[0].isWolf).toBe(false);
  });
});

describe("votes and hangings, by role", () => {

  function openNomination(room: Room) {
    room.phase = { ...room.phase, kind: "nominate" };
    room.game!.vote = { kind: "nominate", ballots: {}, closed: false } as never;
  }
  function openVerdict(room: Room, nominee: string) {
    room.phase = { ...room.phase, kind: "verdict" };
    room.game!.nominees = [nominee];
    room.game!.vote = { kind: "verdict", nomineeId: nominee, ballots: {}, closed: false } as never;
  }
  const choiceOf = (room: Room, id: string, intel = newChatIntel()) => {
    const a = botDecide(room, id, intel);
    return a && a.type === "vote" ? String(a.choice) : null;
  };

  it("the Seer always votes for and hangs a wolf it checked, and spares one it cleared", () => {
    const { room, ids } = setup(["seer", "werewolf", "villager", "villager", "villager"]);
    room.players.forEach((p) => (p.isBot = true));
    room.game!.seerResults[ids[0]] = [
      { night: 1, targetId: ids[1], isWolf: true },
      { night: 2, targetId: ids[2], isWolf: false },
    ];
    openNomination(room);
    for (let i = 0; i < 30; i++) expect(choiceOf(room, ids[0])).toBe(ids[1]);
    openVerdict(room, ids[1]);
    for (let i = 0; i < 30; i++) expect(choiceOf(room, ids[0])).toBe("execute");
    openVerdict(room, ids[2]);
    for (let i = 0; i < 30; i++) expect(choiceOf(room, ids[0])).toBe("spare");
  });

  it("Sisters and lovers never nominate each other, and spare each other on the stand", () => {
    const { room, ids } = setup(["sister", "sister", "werewolf", "villager", "villager"]);
    room.players.forEach((p) => (p.isBot = true));
    room.game!.lovers = [ids[3], ids[4]];
    const intel = newChatIntel();
    ingestChat(room, intel, ids[2], "P2 đáng ngờ lắm, treo P2. P5 cũng đáng ngờ");
    openNomination(room);
    for (let i = 0; i < 40; i++) {
      expect(choiceOf(room, ids[0], intel)).not.toBe(ids[1]);
      expect(choiceOf(room, ids[3], intel)).not.toBe(ids[4]);
    }
    openVerdict(room, ids[1]);
    let spares = 0;
    for (let i = 0; i < 40; i++) if (choiceOf(room, ids[0], intel) === "spare") spares++;
    expect(spares).toBeGreaterThanOrEqual(34);
  });

  it("the Minion never nominates a wolf and spares one on the stand", () => {
    const { room, ids } = setup(["minion", "werewolf", "villager", "villager", "villager"]);
    room.players.forEach((p) => (p.isBot = true));
    openNomination(room);
    for (let i = 0; i < 40; i++) expect(choiceOf(room, ids[0])).not.toBe(ids[1]);
    openVerdict(room, ids[1]);
    for (let i = 0; i < 20; i++) expect(choiceOf(room, ids[0])).toBe("spare");
  });

  it("the White Wolf lets the town hang a pack mate it already suspects; a plain wolf doesn't", () => {
    const { room, ids } = setup(["whiteWolf", "werewolf", "werewolf", "villager", "villager", "villager"]);
    room.players.forEach((p) => (p.isBot = true));
    const intel = newChatIntel();
    ingestChat(room, intel, ids[3], "Treo P2 đi");
    ingestChat(room, intel, ids[4], "Mình nghi P2");
    openVerdict(room, ids[1]);
    const white = Array.from({ length: 60 }, () => choiceOf(room, ids[0], intel));
    const plain = Array.from({ length: 60 }, () => choiceOf(room, ids[2], intel));
    expect(white.filter((c) => c === "execute").length).toBeGreaterThan(20);
    expect(plain.every((c) => c === "spare")).toBe(true);
  });

  it("the Arsonist would rather not hang a house he doused", () => {
    const { room, ids } = setup(["arsonist", "werewolf", "villager", "villager", "villager"]);
    room.players.forEach((p) => (p.isBot = true));
    room.game!.doused = [ids[2]];
    const intel = newChatIntel();
    ingestChat(room, intel, ids[3], "Treo P3 đi");
    ingestChat(room, intel, ids[4], "Mình nghi P3");
    openNomination(room);
    for (let i = 0; i < 40; i++) expect(choiceOf(room, ids[0], intel)).not.toBe(ids[2]);
  });
});
