// What bots say in the chat during the day discussion.
//
// Every bot gets an honesty level for the whole game: werewolves tell the
// truth only 20–40% of the time (so they lie and push to lynch innocents
// 60–80% of the time), the village tells the truth 80–100% of the time.
// Truthful lines come from what that bot actually knows (its role, the Seer's
// real results, who died) and from what it read in the chat (claims, seer
// reports, accusations — see botIntel). Lies are fake role claims, fake seer
// results and accusations against innocents, aimed at whoever threatens the
// pack most.

import { newChatIntel, ranked, suspicion, topThreat, type ChatIntel, type Reason } from "./botIntel";
import { isWolf as isWolfRole } from "./roles";
import type { Locale, Player, Room, RoleId } from "./types";

export interface BotChatMemory {
  /** Role each bot has publicly claimed, so it stays consistent. */
  claims: Record<string, RoleId>;
  /** Lines each bot has said today. */
  said: Record<string, number>;
  /** Texts each bot has said today, and the room's recent bot lines, to avoid repeats. */
  texts: Record<string, string[]>;
  recent: string[];
  day: number;
}

export const newBotChatMemory = (): BotChatMemory => ({ claims: {}, said: {}, texts: {}, recent: [], day: -1 });

type Rnd = () => number;
const pick = <T,>(rnd: Rnd, xs: T[]): T => xs[Math.floor(rnd() * xs.length)];

/** Stable 0..1 number from a string (so a bot's honesty doesn't change mid-game). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Probability that this bot tells the truth in a given line. */
export function truthChance(room: Room, botId: string): number {
  const role = room.game?.roles[botId];
  const k = hash01(`${room.code}:${room.createdAt}:${botId}`);
  return isWolfRole(role) ? 0.2 + k * 0.2 : 0.8 + k * 0.2;
}

