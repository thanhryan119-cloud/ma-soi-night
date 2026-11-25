// What bots say in the chat, played like real people.
//
// Who lies depends on the side a bot plays for (chatSide):
// - The village never lies on purpose: villagers tell what they know, and get
//   things wrong instead (a bad read, a hunch about the wrong person). Power
//   roles the wolves would kill (HIDE_EARLY) keep quiet about their role until
//   they are seriously accused, then come out with what they know as proof.
//   The Lycan knows a real Seer sees it as a wolf; Sisters and lovers vouch
//   for each other.
// - The pack and the Minion lie when it matters (when accused, when a Seer
//   exposes them, to discredit a real Seer, with fake Seer reports once they
//   have claimed Seer) and blend in the rest of the time; a wolf may even turn
//   on a pack mate the town has already caught. The White Wolf, who wants the
//   pack dead too, does that far more readily.
// - The Serial Killer and the Arsonist hide behind a harmless cover role and
//   help the town hang wolves, which clears their own way.
// - The Tanner wants to hang: vague, a dubious claim, a half-hearted defence.
// Everyone reacts to the night's deaths and yesterday's hanging, answers people
// who talk to them, and writes in their own voice (see botPersona). What a bot
// accuses in the chat is read back by botIntel, and bots vote the way they
// talked (see bots.ts).

import { accusersOf, newChatIntel, packKnowledge, ranked, suspicion, topThreat, type ChatIntel, type Reason } from "./botIntel";
import { filler, hash01, personaOf, pickFrom, voice, type Rnd } from "./botPersona";
import { isWolf as isWolfRole, teamOf } from "./roles";
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
  /** Made-up Seer results each fake Seer has announced (kept for the whole game). */
  fakeChecks: Record<string, FakeCheck[]>;
  /** Night results a bot has already told the table ("night:target"), for the whole game. */
  told: Record<string, string[]>;
}

export interface FakeCheck {
  day: number;
  night: number;
  targetId: string;
  isWolf: boolean;
}

export const newBotChatMemory = (): BotChatMemory => ({ claims: {}, said: {}, texts: {}, recent: [], day: -1, seenVerdicts: 0, verdictsAtDayStart: 0, fakeChecks: {}, told: {} });

const pick = <T,>(rnd: Rnd, xs: T[]): T => pickFrom(rnd, xs);
const key = (room: Room, botId: string, trait: string) => hash01(`${room.code}:${room.createdAt}:${botId}:${trait}`);

/**
 * Which way a bot plays the chat: the village tells the truth, everyone else
 * lies in their own way. The Minion is on the wolves' team without being in
 * the pack; the White Wolf is in the pack but plays for himself.
 */
export type ChatSide = "village" | "pack" | "whiteWolf" | "minion" | "solo" | "tanner";

export function chatSide(role: RoleId | undefined): ChatSide {
  if (role === "minion") return "minion";
  if (role === "tanner") return "tanner";
  if (role === "whiteWolf") return "whiteWolf";
  if (role === "serialKiller" || role === "arsonist") return "solo";
  if (isWolfRole(role)) return "pack";
  return "village";
}

/** Sides that lie about their role in the chat. */
export const liesInChat = (role: RoleId | undefined) => chatSide(role) !== "village";
/** Sides that know the pack and shield it. */
export const shieldsPack = (side: ChatSide) => side === "pack" || side === "whiteWolf" || side === "minion";

/** Village power roles that stay hidden until seriously accused (the wolves would kill them). */
export const HIDE_EARLY: RoleId[] = ["bodyguard", "witch", "mayor", "knight", "medium", "wildChild"];

/** Roles dealt this game (what the table can know from the setup). */
const dealt = (room: Room) => new Set<RoleId>(Object.values(room.game!.originalRoles ?? room.game!.roles));

/**
 * The role a liar claims when it has to say one, fixed for the game: the
 * Minion likes a Seer claim (the Seer sees him as a villager), the Tanner a
 * contested power role (a counter-claim gets him hanged), the rest Villager.
 */
export function coverRole(room: Room, botId: string): RoleId {
  const side = chatSide(room.game?.roles[botId]);
  const roles = room.game ? dealt(room) : new Set<RoleId>();
  const k = key(room, botId, "cover");
  if (side === "minion" && roles.has("seer") && k < 0.5) return "seer";
  if (side === "tanner" && k < 0.5) {
    const contested = (["bodyguard", "witch", "hunter"] as RoleId[]).filter((r) => roles.has(r));
    if (contested.length) return contested[Math.floor(k * 2 * contested.length)];
  }
  return "villager";
}

