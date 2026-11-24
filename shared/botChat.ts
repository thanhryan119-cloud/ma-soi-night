// What bots say in the chat, played like real people.
//
// The village never lies on purpose: villagers tell what they know, and get
// things wrong instead (a bad read, a hunch about the wrong person). Wolves lie
// when it matters (when they are accused, when a Seer exposes them, to discredit
// a real Seer) and blend in the rest of the time; a wolf may even turn on a pack
// mate the town has already caught, to look innocent. Everyone reacts to the
// night's deaths and yesterday's hanging, answers people who talk to them, and
// writes in their own voice (see botPersona). What a bot accuses in the chat
// is read back by botIntel, and bots vote the way they talked (see bots.ts).

import { accusersOf, newChatIntel, ranked, suspicion, topThreat, type ChatIntel, type Reason } from "./botIntel";
import { filler, hash01, personaOf, pickFrom, voice, type Rnd } from "./botPersona";
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
  /** Verdicts already reacted to (index into game.verdicts). */
  seenVerdicts: number;
  /** How many verdicts there were when this day's discussion began. */
  verdictsAtDayStart: number;
}

export const newBotChatMemory = (): BotChatMemory => ({ claims: {}, said: {}, texts: {}, recent: [], day: -1, seenVerdicts: 0, verdictsAtDayStart: 0 });

const pick = <T,>(rnd: Rnd, xs: T[]): T => pickFrom(rnd, xs);
const key = (room: Room, botId: string, trait: string) => hash01(`${room.code}:${room.createdAt}:${botId}:${trait}`);

/**
 * How often a bot's line is true. Wolves: 20–40% (the rest are lies, mostly at
 * the moments that matter). The village never lies on purpose: 100%.
 */
export function truthChance(room: Room, botId: string): number {
  const role = room.game?.roles[botId];
  return isWolfRole(role) ? 0.2 + key(room, botId, "truth") * 0.2 : 1;
}

/** How often a village bot trusts a hunch over the evidence (an honest mistake). */
export const mistakeChance = (room: Room, botId: string) => 0.15 + key(room, botId, "mistake") * 0.2;

