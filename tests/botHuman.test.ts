import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import { botGameOverLine, botReplyLine, mistakeChance, newBotChatMemory, truthChance } from "../shared/botChat";
import { botDecide } from "../shared/bots";
import { ingestChat, newChatIntel } from "../shared/botIntel";
import { linesPerDay, personaOf, typingMs, voice, type Persona } from "../shared/botPersona";
import { canSpeak } from "../shared/social";
import type { RoleId, Room } from "../shared/types";

function setup(roles: RoleId[], locale: "vi" | "en" = "vi"): { room: Room; ids: string[] } {
  const room = createRoom("HUMAN", locale);
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i + 1}` }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  return { room, ids };
}

const teen: Persona = { talk: 0.5, style: "teen", temper: "calm", typo: 0, cps: 5 };
const proper: Persona = { talk: 0.5, style: "proper", temper: "calm", typo: 0, cps: 5 };

describe("bot honesty model", () => {
  it("the village never lies on purpose but sometimes trusts a hunch; wolves lie 60–80%", () => {
    const { room, ids } = setup(["werewolf", "werewolf", "seer", "villager", "villager", "bodyguard"]);
    for (const id of ids.slice(2)) {
      expect(truthChance(room, id)).toBe(1);
      expect(mistakeChance(room, id)).toBeGreaterThanOrEqual(0.15);
      expect(mistakeChance(room, id)).toBeLessThanOrEqual(0.35);
    }
    for (const id of ids.slice(0, 2)) {
      expect(truthChance(room, id)).toBeGreaterThanOrEqual(0.2);
      expect(truthChance(room, id)).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("bot personality", () => {
  it("is fixed for the whole game and within range", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager"]);
    for (const id of ids) {
      const p = personaOf(room, id);
      expect(personaOf(room, id)).toEqual(p);
      expect(p.talk).toBeGreaterThanOrEqual(0.2);
      expect(p.talk).toBeLessThanOrEqual(1);
      expect(linesPerDay(p)).toBeGreaterThanOrEqual(1);
      expect(linesPerDay(p)).toBeLessThanOrEqual(5);
    }
  });

  it("teen style uses chat shortcuts but keeps names and the words bots read", () => {
    const out = voice("Mình không nghi P1 được, vote P2 đi.", teen, "vi", ["P1", "P2"], () => 0);
    expect(out).toContain("ko");
    expect(out).toContain("đc");
    expect(out).not.toContain("không");
    expect(out).toContain("P1");
    expect(out).toContain("vote P2");
    expect(out.startsWith("mình")).toBe(true);
  });

  it("shortcuts only replace whole Vietnamese words", () => {
    // "gì" inside "gìn" must stay; the lone "gì" becomes "j".
    const out = voice("Giữ gìn gì cơ", teen, "vi", [], () => 0);
    expect(out).toContain("gìn");
    expect(out).toContain(" j ");
  });

  it("never doubles the last word with a tail", () => {
    const casual: Persona = { ...proper, style: "casual" };
    // rnd 0.1 → lower-case, add a tail; " đó" is the second tail option (index 1 with rnd 0.3).
    for (const r of [0, 0.1, 0.3, 0.6, 0.9]) expect(voice("Ừ đúng đó.", casual, "vi", [], () => r)).not.toMatch(/đó đó/);
  });

  it("proper style leaves the line as written", () => {
    expect(voice("Mình nghi P1.", proper, "vi", ["P1"], () => 0)).toBe("Mình nghi P1.");
  });

  it("a typo never lands in a player's name", () => {
    const typoed: Persona = { ...proper, style: "casual", typo: 1 };
    for (let i = 0; i < 50; i++) {
      const out = voice("Mình thấy Khoai Lang đáng ngờ lắm", typoed, "vi", ["Khoai Lang"], Math.random);
      expect(out).toContain("Khoai Lang");
    }
  });

  it("typing takes as long as a person would, within bounds", () => {
    expect(typingMs("ok", proper, () => 0)).toBe(1400);
    expect(typingMs("x".repeat(500), proper, () => 1)).toBe(14000);
    const short = typingMs("Mình nghi P1.", proper, () => 0.5);
    const long = typingMs("Mình nghĩ P1 là Sói vì đêm qua P1 bảo vệ người khác.", proper, () => 0.5);
    expect(long).toBeGreaterThan(short);
  });
});

describe("bots vote the way they talked", () => {
  it("a villager bot votes the player it accused in the chat", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager", "villager"]);
    for (const p of room.players) p.isBot = true;
    const intel = newChatIntel();
    ingestChat(room, intel, ids[2], "Mình nghi P4, treo P4 đi");
    room.game!.vote = { kind: "nominate", ballots: {}, closed: false, candidates: null, nomineeId: null };
    room.phase = { ...room.phase, kind: "nominate" };
    let same = 0;
    for (let i = 0; i < 100; i++) {
      const a = botDecide(room, ids[2], intel);
      if (a && a.type === "vote" && a.choice === ids[3]) same++;
    }
    expect(same).toBeGreaterThan(70);
  });

  it("a wolf may vote out a pack mate it already threw under the bus", () => {
    const { room, ids } = setup(["werewolf", "werewolf", "villager", "villager", "villager", "seer"]);
    for (const p of room.players) p.isBot = true;
    const intel = newChatIntel();
    for (const by of [ids[2], ids[3], ids[4]]) ingestChat(room, intel, by, "Treo P2 đi");
    ingestChat(room, intel, ids[0], "Mình cũng nghi P2, treo P2");
    room.game!.vote = { kind: "nominate", ballots: {}, closed: false, candidates: null, nomineeId: null };
    room.phase = { ...room.phase, kind: "nominate" };
    const choices = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const a = botDecide(room, ids[0], intel);
      if (a && a.type === "vote") choices.add(String(a.choice));
    }
    expect(choices.has(ids[1])).toBe(true);
  });
});

describe("bots reply and react", () => {
  it("an accused bot defends itself, and a bot asked who it suspects names someone", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager", "villager"]);
    const mem = newBotChatMemory();
    const bot = room.players[2];
    const defence = botReplyLine(room, bot, ids[0], `${bot.name} là sói, treo đi`, mem, newChatIntel(), () => 0);
    expect(defence).toMatch(/sao/i);
    const named = botReplyLine(room, bot, ids[3], "Mọi người nghi ai là sói?", mem, newChatIntel(), () => 0.1);
    expect(named).toBeTruthy();
    // Asked by name who the wolf is: an answer, not "why me?".
    const answer = botReplyLine(room, bot, ids[3], `${bot.name} ơi, bạn nghi ai là sói?`, mem, newChatIntel(), () => 0.1);
    expect(answer).not.toMatch(/sao (lại|nghi) mình/i);
    expect(botReplyLine(room, bot, bot.id, "hello", mem)).toBeNull();
  });

  it("says gg at game over, winners and losers differently", () => {
    const { room } = setup(["werewolf", "villager", "villager", "villager"], "en");
    expect(botGameOverLine(room, room.players[1])).toBeNull(); // no winner yet
    room.game!.winner = "village";
    const win = botGameOverLine(room, room.players[1], () => 0.9);
    const lose = botGameOverLine(room, room.players[0], () => 0.9);
    expect(win).toMatch(/gg|won/i);
    expect(lose).toMatch(/gg|close/i);
    expect(win).not.toBe(lose);
    // Three winners at one table never say the same line.
    const used = new Set<string>();
    const lines = [1, 2, 3].map((i) => botGameOverLine(room, room.players[i], () => 0.9, used));
    expect(new Set(lines).size).toBe(3);
  });

  it("reads a bare 'ngốc' as a Village Idiot claim", () => {
    const room = createRoom("IDIOT", "vi");
    const ids = ["P1", "P2", "P3"].map((name) => addPlayer(room, { name }).player!.id);
    const intel = newChatIntel();
    ingestChat(room, intel, ids[1], "Mình là ngốc nha");
    ingestChat(room, intel, ids[2], "Ai cũng ngốc");
    expect(intel.claims[ids[1]]).toEqual(["idiot"]);
    expect(intel.claims[ids[2]]).toBeUndefined();
  });

  it("the dead can chat again once the game is over", () => {
    const { room, ids } = setup(["werewolf", "villager", "villager", "villager"]);
    room.players[1].alive = false;
    room.phase = { ...room.phase, kind: "discussion" };
    expect(canSpeak(room, { kind: "player", playerId: ids[1] })).not.toBeNull();
    room.phase = { ...room.phase, kind: "gameOver" };
    expect(canSpeak(room, { kind: "player", playerId: ids[1] })).toBeNull();
  });
});