const T = {
  vi: {
    roles: { werewolf: "Sói", villager: "Dân làng", seer: "Tiên tri", bodyguard: "Bảo vệ", witch: "Phù thủy", hunter: "Thợ săn", cupid: "Cupid", cursedWolf: "Sói Nguyền", wolfSeer: "Sói Tiên Tri", elder: "Già làng", idiot: "Thằng Ngốc" } as Record<RoleId, string>,
    claim: ["Nói thật nhé, mình là {role}.", "Mình là {role}, mọi người tin mình đi.", "Mình xin lộ bài: mình là {role}."],
    seerTrue: ["Đêm {n} mình soi {name}: {verdict}.", "Mình là Tiên tri. Đêm {n} soi {name}, kết quả: {verdict}."],
    isWolf: "là Sói",
    notWolf: "không phải Sói",
    accuse: ["Mình thấy {name} đáng ngờ lắm.", "{name} nói chuyện lạ lắm, mình nghi {name}.", "Hôm nay mình vote {name}."],
    urge: ["Treo {name} đi, chắc chắn {name} là Sói!", "{name} là Sói đấy, đừng để {name} thoát!", "Mọi người vote {name} đi, mình chắc chắn luôn."],
    defend: ["{name} là người tốt, mình bảo đảm.", "Đừng nghi {name}, {name} không phải Sói đâu."],
    unsure: ["Mình chưa có thông tin gì chắc chắn.", "Mình cũng đang rối, chưa biết tin ai.", "Mình hơi nghi {name} nhưng chưa chắc lắm."],
    death: ["Tội nghiệp {name}, đêm qua {name} đã ra đi.", "{name} chết rồi… ai có manh mối gì không?"],
    quiet: ["Đêm qua yên bình quá, đáng ngờ thật.", "Không ai chết à? Chắc Bảo vệ hoặc Phù thủy làm tốt việc rồi."],
    // Lines that react to the table talk.
    agreeReport: ["{by} soi ra {name} là Sói, mình tin {by}. Treo {name} đi!", "Tiên tri {by} đã nói {name} là Sói rồi, còn chờ gì nữa?"],
    fakeSeer: ["{name} nhận Tiên tri là nói dối! Tiên tri thật là mình.", "Đừng tin {name}, {name} không phải Tiên tri đâu — mình mới là Tiên tri."],
    counterClaim: ["Cả {name} và {other} đều nhận là {role}, một trong hai đang nói dối!", "Hai người cùng nhận {role}: {name} và {other}. Có Sói trong đó rồi."],
    accusedMe: ["Mình không phải Sói! {name} đang đổ oan cho mình.", "{name} buộc tội mình vô căn cứ, chính {name} mới đáng ngờ."],
    crowd: ["Nhiều người nghi {name} rồi, mình cũng nghi.", "{name} bị {count} người nghi, chắc không phải ngẫu nhiên đâu."],
    fakeOfSeer: ["{name} là Tiên tri giả đấy, treo {name} đi!", "Đừng tin {name}, {name} nhận bừa Tiên tri để lừa làng."],
  },
  en: {
    roles: { werewolf: "Werewolf", villager: "Villager", seer: "Seer", bodyguard: "Bodyguard", witch: "Witch", hunter: "Hunter", cupid: "Cupid", cursedWolf: "Cursed Wolf", wolfSeer: "Wolf Seer", elder: "Elder", idiot: "Village Idiot" } as Record<RoleId, string>,
    claim: ["Honestly, I'm the {role}.", "I'm the {role}, trust me.", "Cards on the table: I'm the {role}."],
    seerTrue: ["Night {n} I checked {name}: {verdict}.", "I'm the Seer. Night {n} I checked {name} — {verdict}."],
    isWolf: "a Werewolf",
    notWolf: "not a Werewolf",
    accuse: ["{name} looks really suspicious to me.", "{name} is acting weird, I suspect {name}.", "I'm voting {name} today."],
    urge: ["Hang {name}, {name} is definitely a wolf!", "{name} is a Werewolf, don't let {name} get away!", "Everyone vote {name}, I'm sure of it."],
    defend: ["{name} is good, I vouch for them.", "Leave {name} alone, {name} is not a wolf."],
    unsure: ["I don't have anything solid yet.", "I'm confused too, not sure who to trust.", "I kind of suspect {name}, but I'm not sure."],
    death: ["Poor {name}, we lost {name} last night.", "{name} is dead… anyone have a clue?"],
    quiet: ["Last night was too quiet, that's suspicious.", "Nobody died? The Bodyguard or Witch must have done well."],
    agreeReport: ["{by} checked {name} as a wolf — I believe {by}. Hang {name}!", "Our Seer {by} already said {name} is a wolf, what are we waiting for?"],
    fakeSeer: ["{name} is lying about being the Seer! I'm the real Seer.", "Don't trust {name}, {name} is not the Seer — I am."],
    counterClaim: ["Both {name} and {other} claim {role} — one of them is lying!", "Two {role} claims: {name} and {other}. There's a wolf in there."],
    accusedMe: ["I'm not a wolf! {name} is framing me.", "{name} accused me out of nowhere — {name} is the suspicious one."],
    crowd: ["A lot of us suspect {name}, me too.", "{count} people suspect {name}, that's no coincidence."],
    fakeOfSeer: ["{name} is a fake Seer, hang {name}!", "Don't trust {name}, {name} made up that Seer claim to fool us."],
  },
};

type Lines = (typeof T)["vi"];