const T = {
  vi: {
    roles: { werewolf: "Sói", villager: "Dân làng", seer: "Tiên tri", bodyguard: "Bảo vệ", witch: "Phù thủy", hunter: "Thợ săn", cupid: "Cupid", cursedWolf: "Sói Nguyền", wolfSeer: "Sói Tiên Tri", elder: "Già làng", idiot: "Thằng Ngốc", lycan: "Người Sói Lai", sister: "Chị Em", wildChild: "Đứa Trẻ Hoang", medium: "Thầy Đồng", mayor: "Trưởng Làng", bigBadWolf: "Sói To Xấu Xa", minion: "Kẻ Phản Bội", knight: "Hiệp Sĩ Rỉ Sét", silencer: "Sói Bịt Miệng", tanner: "Kẻ Chán Đời", whiteWolf: "Sói Trắng", serialKiller: "Sát Nhân Hàng Loạt", arsonist: "Kẻ Phóng Hỏa" } as Record<RoleId, string>,
    claim: ["Nói thật nhé, mình là {role}.", "Mình là {role}, mọi người tin mình đi.", "Mình xin lộ bài: mình là {role}."],
    seerTrue: ["Đêm {n} mình soi {name}: {verdict}.", "Mình là Tiên tri. Đêm {n} soi {name}, kết quả: {verdict}."],
    isWolf: "là Sói",
    notWolf: "không phải Sói",
    accuse: ["Mình thấy {name} đáng ngờ lắm.", "{name} nói chuyện lạ lắm, mình nghi {name}.", "Hôm nay mình vote {name}."],
    hunch: ["Không hiểu sao mình cứ nghi {name}.", "Linh cảm của mình là {name}, hôm nay mình vote {name}.", "Mình thấy {name} im im, nghi {name} ghê."],
    urge: ["Treo {name} đi, chắc chắn {name} là Sói!", "{name} là Sói đấy, đừng để {name} thoát!", "Mọi người vote {name} đi, mình chắc chắn luôn."],
    defend: ["{name} là người tốt, mình bảo đảm.", "Đừng nghi {name}, {name} không phải Sói đâu."],
    bus: ["Ừ mình cũng thấy {name} đáng ngờ, vote {name} đi.", "Nhiều người nghi {name} rồi, mình cũng nghi {name}."],
    unsure: ["Mình chưa có thông tin gì chắc chắn.", "Mình cũng đang rối, chưa biết tin ai.", "Mình hơi nghi {name} nhưng chưa chắc lắm."],
    death: ["Trời ơi {name} 😭", "Huhu {name} đi rồi.", "Tội {name} quá, đêm qua {name} ra đi.", "{name} chết rồi… ai có manh mối gì không?"],
    quiet: ["Đêm qua không ai chết, Bảo vệ hoặc Phù thủy làm tốt quá.", "Yên bình ghê, đêm qua không ai chết.", "Không ai chết à? Lạ thật."],
    hangWrong: ["Hôm qua treo {name} mà đêm qua vẫn có người chết, chắc treo nhầm rồi 😢", "Vậy là {name} oan rồi, Sói vẫn còn đó."],
    hangRight: ["Treo {name} xong đêm qua yên bình, chắc đúng Sói rồi.", "Có khi hôm qua treo đúng {name} thật."],
    spared: ["Hôm qua tha {name}, mong là không sai.", "Hôm qua tha {name}, hôm nay để ý {name} nha."],
    agreeReport: ["{by} soi ra {name} là Sói, mình tin {by}. Treo {name} đi!", "Tiên tri {by} đã nói {name} là Sói rồi, còn chờ gì nữa?"],
    fakeSeer: ["{name} nhận Tiên tri là nói dối! Tiên tri thật là mình.", "Đừng tin {name}, {name} không phải Tiên tri đâu — mình mới là Tiên tri."],
    counterClaim: ["Cả {name} và {other} đều nhận là {role}, một trong hai đang nói dối!", "Hai người cùng nhận {role}: {name} và {other}. Có Sói trong đó rồi."],
    accusedMe: ["Mình không phải Sói! {name} đang đổ oan cho mình.", "{name} buộc tội mình vô căn cứ, chính {name} mới đáng ngờ."],
    crowd: ["Nhiều người nghi {name} rồi, mình cũng nghi.", "{name} bị {count} người nghi, chắc không phải ngẫu nhiên đâu."],
    fakeOfSeer: ["{name} là Tiên tri giả đấy, treo {name} đi!", "Đừng tin {name}, {name} nhận bừa Tiên tri để lừa làng."],
    // Replies to someone who spoke to the bot.
    whyMe: ["Ủa sao lại mình? Mình là {role} mà.", "Khoan, sao nghi mình? Mình là {role} thật đó."],
    whyMeBack: ["{name} buộc tội mình vậy, mình thấy {name} mới lạ.", "Mình vote {name} đó, tự nhiên đổ cho mình."],
    suspect: ["Mình nghi {name} nhất.", "Nếu phải chọn thì mình chọn {name}.", "Mình đang để ý {name}."],
    noIdea: ["Mình chưa biết nữa, đang nghe mọi người nói.", "Chưa chắc ai, mình cần thêm thông tin."],
    heard: ["Ừ mình nghe nè.", "Sao vậy {name}?", "Mình đây, nói đi {name}."],
    agree: ["Ừ đúng đó.", "Mình cũng nghĩ vậy.", "Hợp lý."],
    doubt: ["Chưa chắc đâu.", "Mình không nghĩ vậy.", "Khoan đã, vội quá."],
    // Game over.
    ggWin: ["gg mọi người!", "Thắng rồi 🎉", "gg, ván này hay ghê."],
    ggLose: ["gg, thua tâm phục.", "Tiếc thật, gg.", "gg, ván sau phục thù."],
    ggSneaky: ["Mình là Sói mà không ai nghi =))", "Hehe mình Sói từ đầu đó =))"],
    ggTricked: ["Trời ơi tin nhầm {name} 😭", "{name} diễn đỉnh thật, gg."],
  },
  en: {
    roles: { werewolf: "Werewolf", villager: "Villager", seer: "Seer", bodyguard: "Bodyguard", witch: "Witch", hunter: "Hunter", cupid: "Cupid", cursedWolf: "Cursed Wolf", wolfSeer: "Wolf Seer", elder: "Elder", idiot: "Village Idiot", lycan: "Lycan", sister: "Sister", wildChild: "Wild Child", medium: "Medium", mayor: "Mayor", bigBadWolf: "Big Bad Wolf", minion: "Minion", knight: "Rusty Knight", silencer: "Silencer", tanner: "Tanner", whiteWolf: "White Wolf", serialKiller: "Serial Killer", arsonist: "Arsonist" } as Record<RoleId, string>,
    claim: ["Honestly, I'm the {role}.", "I'm the {role}, trust me.", "Cards on the table: I'm the {role}."],
    seerTrue: ["Night {n} I checked {name}: {verdict}.", "I'm the Seer. Night {n} I checked {name} — {verdict}."],
    isWolf: "a Werewolf",
    notWolf: "not a Werewolf",
    accuse: ["{name} looks really suspicious to me.", "{name} is acting weird, I suspect {name}.", "I'm voting {name} today."],
    hunch: ["Can't explain it, but I suspect {name}.", "Gut feeling says {name}, I'm voting {name}.", "{name} is way too quiet, I suspect {name}."],
    urge: ["Hang {name}, {name} is definitely a wolf!", "{name} is a Werewolf, don't let {name} get away!", "Everyone vote {name}, I'm sure of it."],
    defend: ["{name} is good, I vouch for them.", "Leave {name} alone, {name} is not a wolf."],
    bus: ["Yeah, {name} looks suspicious to me too, vote {name}.", "Lots of people suspect {name}, I do too."],
    unsure: ["I don't have anything solid yet.", "I'm confused too, not sure who to trust.", "I kind of suspect {name}, but I'm not sure."],
    death: ["Oh no, {name} 😭", "RIP {name}.", "Poor {name}, we lost {name} last night.", "{name} is dead… anyone have a clue?"],
    quiet: ["Nobody died last night, nice work Bodyguard or Witch.", "Quiet night, nobody died.", "Nobody died? Weird."],
    hangWrong: ["We hanged {name} and someone still died, we got it wrong 😢", "So {name} was innocent, the wolves are still here."],
    hangRight: ["Quiet night after we hanged {name}, maybe we got a wolf.", "Maybe {name} really was a wolf."],
    spared: ["We spared {name} yesterday, hope that was right.", "We spared {name}, keep an eye on {name}."],
    agreeReport: ["{by} checked {name} as a wolf — I believe {by}. Hang {name}!", "Our Seer {by} already said {name} is a wolf, what are we waiting for?"],
    fakeSeer: ["{name} is lying about being the Seer! I'm the real Seer.", "Don't trust {name}, {name} is not the Seer — I am."],
    counterClaim: ["Both {name} and {other} claim {role} — one of them is lying!", "Two {role} claims: {name} and {other}. There's a wolf in there."],
    accusedMe: ["I'm not a wolf! {name} is framing me.", "{name} accused me out of nowhere — {name} is the suspicious one."],
    crowd: ["A lot of us suspect {name}, me too.", "{count} people suspect {name}, that's no coincidence."],
    fakeOfSeer: ["{name} is a fake Seer, hang {name}!", "Don't trust {name}, {name} made up that Seer claim to fool us."],
    whyMe: ["Wait, why me? I'm the {role}.", "Why suspect me? I really am the {role}."],
    whyMeBack: ["{name} accusing me like that, {name} is the weird one.", "I'm voting {name}, out of nowhere {name} blames me."],
    suspect: ["I suspect {name} the most.", "If I had to pick, {name}.", "I'm watching {name}."],
    noIdea: ["Not sure yet, still listening.", "No idea yet, I need more info."],
    heard: ["Yeah, I'm here.", "What's up {name}?", "Go on {name}."],
    agree: ["Yeah, true.", "I think so too.", "Makes sense."],
    doubt: ["Not so sure.", "I don't think so.", "Wait, too fast."],
    ggWin: ["gg everyone!", "We won 🎉", "gg, great game."],
    ggLose: ["gg, fair win.", "So close, gg.", "gg, rematch next time."],
    ggSneaky: ["I was a wolf and nobody noticed =))", "Hehe, wolf from the start =))"],
    ggTricked: ["Can't believe I trusted {name} 😭", "{name} played that so well, gg."],
  },
};