/**
 * How often a bot's line is true. Liars: 20–40% (the rest are lies, mostly at
 * the moments that matter). The village never lies on purpose: 100%.
 */
export function truthChance(room: Room, botId: string): number {
  const role = room.game?.roles[botId];
  return liesInChat(role) ? 0.2 + key(room, botId, "truth") * 0.2 : 1;
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
    // Night knowledge said out loud, as proof.
    witchSave: "Mình là Phù thủy. Đêm {n} mình đã cứu {name}.",
    witchPoison: "Mình là Phù thủy. Đêm {n} mình đã đầu độc {name}.",
    guarded: "Mình là Bảo vệ. Đêm qua mình bảo vệ {name}.",
    mediumIs: "Mình là Thầy Đồng.",
    medium: ["Đêm {n} mình hỏi hồn {name}: {name} là {role}.", "Mình gọi hồn {name} rồi, {name} là {role} đó."],
    seerIs: "Mình là Tiên tri.",
    seerEach: "Đêm {n} mình soi {name}: {verdict}.",
    lycan: ["Mình là Người Sói Lai. {by} là Tiên tri thật, tin {by} đi. Mình vẫn phe làng mà!", "Bình tĩnh, mình là Người Sói Lai nên bị soi ra như vậy. Tin {by} đi, {by} là Tiên tri thật."],
    sister: ["{name} là chị em với mình, chắc chắn không phải Sói.", "Mình với {name} là Chị Em, mình bảo đảm {name} là người tốt."],
    // The Tanner wants the rope.
    tannerMeh: ["Ừ thì nghi mình cũng được, mình chả biết nói gì.", "Mình á? Ờ… chắc vậy, tùy mọi người.", "Mình không giải thích nhiều đâu, ai muốn vote thì vote."],
    tannerVague: ["Mình có thông tin nhưng chưa muốn nói.", "Hôm nay mình hơi lười, chắc vote bừa thôi.", "Mình đoán {name}, mà chắc gì đúng.", "Hừm, mình biết vài thứ đấy, mai nói."],
    // Replies to someone who spoke to the bot.
    whyMe: ["Ủa sao lại mình? Mình là {role} mà.", "Khoan, sao nghi mình? Mình là {role} thật đó."],
    whyMeNoRole: ["Ủa sao lại mình? Mình không phải Sói đâu.", "Khoan, nghi mình làm gì, mình phe làng mà."],
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
    ggSolo: ["Hehe mình là {role} đó, không ai đoán ra =))", "Một mình cân cả làng =))"],
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
    witchSave: "I'm the Witch. Night {n} I saved {name}.",
    witchPoison: "I'm the Witch. Night {n} I poisoned {name}.",
    guarded: "I'm the Bodyguard. Last night I protected {name}.",
    mediumIs: "I'm the Medium.",
    medium: ["Night {n} I spoke to {name}'s spirit: {name} was the {role}.", "I reached {name}'s spirit — {name} was the {role}."],
    seerIs: "I'm the Seer.",
    seerEach: "Night {n} I checked {name}: {verdict}.",
    lycan: ["I'm the Lycan. {by} is the real Seer, trust {by}. I'm still with the village!", "Easy — I'm the Lycan, that's why I show up as a wolf. Trust {by}, {by} is the real Seer."],
    sister: ["{name} is my Sister, definitely not a wolf.", "{name} and I are the Sisters — I vouch for {name}."],
    tannerMeh: ["Fine, suspect me, I don't know what to say.", "Me? Uh… whatever you think.", "I'm not explaining myself, vote how you like."],
    tannerVague: ["I know something but I'm not saying yet.", "Feeling lazy today, I'll probably vote at random.", "I'd guess {name}, but who knows.", "Hmm, I know a few things, tell you tomorrow."],
    whyMe: ["Wait, why me? I'm the {role}.", "Why suspect me? I really am the {role}."],
    whyMeNoRole: ["Wait, why me? I'm not a wolf.", "Why me? I'm on the village side."],
    whyMeBack: ["{name} accusing me like that, {name} is the weird one.", "I'm voting {name}, out of nowhere {name} blames me."],
    suspect: ["I suspect {name} the most.", "If I had to pick, {name}.", "I'm watching {name}."],
    noIdea: ["Not sure yet, still listening.", "No idea yet, I need more info."],
    heard: ["Yeah, I'm here.", "What's up {name}?", "Go on {name}."],
    agree: ["Yeah, true.", "I think so too.", "Makes sense."],
    doubt: ["Not so sure.", "I don't think so.", "Wait, too fast."],
    ggWin: ["gg everyone!", "We won 🎉", "gg, great game."],
    ggLose: ["gg, fair win.", "So close, gg.", "gg, rematch next time."],
    ggSneaky: ["I was a wolf and nobody noticed =))", "Hehe, wolf from the start =))"],
    ggSolo: ["Hehe, I was the {role} and nobody guessed =))", "Me against the whole village =))"],
    ggTricked: ["Can't believe I trusted {name} 😭", "{name} played that so well, gg."],
  },
};