function fill(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

const nameOf = (room: Room, id: string) => room.players.find((p) => p.id === id)?.name ?? "?";

/** A line explaining why the bot suspects someone, built from what it read. */
function reasonLine(room: Room, L: Lines, rnd: Rnd, id: string, reason: Reason | undefined): string | null {
  const name = nameOf(room, id);
  switch (reason?.kind) {
    case "ownCheck":
      return null; // handled by the Seer's own report
    case "report":
      return fill(pick(rnd, L.agreeReport), { by: nameOf(room, reason.by), name });
    case "fakeSeer":
      return fill(pick(rnd, L.fakeSeer), { name });
    case "counterClaim":
      return fill(pick(rnd, L.counterClaim), { name, other: nameOf(room, reason.other), role: L.roles[reason.role] });
    case "accusedMe":
      return fill(pick(rnd, L.accusedMe), { name });
    case "crowd":
      return fill(pick(rnd, L.crowd), { name, count: reason.count });
    default:
      return null;
  }
}

/** One candidate line (may repeat; botChatLine filters repeats). */
function compose(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel, rnd: Rnd, said: number): string | null {
  const game = room.game!;
  const L = T[(room.locale as Locale) === "en" ? "en" : "vi"];
  const role = game.roles[bot.id];
  const isWolf = isWolfRole(role);
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  if (!others.length) return null;
  const wolves = new Set(room.players.filter((p) => isWolfRole(game.roles[p.id])).map((p) => p.id));
  const innocents = others.filter((p) => !wolves.has(p.id));
  const packmates = others.filter((p) => wolves.has(p.id));
  const honest = rnd() < truthChance(room, bot.id);
  const claimed = mem.claims[bot.id];
  const dead = game.lastDeaths[0] && room.players.find((p) => p.id === game.lastDeaths[0].playerId);

  if (honest) {
    if (isWolf) {
      // A wolf telling the truth: only harmless facts, never its own role.
      if (dead && said === 0) return fill(pick(rnd, L.death), { name: dead.name });
      if (!game.lastDeaths.length && said === 0 && room.phase.day > 1) return pick(rnd, L.quiet);
      return fill(L.unsure[Math.floor(rnd() * 2)], {});
    }
    // Seer shares real results.
    const results = game.seerResults[bot.id] ?? [];
    if (role === "seer" && results.length && rnd() < 0.7) {
      const r = pick(rnd, results);
      mem.claims[bot.id] = "seer";
      return fill(pick(rnd, L.seerTrue), { n: r.night, name: nameOf(room, r.targetId), verdict: r.isWolf ? L.isWolf : L.notWolf });
    }
    // React to the table talk: say why the top suspect looks bad.
    const read = suspicion(room, intel, bot.id);
    const top = ranked(read, others.map((p) => p.id))[0];
    if (top && read.score.get(top)! > 1 && rnd() < 0.75) {
      const line = reasonLine(room, L, rnd, top, read.reasons.get(top));
      if (line) return line;
    }
    if (!claimed && rnd() < 0.45) {
      mem.claims[bot.id] = role;
      return fill(pick(rnd, L.claim), { role: L.roles[role] });
    }
    if (dead && said === 0) return fill(pick(rnd, L.death), { name: dead.name });
    // Otherwise only a soft, uncertain suspicion.
    return fill(pick(rnd, L.unsure), { name: nameOf(room, top ?? pick(rnd, others).id) });
  }

  // Lies.
  if (isWolf) {
    // Turn the town on whoever threatens the pack most.
    const threatId = topThreat(room, intel, innocents.map((p) => p.id));
    const victim = threatId ? room.players.find((p) => p.id === threatId)! : innocents.length ? pick(rnd, innocents) : pick(rnd, others);
    const accusedMate = packmates.find((p) => intel.accuse.some((a) => a.targetId === p.id));
    const victimClaimsSeer = intel.claims[victim.id]?.at(-1) === "seer";
    const roll = rnd();
    if (victimClaimsSeer && roll < 0.5) return fill(pick(rnd, L.fakeOfSeer), { name: victim.name });
    if (accusedMate && roll < 0.35) return fill(pick(rnd, L.defend), { name: accusedMate.name });
    if (!claimed && roll < 0.3) {
      const fake = pick<RoleId>(rnd, ["seer", "villager", "bodyguard", "villager"]);
      mem.claims[bot.id] = fake;
      return fill(pick(rnd, L.claim), { role: L.roles[fake] });
    }
    if (claimed === "seer" || roll < 0.5) {
      mem.claims[bot.id] = "seer";
      return fill(pick(rnd, L.seerTrue), { n: Math.max(1, room.phase.night), name: victim.name, verdict: L.isWolf });
    }
    if (packmates.length && roll < 0.6) return fill(pick(rnd, L.defend), { name: pick(rnd, packmates).name });
    return fill(pick(rnd, L.urge), { name: victim.name });
  }
  // A villager's (rare) lie: a false claim or a confident but baseless accusation.
  if (!claimed && rnd() < 0.4) {
    const fake = pick<RoleId>(rnd, ["seer", "bodyguard", "hunter"]);
    mem.claims[bot.id] = fake;
    return fill(pick(rnd, L.claim), { role: L.roles[fake] });
  }
  return fill(pick(rnd, [...L.accuse, ...L.urge]), { name: pick(rnd, others).name });
}

/**
 * One chat line for `bot`, or null when it has nothing new to say. Never
 * repeats a line the bot already said today or one another bot just said.
 * `mem` is updated (claims, lines said today).
 */
export function botChatLine(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel = newChatIntel(), rnd: Rnd = Math.random): string | null {
  if (!room.game || !bot.alive) return null;
  const said = mem.said[bot.id] ?? 0;
  const mine = (mem.texts[bot.id] ??= []);
  for (let attempt = 0; attempt < 6; attempt++) {
    const claimsBefore = { ...mem.claims };
    const line = compose(room, bot, mem, intel, rnd, said);
    if (!line) return null;
    if (mine.includes(line) || mem.recent.includes(line)) {
      mem.claims = claimsBefore;
      continue;
    }
    mem.said[bot.id] = said + 1;
    mine.push(line);
    mem.recent.push(line);
    if (mem.recent.length > 8) mem.recent.shift();
    return line;
  }
  return null;
}

const DEFENSE = {
  vi: {
    innocent: ["Mình không phải Sói đâu, mọi người đang treo nhầm người rồi!", "Mình là {role} thật đấy, treo mình là làng mất một người tốt.", "Nghĩ kỹ đi, mình cả buổi đều nói thật mà."],
    accuse: ["Người đáng treo là {name}, không phải mình.", "Mình nghi {name} hơn, hãy để ý {name}."],
    seer: ["Mình là Tiên tri, đêm {n} mình soi {name}: {verdict}. Đừng treo mình!"],
    done: "Mình nói xong rồi, mong mọi người sáng suốt.",
  },
  en: {
    innocent: ["I'm not a wolf, you're about to hang the wrong person!", "I really am the {role} — hang me and the village loses a good player.", "Think it through, I've been honest all day."],
    accuse: ["The one to hang is {name}, not me.", "I suspect {name} much more, watch {name}."],
    seer: ["I'm the Seer: night {n} I checked {name} — {verdict}. Don't hang me!"],
    done: "That's all from me, please choose wisely.",
  },
};

/**
 * What a bot on the stand says to save itself (scripted fallback when no AI).
 * Wolves lie about their role; the village tells the truth. Returns null once
 * the bot has said its piece (it should then end its defense).
 */
export function botDefenseLine(room: Room, bot: Player, said: number, intel: ChatIntel = newChatIntel(), rnd: Rnd = Math.random): string | null {
  const game = room.game;
  if (!game || !bot.alive) return null;
  const lang = (room.locale as Locale) === "en" ? "en" : "vi";
  const D = DEFENSE[lang];
  const L = T[lang];
  const role = game.roles[bot.id];
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  if (said >= 2) return null;
  if (said === 1) {
    const wolves = new Set(room.players.filter((p) => isWolfRole(game.roles[p.id])).map((p) => p.id));
    const target = isWolfRole(role) ? topThreat(room, intel, others.filter((p) => !wolves.has(p.id)).map((p) => p.id)) : ranked(suspicion(room, intel, bot.id), others.map((p) => p.id))[0];
    return target ? fill(pick(rnd, D.accuse), { name: nameOf(room, target) }) : D.done;
  }
  const results = game.seerResults[bot.id] ?? [];
  if (role === "seer" && results.length) {
    const r = results[results.length - 1];
    return fill(pick(rnd, D.seer), { n: r.night, name: nameOf(room, r.targetId), verdict: r.isWolf ? L.isWolf : L.notWolf });
  }
  const shownRole: RoleId = isWolfRole(role) ? "villager" : role;
  return fill(pick(rnd, D.innocent), { role: L.roles[shownRole] });
}