type Lines = (typeof T)["vi"];

function fill(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

const nameOf = (room: Room, id: string) => room.players.find((p) => p.id === id)?.name ?? "?";
const langOf = (room: Room): "vi" | "en" => ((room.locale as Locale) === "en" ? "en" : "vi");

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

/** The first thing said today: last night's deaths, or how yesterday's vote turned out. */
function reaction(room: Room, L: Lines, mem: BotChatMemory, rnd: Rnd): string | null {
  const game = room.game!;
  const dead = game.lastDeaths[0] && room.players.find((p) => p.id === game.lastDeaths[0].playerId);
  const verdict = game.verdicts.length > mem.seenVerdicts ? game.verdicts[game.verdicts.length - 1] : null;
  if (verdict && room.phase.day > 1 && rnd() < 0.5) {
    const name = nameOf(room, verdict.nomineeId);
    if (!verdict.executed) return fill(pick(rnd, L.spared), { name });
    return fill(pick(rnd, game.lastDeaths.length ? L.hangWrong : L.hangRight), { name });
  }
  if (dead) return fill(pick(rnd, L.death), { name: dead.name });
  if (room.phase.day > 1) return pick(rnd, L.quiet);
  return null;
}

/** One candidate line (may repeat; botChatLine filters repeats). Raw, before the bot's own voice. */
function compose(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel, rnd: Rnd, said: number): string | null {
  const game = room.game!;
  const L = T[langOf(room)];
  const role = game.roles[bot.id];
  const isWolf = isWolfRole(role);
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  if (!others.length) return null;
  const wolves = new Set(room.players.filter((p) => isWolfRole(game.roles[p.id])).map((p) => p.id));
  const innocents = others.filter((p) => !wolves.has(p.id));
  const packmates = others.filter((p) => wolves.has(p.id));
  const claimed = mem.claims[bot.id];
  const accusers = accusersOf(intel, bot.id).filter((id) => id !== bot.id);
  const pressured = accusers.length > 0 || intel.reports.some((r) => r.targetId === bot.id && r.isWolf);

  // A real Seer with a wolf in its results speaks up; innocent results wait for a reason.
  const results = game.seerResults[bot.id] ?? [];
  if (role === "seer" && results.length) {
    const wolfResult = results.find((r) => r.isWolf && room.players.find((p) => p.id === r.targetId)?.alive);
    const r = wolfResult ?? (pressured || room.phase.day >= 3 ? pick(rnd, results) : null);
    if (r && rnd() < (wolfResult ? 0.85 : 0.5)) {
      mem.claims[bot.id] = "seer";
      return fill(pick(rnd, L.seerTrue), { n: r.night, name: nameOf(room, r.targetId), verdict: r.isWolf ? L.isWolf : L.notWolf });
    }
  }

  // The day opens with feelings: who died, or how yesterday's vote went.
  if (said === 0 && rnd() < 0.75) {
    const r = reaction(room, L, mem, rnd);
    if (r) return r;
  }
  // Now and then just a short "hmm" or "wait what", like people do.
  if (said > 0 && rnd() < 0.12) return filler(personaOf(room, bot.id), langOf(room), rnd);

  if (isWolf) {
    // Lies when it matters: accused, or a Seer is talking.
    if (pressured && rnd() < 0.8) {
      const reporter = intel.reports.find((r) => r.targetId === bot.id && r.isWolf)?.by;
      if (reporter && rnd() < 0.6) return fill(pick(rnd, L.fakeOfSeer), { name: nameOf(room, reporter) });
      if (!claimed && rnd() < 0.5) {
        const fake = pick<RoleId>(rnd, ["villager", "villager", "bodyguard", "seer"]);
        mem.claims[bot.id] = fake;
        return fill(pick(rnd, L.claim), { role: L.roles[fake] });
      }
      return fill(pick(rnd, L.accusedMe), { name: nameOf(room, pick(rnd, accusers.length ? accusers : others.map((p) => p.id))) });
    }
    const seerClaimant = innocents.find((p) => intel.claims[p.id]?.at(-1) === "seer");
    if (seerClaimant && rnd() < 0.45) return fill(pick(rnd, L.fakeOfSeer), { name: seerClaimant.name });
    // Throw a doomed pack mate under the bus to look innocent.
    const doomed = packmates.find((p) => accusersOf(intel, p.id).length >= 3);
    if (doomed && !pressured && rnd() < 0.4) return fill(pick(rnd, L.bus), { name: doomed.name });
    // Otherwise mostly blend in, and push the most dangerous innocent now and then.
    if (rnd() < truthChance(room, bot.id) + 0.3) {
      const crowdPick = innocents.map((p) => p.id).sort((a, b) => accusersOf(intel, b).length - accusersOf(intel, a).length)[0];
      if (crowdPick && accusersOf(intel, crowdPick).length >= 2) return fill(pick(rnd, L.crowd), { name: nameOf(room, crowdPick), count: accusersOf(intel, crowdPick).length });
      return fill(pick(rnd, L.unsure), { name: pick(rnd, innocents.length ? innocents : others).name });
    }
    const threatId = topThreat(room, intel, innocents.map((p) => p.id));
    const victim = threatId ? room.players.find((p) => p.id === threatId)! : pick(rnd, innocents.length ? innocents : others);
    const accusedMate = packmates.find((p) => intel.accuse.some((a) => a.targetId === p.id));
    if (accusedMate && rnd() < 0.3) return fill(pick(rnd, L.defend), { name: accusedMate.name });
    return fill(pick(rnd, rnd() < 0.5 ? L.urge : L.accuse), { name: victim.name });
  }

  // The village: honest, sometimes wrong.
  if (pressured && rnd() < 0.7) {
    if (!claimed && rnd() < 0.6 && role !== "seer") {
      mem.claims[bot.id] = role;
      return fill(pick(rnd, L.claim), { role: L.roles[role] });
    }
    return fill(pick(rnd, L.accusedMe), { name: nameOf(room, pick(rnd, accusers.length ? accusers : others.map((p) => p.id))) });
  }
  if (rnd() < mistakeChance(room, bot.id)) return fill(pick(rnd, L.hunch), { name: pick(rnd, others).name });
  const read = suspicion(room, intel, bot.id);
  const top = ranked(read, others.map((p) => p.id))[0];
  if (top && read.score.get(top)! > 1 && rnd() < 0.75) {
    const line = reasonLine(room, L, rnd, top, read.reasons.get(top));
    if (line) return line;
    return fill(pick(rnd, L.accuse), { name: nameOf(room, top) });
  }
  if (!claimed && role !== "seer" && rnd() < 0.2) {
    mem.claims[bot.id] = role;
    return fill(pick(rnd, L.claim), { role: L.roles[role] });
  }
  return fill(pick(rnd, L.unsure), { name: nameOf(room, top ?? pick(rnd, others).id) });
}

/** Names that must survive the bot's writing style untouched. */
const namesIn = (room: Room) => room.players.map((p) => p.name);

/**
 * One chat line for `bot`, in its own voice, or null when it has nothing new
 * to say. Never repeats a line the bot already said today or one another bot
 * just said. `mem` is updated (claims, lines said today).
 */
export function botChatLine(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel = newChatIntel(), rnd: Rnd = Math.random): string | null {
  if (!room.game || !bot.alive) return null;
  const said = mem.said[bot.id] ?? 0;
  const mine = (mem.texts[bot.id] ??= []);
  for (let attempt = 0; attempt < 6; attempt++) {
    const claimsBefore = { ...mem.claims };
    const raw = compose(room, bot, mem, intel, rnd, said);
    if (!raw) return null;
    if (mine.includes(raw) || mem.recent.includes(raw)) {
      mem.claims = claimsBefore;
      continue;
    }
    mem.said[bot.id] = said + 1;
    mine.push(raw);
    mem.recent.push(raw);
    if (mem.recent.length > 8) mem.recent.shift();
    return voice(raw, personaOf(room, bot.id), langOf(room), namesIn(room), rnd);
  }
  return null;
}

const ACCUSING = /(nghi|đáng ngờ|treo|vote|sói|wolf|sus|suspicious|hang|lynch|giả|fake|nói dối|lying)/i;
const ASKS_WHO = /(ai là sói|nghi ai|vote ai|treo ai|ai đáng ngờ|who.*(wolf|sus)|who do you|who are you voting)/i;
const QUESTION = /(\?|(?<!\p{L})(sao|gì|ai|why|what|who|how)(?!\p{L}))/iu;

/**
 * A bot answering someone who just spoke (a scripted reply, used when the AI
 * bots are off): defends itself when accused, names a suspect when asked, and
 * otherwise agrees, doubts or simply answers. Null when it has nothing to add.
 */
export function botReplyLine(room: Room, bot: Player, fromId: string, text: string, mem: BotChatMemory, intel: ChatIntel = newChatIntel(), rnd: Rnd = Math.random): string | null {
  const game = room.game;
  if (!game || !bot.alive || fromId === bot.id) return null;
  const L = T[langOf(room)];
  const from = nameOf(room, fromId);
  const role = game.roles[bot.id];
  const wolf = isWolfRole(role);
  const named = text.toLowerCase().includes(bot.name.toLowerCase());
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  let raw: string | null = null;
  // "Who do you suspect?" mentions wolves too, so a question is answered before it is taken as an accusation.
  const asked = ASKS_WHO.test(text);
  if (named && !asked && ACCUSING.test(text)) {
    // Accused: the village says its real role, a wolf keeps to its cover story.
    let shown = mem.claims[bot.id] ?? (wolf ? "villager" : role);
    if (!wolf && shown === "seer" && !(game.seerResults[bot.id] ?? []).length) shown = role;
    mem.claims[bot.id] = shown;
    raw = rnd() < 0.6 ? fill(pick(rnd, L.whyMe), { role: L.roles[shown] }) : fill(pick(rnd, L.whyMeBack), { name: from });
  } else if (asked || (named && QUESTION.test(text))) {
    const pool = others.map((p) => p.id).filter((id) => !(wolf && isWolfRole(game.roles[id])));
    const target = wolf ? topThreat(room, intel, pool) : ranked(suspicion(room, intel, bot.id), pool)[0];
    raw = target && rnd() < 0.8 ? fill(pick(rnd, L.suspect), { name: nameOf(room, target) }) : pick(rnd, L.noIdea);
  } else if (named) {
    raw = fill(pick(rnd, L.heard), { name: from });
  } else if (rnd() < 0.5) {
    raw = pick(rnd, rnd() < 0.6 ? L.agree : L.doubt);
  }
  return raw && voice(raw, personaOf(room, bot.id), langOf(room), namesIn(room), rnd);
}

/**
 * What a bot says when the game ends, if anything (winners cheer, losers sigh).
 * Lines in `used` (shared by the table) are skipped while others are left.
 */
export function botGameOverLine(room: Room, bot: Player, rnd: Rnd = Math.random, used: Set<string> = new Set()): string | null {
  const game = room.game;
  if (!game?.winner) return null;
  const L = T[langOf(room)];
  const pick = (r: Rnd, xs: string[]) => {
    const fresh = xs.filter((x) => !used.has(x));
    const line = pickFrom(r, fresh.length ? fresh : xs);
    used.add(line);
    return line;
  };
  const role = game.roles[bot.id];
  const wolf = isWolfRole(role);
  const lover = game.lovers?.includes(bot.id);
  const won = game.winner === "lovers" ? !!lover : game.winner === "wolves" ? wolf : game.winner === "village" ? !wolf : false;
  let raw: string;
  if (won && wolf && rnd() < 0.5) raw = pick(rnd, L.ggSneaky);
  else if (!won && !wolf && rnd() < 0.4) {
    const liar = room.players.find((p) => p.id !== bot.id && isWolfRole(game.roles[p.id]));
    raw = liar ? fill(pick(rnd, L.ggTricked), { name: liar.name }) : pick(rnd, L.ggLose);
  } else raw = pick(rnd, won ? L.ggWin : L.ggLose);
  return voice(raw, personaOf(room, bot.id), langOf(room), namesIn(room), rnd);
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
  const lang = langOf(room);
  const D = DEFENSE[lang];
  const L = T[lang];
  const role = game.roles[bot.id];
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  const say = (raw: string) => voice(raw, personaOf(room, bot.id), lang, namesIn(room), rnd);
  if (said >= 2) return null;
  if (said === 1) {
    const wolves = new Set(room.players.filter((p) => isWolfRole(game.roles[p.id])).map((p) => p.id));
    const target = isWolfRole(role) ? topThreat(room, intel, others.filter((p) => !wolves.has(p.id)).map((p) => p.id)) : ranked(suspicion(room, intel, bot.id), others.map((p) => p.id))[0];
    return say(target ? fill(pick(rnd, D.accuse), { name: nameOf(room, target) }) : D.done);
  }
  const results = game.seerResults[bot.id] ?? [];
  if (role === "seer" && results.length) {
    const r = results[results.length - 1];
    return say(fill(pick(rnd, D.seer), { n: r.night, name: nameOf(room, r.targetId), verdict: r.isWolf ? L.isWolf : L.notWolf }));
  }
  const shownRole: RoleId = isWolfRole(role) ? "villager" : role;
  return say(fill(pick(rnd, D.innocent), { role: L.roles[shownRole] }));
}
