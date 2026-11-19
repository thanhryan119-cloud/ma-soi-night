// What bots say in the chat during the day discussion.
//
// Every bot gets an honesty level for the whole game: werewolves tell the
// truth only 20–40% of the time (so they lie and push to lynch innocents
// 60–80% of the time), the village tells the truth 80–100% of the time.
// Truthful lines are built from what that bot actually knows (its own role,
// the seer's real results, who died); lies are fake role claims, fake seer
// results and accusations against innocent players.

import type { Locale, Player, Room, RoleId } from "./types";

export interface BotChatMemory {
  /** Role each bot has publicly claimed, so it stays consistent. */
  claims: Record<string, RoleId>;
  /** Lines each bot has said today (per day number). */
  said: Record<string, number>;
  day: number;
}

export const newBotChatMemory = (): BotChatMemory => ({ claims: {}, said: {}, day: -1 });

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
  return role === "werewolf" ? 0.2 + k * 0.2 : 0.8 + k * 0.2;
}

const T = {
  vi: {
    roles: { werewolf: "Sói", villager: "Dân làng", seer: "Tiên tri", bodyguard: "Bảo vệ", witch: "Phù thủy", hunter: "Thợ săn", cupid: "Cupid" } as Record<RoleId, string>,
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
  },
  en: {
    roles: { werewolf: "Werewolf", villager: "Villager", seer: "Seer", bodyguard: "Bodyguard", witch: "Witch", hunter: "Hunter", cupid: "Cupid" } as Record<RoleId, string>,
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
  },
};

function fill(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/**
 * One chat line for `bot`, or null when it has nothing to say. `mem` is
 * updated (claims, lines said today).
 */
export function botChatLine(room: Room, bot: Player, mem: BotChatMemory, rnd: Rnd = Math.random): string | null {
  const game = room.game;
  if (!game || !bot.alive) return null;
  const L = T[(room.locale as Locale) === "en" ? "en" : "vi"];
  const role = game.roles[bot.id];
  const isWolf = role === "werewolf";
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  if (!others.length) return null;
  const wolves = new Set(room.players.filter((p) => game.roles[p.id] === "werewolf").map((p) => p.id));
  const innocents = others.filter((p) => !wolves.has(p.id));
  const packmates = others.filter((p) => wolves.has(p.id));
  const name = (p: Player) => p.name;
  const honest = rnd() < truthChance(room, bot.id);
  const claimed = mem.claims[bot.id];
  const said = mem.said[bot.id] ?? 0;
  mem.said[bot.id] = said + 1;

  if (honest) {
    if (isWolf) {
      // A wolf telling the truth: only harmless facts, never its own role.
      const dead = game.lastDeaths[0] && room.players.find((p) => p.id === game.lastDeaths[0].playerId);
      if (dead && said === 0) return fill(pick(rnd, L.death), { name: dead.name });
      if (!game.lastDeaths.length && said === 0 && room.phase.day > 1) return pick(rnd, L.quiet);
      return fill(L.unsure[Math.floor(rnd() * 2)], {});
    }
    // Seer shares real results.
    const results = (game.seerResults[bot.id] ?? []).filter((r) => room.players.some((p) => p.id === r.targetId));
    if (role === "seer" && results.length && rnd() < 0.85) {
      const r = results[results.length - 1];
      const target = room.players.find((p) => p.id === r.targetId)!;
      mem.claims[bot.id] = "seer";
      return fill(pick(rnd, L.seerTrue), { n: r.night, name: target.name, verdict: r.isWolf ? L.isWolf : L.notWolf });
    }
    if (!claimed && rnd() < 0.5) {
      mem.claims[bot.id] = role;
      return fill(pick(rnd, L.claim), { role: L.roles[role] });
    }
    const dead = game.lastDeaths[0] && room.players.find((p) => p.id === game.lastDeaths[0].playerId);
    if (dead && said === 0) return fill(pick(rnd, L.death), { name: dead.name });
    // An honest villager only voices a soft, uncertain suspicion.
    return fill(pick(rnd, L.unsure), { name: name(pick(rnd, others)) });
  }

  // Lies.
  if (isWolf) {
    const victim = innocents.length ? pick(rnd, innocents) : pick(rnd, others);
    const roll = rnd();
    if (!claimed && roll < 0.3) {
      const fake = pick<RoleId>(rnd, ["seer", "villager", "bodyguard", "villager"]);
      mem.claims[bot.id] = fake;
      return fill(pick(rnd, L.claim), { role: L.roles[fake] });
    }
    if ((claimed === "seer" || roll < 0.45) && innocents.length) {
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