type Lines = (typeof T)["vi"];

function fill(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

const nameOf = (room: Room, id: string) => room.players.find((p) => p.id === id)?.name ?? "?";
const langOf = (room: Room): "vi" | "en" => ((room.locale as Locale) === "en" ? "en" : "vi");
const aliveId = (room: Room, id: string | null | undefined) => !!id && !!room.players.find((p) => p.id === id)?.alive;

/**
 * People a bot knows are on its side, never accuses and never votes out: its
 * pack (for the pack and the Minion), its Sister, its lover, a Wild Child's model.
 */
export function alliesOf(room: Room, botId: string): Set<string> {
  const game = room.game!;
  const role = game.roles[botId];
  const out = new Set<string>();
  if (shieldsPack(chatSide(role))) for (const p of room.players) if (p.id !== botId && isWolfRole(game.roles[p.id])) out.add(p.id);
  if (role === "sister") for (const p of room.players) if (p.id !== botId && game.roles[p.id] === "sister") out.add(p.id);
  const model = role === "wildChild" ? game.wildModels?.[botId] : undefined;
  if (model) out.add(model);
  const partner = game.lovers?.includes(botId) ? game.lovers.find((id) => id !== botId) : undefined;
  if (partner) out.add(partner);
  return out;
}

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

/** The Witch's last potion, from the night log (what she knows she did). */
function witchPotion(room: Room, bot: Player): { save: boolean; night: number; target: string } | null {
  const e = [...room.log].reverse().find((l) => (l.key === "log.witchSave" || l.key === "log.witchPoison") && l.params.actor === bot.name);
  return e ? { save: e.key === "log.witchSave", night: e.night, target: String(e.params.target) } : null;
}

/** A Medium reading worth telling: a dead liar, a dead wolf, or a dead Seer claimant (confirmed or not). */
function mediumReading(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel) {
  const told = mem.told[bot.id] ?? [];
  const results = (room.game!.seerResults[bot.id] ?? []).filter((r) => r.roleId && !told.includes(`${r.night}:${r.targetId}`));
  const worth = (r: (typeof results)[number]) => {
    const claim = intel.claims[r.targetId]?.at(-1);
    return teamOf(r.roleId) !== "village" || (claim !== undefined && claim !== r.roleId) || claim === "seer";
  };
  return results.find(worth) ?? null;
}

/** "Mình là X" for a village bot, with its night knowledge as proof when it has some. */
function claimText(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel, L: Lines, rnd: Rnd): string {
  const game = room.game!;
  const role = game.roles[bot.id];
  if (role === "witch") {
    const w = witchPotion(room, bot);
    if (w) return fill(w.save ? L.witchSave : L.witchPoison, { n: w.night, name: w.target });
  }
  if (role === "bodyguard" && aliveId(room, game.bodyguardLast)) return fill(L.guarded, { name: nameOf(room, game.bodyguardLast!) });
  if (role === "medium") {
    const r = mediumReading(room, bot, mem, intel) ?? (game.seerResults[bot.id] ?? []).at(-1);
    if (r?.roleId) {
      (mem.told[bot.id] ??= []).push(`${r.night}:${r.targetId}`);
      return `${L.mediumIs} ${fill(pick(rnd, L.medium), { n: r.night, name: nameOf(room, r.targetId), role: L.roles[r.roleId] })}`;
    }
  }
  return fill(pick(rnd, L.claim), { role: L.roles[role] });
}

/** Every Seer result, one sentence each (so each is read as its own report). */
function seerAll(room: Room, bot: Player, L: Lines): string {
  const results = room.game!.seerResults[bot.id] ?? [];
  return [L.seerIs, ...results.map((r) => fill(L.seerEach, { n: r.night, name: nameOf(room, r.targetId), verdict: r.isWolf ? L.isWolf : L.notWolf }))].join(" ");
}

/** A role a pack bot or the Minion can claim without being caught out at once. */
function fakeClaim(room: Room, bot: Player, rnd: Rnd): RoleId {
  const side = chatSide(room.game!.roles[bot.id]);
  const roles = dealt(room);
  // The pack knows (from its Wolf Seer) which roles are taken by people still alive.
  const known = side === "minion" ? new Map<string, RoleId>() : packKnowledge(room);
  const taken = new Set([...known].filter(([id]) => aliveId(room, id)).map(([, r]) => r));
  const pool: RoleId[] = side === "minion" ? ["seer", "seer", "villager"] : ["villager", "villager", "bodyguard", "seer"];
  const ok = pool.filter((r) => r === "villager" || (roles.has(r) && !taken.has(r)));
  return pick(rnd, ok.length ? ok : ["villager"]);
}

/**
 * A made-up Seer result for a liar who claimed Seer, at most one a day: the
 * real Seer or the town's most dangerous innocent "is a wolf", or an accused
 * pack mate "is clean". Never contradicts an earlier fake result.
 */
function fakeReport(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel, L: Lines, rnd: Rnd, innocents: string[], packmates: string[]): string | null {
  const done = (mem.fakeChecks[bot.id] ??= []);
  if (done.some((c) => c.day === room.phase.day)) return null;
  const checked = new Set(done.map((c) => c.targetId));
  const realSeer = intel.reports.find((r) => r.targetId === bot.id && r.isWolf && aliveId(room, r.by) && !checked.has(r.by))?.by;
  const mate = packmates.find((id) => !checked.has(id) && accusersOf(intel, id).length > 0);
  let targetId: string | null;
  let isWolf: boolean;
  if (realSeer) [targetId, isWolf] = [realSeer, true];
  else if (mate && rnd() < 0.5) [targetId, isWolf] = [mate, false];
  else {
    targetId = topThreat(room, intel, innocents.filter((id) => !checked.has(id)));
    isWolf = rnd() < 0.6;
  }
  if (!targetId) return null;
  const night = Math.max(1, room.phase.night);
  done.push({ day: room.phase.day, night, targetId, isWolf });
  return fill(pick(rnd, L.seerTrue), { n: night, name: nameOf(room, targetId), verdict: isWolf ? L.isWolf : L.notWolf });
}

/** One candidate line (may repeat; botChatLine filters repeats). Raw, before the bot's own voice. */
function compose(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel, rnd: Rnd, said: number): string | null {
  const game = room.game!;
  const L = T[langOf(room)];
  const role = game.roles[bot.id];
  const side = chatSide(role);
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  if (!others.length) return null;
  const allies = alliesOf(room, bot.id);
  const wolves = new Set(room.players.filter((p) => isWolfRole(game.roles[p.id])).map((p) => p.id));
  const claimed = mem.claims[bot.id];
  const accusers = accusersOf(intel, bot.id).filter((id) => id !== bot.id);
  const reportedBy = intel.reports.find((r) => r.targetId === bot.id && r.isWolf)?.by;
  const pressured = accusers.length > 0 || !!reportedBy;
  const heavy = accusers.length >= 2 || !!reportedBy;
  const blame = () => nameOf(room, pick(rnd, accusers.length ? accusers : others.map((p) => p.id)));

  // A real Seer with a wolf in its results speaks up; innocent results wait for a reason.
  const results = game.seerResults[bot.id] ?? [];
  if (role === "seer" && results.length) {
    const wolfResult = results.find((r) => r.isWolf && aliveId(room, r.targetId));
    const r = wolfResult ?? (pressured || room.phase.day >= 3 ? pick(rnd, results) : null);
    if (r && rnd() < (wolfResult ? 0.85 : 0.5)) {
      mem.claims[bot.id] = "seer";
      return fill(pick(rnd, L.seerTrue), { n: r.night, name: nameOf(room, r.targetId), verdict: r.isWolf ? L.isWolf : L.notWolf });
    }
  }
  // A Medium with a telling reading (a dead wolf, a dead liar) shares it.
  if (role === "medium") {
    const r = mediumReading(room, bot, mem, intel);
    if (r?.roleId && rnd() < 0.6) {
      (mem.told[bot.id] ??= []).push(`${r.night}:${r.targetId}`);
      const line = fill(pick(rnd, L.medium), { n: r.night, name: nameOf(room, r.targetId), role: L.roles[r.roleId] });
      if (claimed === "medium") return line;
      mem.claims[bot.id] = "medium";
      return `${L.mediumIs} ${line}`;
    }
  }
  // The Lycan the Seer called a wolf explains, and backs the Seer.
  if (role === "lycan" && reportedBy && rnd() < 0.85) {
    mem.claims[bot.id] = "lycan";
    return fill(pick(rnd, L.lycan), { by: nameOf(room, reportedBy) });
  }

  // The day opens with feelings: who died, or how yesterday's vote went.
  if (said === 0 && rnd() < 0.75) {
    const r = reaction(room, L, mem, rnd);
    if (r) return r;
  }
  // Now and then just a short "hmm" or "wait what", like people do.
  if (said > 0 && rnd() < 0.12) return filler(personaOf(room, bot.id), langOf(room), rnd);

  // A Sister or a lover under fire gets vouched for.
  const friend = others.find((p) => allies.has(p.id) && !wolves.has(p.id) && accusersOf(intel, p.id).length > 0);
  if (friend && rnd() < 0.5) {
    if (role === "sister" && game.roles[friend.id] === "sister") return fill(pick(rnd, L.sister), { name: friend.name });
    return fill(pick(rnd, L.defend), { name: friend.name });
  }

  if (shieldsPack(side)) return liar(room, bot, mem, intel, rnd, L, { side, others, allies, wolves, claimed, accusers, reportedBy, pressured, blame });
  if (side === "tanner") {
    if (pressured && rnd() < 0.7) {
      if (!claimed && rnd() < 0.4) {
        mem.claims[bot.id] = coverRole(room, bot.id);
        return fill(pick(rnd, L.claim), { role: L.roles[mem.claims[bot.id]] });
      }
      return pick(rnd, L.tannerMeh);
    }
    if (!claimed && room.phase.day >= 2 && rnd() < 0.15) {
      mem.claims[bot.id] = coverRole(room, bot.id);
      return fill(pick(rnd, L.claim), { role: L.roles[mem.claims[bot.id]] });
    }
    return fill(pick(rnd, rnd() < 0.5 ? L.tannerVague : L.hunch), { name: pick(rnd, others).name });
  }
  if (side === "solo") {
    // Hides behind a cover role and helps the town hang wolves: they are in its way too.
    if (pressured && rnd() < 0.75) {
      if (!claimed && rnd() < 0.5) {
        mem.claims[bot.id] = coverRole(room, bot.id);
        return fill(pick(rnd, L.claim), { role: L.roles[mem.claims[bot.id]] });
      }
      return fill(pick(rnd, L.accusedMe), { name: blame() });
    }
    // The Arsonist keeps his doused houses alive for the fire.
    const doused = role === "arsonist" ? others.find((p) => (game.doused ?? []).includes(p.id) && accusersOf(intel, p.id).length > 0) : undefined;
    if (doused && rnd() < 0.3) return fill(pick(rnd, L.defend), { name: doused.name });
  }

  // The village (and the solo killers, minus the truth about themselves): honest reads, sometimes wrong.
  const pool = others.map((p) => p.id).filter((id) => !allies.has(id));
  if (side === "village" && pressured && rnd() < 0.7) {
    const hide = (HIDE_EARLY.includes(role) && !heavy) || role === "seer";
    if (!claimed && !hide && rnd() < 0.6) {
      mem.claims[bot.id] = role;
      return claimText(room, bot, mem, intel, L, rnd);
    }
    return fill(pick(rnd, L.accusedMe), { name: blame() });
  }
  if (rnd() < mistakeChance(room, bot.id)) return fill(pick(rnd, L.hunch), { name: nameOf(room, pick(rnd, pool.length ? pool : others.map((p) => p.id))) });
  const read = suspicion(room, intel, bot.id);
  const top = ranked(read, pool)[0];
  if (top && read.score.get(top)! > 1 && rnd() < 0.75) {
    const line = reasonLine(room, L, rnd, top, read.reasons.get(top));
    // A solo killer can't say "the real Seer is me".
    if (line && !(side === "solo" && read.reasons.get(top)?.kind === "fakeSeer")) return line;
    return fill(pick(rnd, L.accuse), { name: nameOf(room, top) });
  }
  if (side === "village" && !claimed && role !== "seer" && !HIDE_EARLY.includes(role) && rnd() < 0.2) {
    mem.claims[bot.id] = role;
    return fill(pick(rnd, L.claim), { role: L.roles[role] });
  }
  return fill(pick(rnd, L.unsure), { name: nameOf(room, top ?? pick(rnd, others).id) });
}

interface LiarCtx {
  side: ChatSide;
  others: Player[];
  allies: Set<string>;
  wolves: Set<string>;
  claimed: RoleId | undefined;
  accusers: string[];
  reportedBy: string | undefined;
  pressured: boolean;
  blame: () => string;
}

/** The pack, the White Wolf and the Minion: lie when it matters, blend in otherwise. */
function liar(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel, rnd: Rnd, L: Lines, c: LiarCtx): string {
  const innocents = c.others.filter((p) => !c.allies.has(p.id));
  const packmates = c.others.filter((p) => c.wolves.has(p.id)).map((p) => p.id);
  const white = c.side === "whiteWolf";
  // Lies when it matters: accused, or a Seer is talking.
  if (c.pressured && rnd() < 0.8) {
    if (c.reportedBy && rnd() < 0.6) {
      // Counter-claim Seer (if the role is in the game), else just call the Seer a fake.
      if (!c.claimed && dealt(room).has("seer") && rnd() < 0.4) {
        mem.claims[bot.id] = "seer";
        return fill(pick(rnd, L.fakeSeer), { name: nameOf(room, c.reportedBy) });
      }
      return fill(pick(rnd, L.fakeOfSeer), { name: nameOf(room, c.reportedBy) });
    }
    if (!c.claimed && rnd() < 0.5) {
      const fake = fakeClaim(room, bot, rnd);
      mem.claims[bot.id] = fake;
      return fill(pick(rnd, L.claim), { role: L.roles[fake] });
    }
    return fill(pick(rnd, L.accusedMe), { name: c.blame() });
  }
  // A fake Seer backs the claim with made-up results.
  if (c.claimed === "seer" && rnd() < 0.7) {
    const line = fakeReport(room, bot, mem, intel, L, rnd, innocents.map((p) => p.id), packmates);
    if (line) return line;
  }
  const seerClaimant = innocents.find((p) => intel.claims[p.id]?.at(-1) === "seer");
  if (seerClaimant && rnd() < 0.45) return fill(pick(rnd, L.fakeOfSeer), { name: seerClaimant.name });
  // Throw a doomed pack mate under the bus to look innocent (the White Wolf
  // wants them gone anyway, and needs less of an excuse).
  const doomed = c.others.find((p) => c.wolves.has(p.id) && accusersOf(intel, p.id).length >= (white ? 2 : 3));
  if (doomed && !c.pressured && rnd() < (white ? 0.7 : 0.4)) return fill(pick(rnd, L.bus), { name: doomed.name });
  // Otherwise mostly blend in, and push the most dangerous innocent now and then.
  if (rnd() < truthChance(room, bot.id) + 0.3) {
    const crowdPick = innocents.map((p) => p.id).sort((a, b) => accusersOf(intel, b).length - accusersOf(intel, a).length)[0];
    if (crowdPick && accusersOf(intel, crowdPick).length >= 2) return fill(pick(rnd, L.crowd), { name: nameOf(room, crowdPick), count: accusersOf(intel, crowdPick).length });
    return fill(pick(rnd, L.unsure), { name: pick(rnd, innocents.length ? innocents : c.others).name });
  }
  const threatId = topThreat(room, intel, innocents.map((p) => p.id));
  const victim = threatId ? room.players.find((p) => p.id === threatId)! : pick(rnd, innocents.length ? innocents : c.others);
  const accusedMate = c.others.find((p) => c.wolves.has(p.id) && intel.accuse.some((a) => a.targetId === p.id));
  if (accusedMate && rnd() < (white ? 0.1 : 0.3)) return fill(pick(rnd, L.defend), { name: accusedMate.name });
  return fill(pick(rnd, rnd() < 0.5 ? L.urge : L.accuse), { name: victim.name });
}

/** Names (and role names, so claims stay readable) that must survive the bot's writing style untouched. */
const namesIn = (room: Room) => [...room.players.map((p) => p.name), ...Object.values(T[langOf(room)].roles)];

/**
 * One chat line for `bot`, in its own voice, or null when it has nothing new
 * to say. Never repeats a line the bot already said today or one another bot
 * just said. `mem` is updated (claims, lines said today).
 */
export function botChatLine(room: Room, bot: Player, mem: BotChatMemory, intel: ChatIntel = newChatIntel(), rnd: Rnd = Math.random): string | null {
  if (!room.game || !bot.alive) return null;
  mem.fakeChecks ??= {};
  mem.told ??= {};
  const said = mem.said[bot.id] ?? 0;
  const mine = (mem.texts[bot.id] ??= []);
  for (let attempt = 0; attempt < 6; attempt++) {
    const before = { claims: { ...mem.claims }, fake: [...(mem.fakeChecks[bot.id] ?? [])], told: [...(mem.told[bot.id] ?? [])] };
    const raw = compose(room, bot, mem, intel, rnd, said);
    if (!raw) return null;
    if (mine.includes(raw) || mem.recent.includes(raw)) {
      mem.claims = before.claims;
      mem.fakeChecks[bot.id] = before.fake;
      mem.told[bot.id] = before.told;
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
  const side = chatSide(role);
  const named = text.toLowerCase().includes(bot.name.toLowerCase());
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  let raw: string | null = null;
  // "Who do you suspect?" mentions wolves too, so a question is answered before it is taken as an accusation.
  const asked = ASKS_WHO.test(text);
  if (named && !asked && ACCUSING.test(text)) {
    if (side === "tanner" && rnd() < 0.6) raw = pick(rnd, L.tannerMeh);
    else {
      // Accused: liars keep to their cover story, the village says its real role
      // (unless it is a power role still in hiding, or a Seer with nothing to show).
      let shown: RoleId | undefined = mem.claims[bot.id] ?? (side === "village" ? role : coverRole(room, bot.id));
      if (side === "village" && !mem.claims[bot.id] && (HIDE_EARLY.includes(role) || role === "seer")) shown = undefined;
      if (side === "village" && shown === "seer" && !(game.seerResults[bot.id] ?? []).length) shown = role;
      if (shown) mem.claims[bot.id] = shown;
      // Never fires back at an ally (a pack mate, a Sister, a lover).
      const back = !alliesOf(room, bot.id).has(fromId) && rnd() >= 0.6;
      raw = back ? fill(pick(rnd, L.whyMeBack), { name: from }) : shown ? fill(pick(rnd, L.whyMe), { role: L.roles[shown] }) : pick(rnd, L.whyMeNoRole);
    }
  } else if (asked || (named && QUESTION.test(text))) {
    const allies = alliesOf(room, bot.id);
    const pool = others.map((p) => p.id).filter((id) => !allies.has(id));
    const target = shieldsPack(side) ? topThreat(room, intel, pool) : ranked(suspicion(room, intel, bot.id), pool)[0];
    raw = target && rnd() < 0.8 ? fill(pick(rnd, L.suspect), { name: nameOf(room, target) }) : pick(rnd, L.noIdea);
  } else if (named) {
    raw = fill(pick(rnd, L.heard), { name: from });
  } else if (rnd() < 0.5) {
    raw = pick(rnd, rnd() < 0.6 ? L.agree : L.doubt);
  }
  return raw && voice(raw, personaOf(room, bot.id), langOf(room), namesIn(room), rnd);
}

/** Who won, seen from one player: their team, their solo win, or their love. */
function wonGame(room: Room, playerId: string): boolean {
  const game = room.game!;
  const role = game.roles[playerId];
  switch (game.winner) {
    case "lovers":
      return !!game.lovers?.includes(playerId);
    case "wolves":
      return teamOf(role) === "wolves";
    case "village":
      return teamOf(role) === "village";
    case "draw":
    case null:
      return false;
    default:
      return role === game.winner;
  }
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
  const won = wonGame(room, bot.id);
  const liar = liesInChat(role);
  let raw: string;
  if (won && isWolfRole(role) && teamOf(role) === "wolves" && rnd() < 0.5) raw = pick(rnd, L.ggSneaky);
  else if (won && teamOf(role) === "solo" && rnd() < 0.6) raw = fill(pick(rnd, L.ggSolo), { role: L.roles[role] });
  else if (!won && !liar && rnd() < 0.4) {
    const fooler = room.players.find((p) => p.id !== bot.id && liesInChat(game.roles[p.id]) && wonGame(room, p.id));
    raw = fooler ? fill(pick(rnd, L.ggTricked), { name: fooler.name }) : pick(rnd, L.ggLose);
  } else raw = pick(rnd, won ? L.ggWin : L.ggLose);
  return voice(raw, personaOf(room, bot.id), langOf(room), namesIn(room), rnd);
}

const DEFENSE = {
  vi: {
    innocent: ["Mình không phải Sói đâu, mọi người đang treo nhầm người rồi!", "Mình là {role} thật đấy, treo mình là làng mất một người tốt.", "Nghĩ kỹ đi, mình cả buổi đều nói thật mà."],
    role: "Mình là {role} thật đấy, treo mình là làng mất một người tốt.",
    accuse: ["Người đáng treo là {name}, không phải mình.", "Mình nghi {name} hơn, hãy để ý {name}."],
    spare: "Đừng treo mình!",
    tanner: ["Thôi, mình nói gì mọi người cũng không tin đâu.", "Mình là {role}… mà thôi, tùy mọi người.", "Ừ thì… mình cũng không biết nói gì hơn."],
    done: "Mình nói xong rồi, mong mọi người sáng suốt.",
  },
  en: {
    innocent: ["I'm not a wolf, you're about to hang the wrong person!", "I really am the {role} — hang me and the village loses a good player.", "Think it through, I've been honest all day."],
    role: "I really am the {role} — hang me and the village loses a good player.",
    accuse: ["The one to hang is {name}, not me.", "I suspect {name} much more, watch {name}."],
    spare: "Don't hang me!",
    tanner: ["Whatever I say, you won't believe me.", "I'm the {role}… well, up to you.", "Yeah… I don't know what else to say."],
    done: "That's all from me, please choose wisely.",
  },
};

/**
 * What a bot on the stand says to save itself (scripted fallback when no AI).
 * Liars keep to the role they claimed (or their cover); the village tells the
 * truth, power roles now with their night knowledge as proof; the Tanner barely
 * tries. Returns null once the bot has said its piece (it should then end its defense).
 */
export function botDefenseLine(room: Room, bot: Player, said: number, intel: ChatIntel = newChatIntel(), rnd: Rnd = Math.random): string | null {
  const game = room.game;
  if (!game || !bot.alive) return null;
  const lang = langOf(room);
  const D = DEFENSE[lang];
  const L = T[lang];
  const role = game.roles[bot.id];
  const side = chatSide(role);
  const others = room.players.filter((p) => p.alive && p.id !== bot.id);
  const say = (raw: string) => voice(raw, personaOf(room, bot.id), lang, namesIn(room), rnd);
  if (said >= 2) return null;
  if (said === 1) {
    if (side === "tanner") return say(D.done);
    const allies = alliesOf(room, bot.id);
    const pool = others.map((p) => p.id).filter((id) => !allies.has(id));
    const target = shieldsPack(side) ? topThreat(room, intel, pool) : ranked(suspicion(room, intel, bot.id), pool)[0];
    return say(target ? fill(pick(rnd, D.accuse), { name: nameOf(room, target) }) : D.done);
  }
  const claimed = intel.claims[bot.id]?.at(-1);
  if (side === "tanner") return say(fill(pick(rnd, D.tanner), { role: L.roles[claimed ?? coverRole(room, bot.id)] }));
  if (side !== "village") return say(fill(pick(rnd, D.innocent), { role: L.roles[claimed ?? coverRole(room, bot.id)] }));
  if (role === "seer" && (game.seerResults[bot.id] ?? []).length) return say(`${seerAll(room, bot, L)} ${D.spare}`);
  if (role === "lycan") {
    const by = intel.reports.find((r) => r.targetId === bot.id && r.isWolf)?.by;
    if (by) return say(fill(pick(rnd, L.lycan), { by: nameOf(room, by) }));
  }
  if (role === "witch" || role === "bodyguard" || role === "medium") {
    const mem = newBotChatMemory();
    const proof = claimText(room, bot, mem, intel, L, rnd);
    return say(`${proof} ${D.spare}`);
  }
  if (role !== "villager") return say(fill(D.role, { role: L.roles[role] }));
  return say(fill(pick(rnd, D.innocent), { role: L.roles[role] }));
}
