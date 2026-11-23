// What bots pick up from the table talk.
//
// Every chat line (from humans and bots alike) is parsed for role claims
// ("mình là Tiên tri"), seer reports ("soi X: là Sói"), accusations ("treo X
// đi") and defences ("X là người tốt"). Bots turn that into a suspicion score
// for each player, seen from their own position: a real Seer knows a rival
// Seer claim is a lie, a villager falsely accused knows the accuser is wrong,
// and wolves rank innocents by how dangerous they are to the pack.

import { isWolf } from "./roles";
import type { Player, RoleId, Room } from "./types";

export interface ChatIntel {
  /** Roles each player has claimed, in order. */
  claims: Record<string, RoleId[]>;
  reports: { by: string; targetId: string; isWolf: boolean }[];
  accuse: { by: string; targetId: string }[];
  defend: { by: string; targetId: string }[];
}

export const newChatIntel = (): ChatIntel => ({ claims: {}, reports: [], accuse: [], defend: [] });

const ROLE_WORDS: [RoleId, RegExp][] = [
  ["seer", /(tiên tri|tien tri|seer)/i],
  ["bodyguard", /(bảo vệ|bao ve|bodyguard|guard)/i],
  ["witch", /(phù thủy|phù thuỷ|phu thuy|witch)/i],
  ["hunter", /(thợ săn|tho san|hunter)/i],
  ["cupid", /(cupid|thần tình yêu)/i],
  ["elder", /(già làng|gia lang|elder)/i],
  ["idiot", /(thằng ngốc|chàng ngốc|thang ngoc|ngốc|idiot)/i],
  ["villager", /(dân làng|dân thường|dân lành|dan lang|\bdân\b|villager)/i],
  ["werewolf", /(ma sói|\bsói\b|werewolf|\bwolf\b)/i],
];

const CLAIM = /((mình|tôi|tao|tớ|em|anh|chị)\s+(chính\s+)?là|i'?m|i am)\s+(the\s+|a\s+)?/i;
const WOLF = /(là sói|là ma sói|is a (were)?wolf|is the (were)?wolf|\bsói\b|\bwolf\b)/i;
const NOT_WOLF = /(không phải sói|ko phải sói|k phải sói|chẳng phải sói|not a (were)?wolf|người tốt|dân lành|vô tội|trong sạch|innocent|is good|is clean)/i;
const SEERISH = /(soi|check|tiên tri|seer)/i;
const ACCUSE = /(nghi|đáng ngờ|treo|vote|giết|cắn|sus\b|suspicious|hang|lynch|kill|shady)/i;
const DEFEND = /(tin|bảo đảm|đảm bảo|đừng nghi|không nghi|ko nghi|trust|vouch|leave .* alone|don'?t suspect)/i;

/** Players named in the text (longest names first so "Bot 12" isn't read as "Bot 1"). */
function mentioned(room: Room, text: string, exclude: string): Player[] {
  let rest = ` ${text.toLowerCase()} `;
  const found: Player[] = [];
  for (const p of [...room.players].sort((a, b) => b.name.length - a.name.length)) {
    if (p.id === exclude) continue;
    const name = p.name.toLowerCase().trim();
    if (!name) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu");
    if (re.test(rest)) {
      found.push(p);
      rest = rest.replace(re, "$1 ");
    }
  }
  return found;
}

/** Reads one chat line into the shared intel. */
export function ingestChat(room: Room, intel: ChatIntel, fromId: string, text: string) {
  if (!room.players.some((p) => p.id === fromId)) return;
  for (const sentence of text.split(/[.!?;\n]+/)) {
    const s = sentence.trim();
    if (!s) continue;
    const names = mentioned(room, s, fromId);
    // "Mình là Tiên tri" — a claim about oneself (only when nobody else is named before it).
    const m = CLAIM.exec(s);
    if (m) {
      const after = s.slice(m.index + m[0].length);
      const role = ROLE_WORDS.find(([, re]) => new RegExp(`^(${re.source})`, "i").test(after.trim()))?.[0];
      const namedFirst = names.some((p) => s.toLowerCase().indexOf(p.name.toLowerCase()) < m.index);
      if (role && !namedFirst && !/không phải|not/i.test(after.slice(0, 12))) {
        (intel.claims[fromId] ??= []).push(role);
      }
    }
    const seerish = SEERISH.test(s) || (intel.claims[fromId] ?? []).at(-1) === "seer";
    for (const p of names) {
      if (NOT_WOLF.test(s)) {
        if (seerish) intel.reports.push({ by: fromId, targetId: p.id, isWolf: false });
        intel.defend.push({ by: fromId, targetId: p.id });
      } else if (WOLF.test(s) && seerish) {
        intel.reports.push({ by: fromId, targetId: p.id, isWolf: true });
        intel.accuse.push({ by: fromId, targetId: p.id });
      } else if (DEFEND.test(s)) {
        intel.defend.push({ by: fromId, targetId: p.id });
      } else if (ACCUSE.test(s) || WOLF.test(s)) {
        intel.accuse.push({ by: fromId, targetId: p.id });
      }
    }
  }
}

const UNIQUE: RoleId[] = ["seer", "bodyguard", "witch", "hunter", "cupid", "elder", "idiot"];
const lastClaim = (intel: ChatIntel, id: string) => intel.claims[id]?.at(-1);

export interface Read {
  score: Map<string, number>;
  /** Why the top suspects look bad, for the bot to say out loud. */
  reasons: Map<string, Reason>;
}

export type Reason =
  | { kind: "report"; by: string }
  | { kind: "fakeSeer" }
  | { kind: "counterClaim"; other: string; role: RoleId }
  | { kind: "accusedMe" }
  | { kind: "crowd"; count: number }
  | { kind: "ownCheck" };

function bump(read: Read, id: string, by: number, reason?: Reason) {
  if (!read.score.has(id)) return;
  read.score.set(id, read.score.get(id)! + by);
  if (reason && by > 0) {
    const prev = read.reasons.get(id);
    const weight = (r: Reason) => ({ ownCheck: 9, fakeSeer: 8, report: 6, accusedMe: 5, counterClaim: 4, crowd: 2 })[r.kind];
    if (!prev || weight(reason) > weight(prev)) read.reasons.set(id, reason);
  }
}

/**
 * How suspicious each living player looks to `viewerId` (higher = more likely
 * a wolf), combining its own night knowledge with what was said in chat.
 */
export function suspicion(room: Room, intel: ChatIntel, viewerId: string): Read {
  const game = room.game!;
  const myRole = game.roles[viewerId];
  const read: Read = { score: new Map(), reasons: new Map() };
  for (const p of room.players) if (p.alive && p.id !== viewerId) read.score.set(p.id, Math.random() * 0.4);

  // My own Seer checks are certain.
  for (const r of game.seerResults[viewerId] ?? []) bump(read, r.targetId, r.isWolf ? 100 : -100, r.isWolf ? { kind: "ownCheck" } : undefined);

  // Claims of the same unique role: someone is lying.
  for (const role of UNIQUE) {
    const claimants = Object.keys(intel.claims).filter((id) => lastClaim(intel, id) === role);
    if (myRole === role) {
      for (const id of claimants) if (id !== viewerId) bump(read, id, 6, role === "seer" ? { kind: "fakeSeer" } : { kind: "counterClaim", other: viewerId, role });
    } else if (claimants.length > 1) {
      for (const id of claimants) bump(read, id, 1.5, { kind: "counterClaim", other: claimants.find((c) => c !== id)!, role });
    }
  }

  // Seer reports, weighted by how believable the reporter is.
  const seers = Object.keys(intel.claims).filter((id) => lastClaim(intel, id) === "seer");
  for (const rep of intel.reports) {
    if (rep.by === viewerId) continue;
    const claimedSeer = lastClaim(intel, rep.by) === "seer";
    let w = claimedSeer ? (seers.length === 1 ? 1 : 0.45) : 0.3;
    if (myRole === "seer") w = 0; // I know who the Seer is: me
    const reporterDead = !room.players.find((p) => p.id === rep.by)?.alive;
    if (reporterDead && claimedSeer) w *= 1.3; // killed by the wolves — probably told the truth
    if (rep.targetId === viewerId) {
      // About me: I know the truth, so a wrong report exposes the reporter.
      const iAmWolf = isWolf(myRole);
      if (rep.isWolf !== iAmWolf && !iAmWolf) bump(read, rep.by, 5, { kind: "accusedMe" });
      continue;
    }
    bump(read, rep.targetId, (rep.isWolf ? 4 : -3) * w, rep.isWolf ? { kind: "report", by: rep.by } : undefined);
  }

  // The crowd: who is being accused or vouched for.
  const accusers = new Map<string, Set<string>>();
  for (const a of intel.accuse) {
    if (a.targetId === viewerId) {
      if (!isWolf(myRole)) bump(read, a.by, 1.5, { kind: "accusedMe" });
      continue;
    }
    if (!accusers.has(a.targetId)) accusers.set(a.targetId, new Set());
    accusers.get(a.targetId)!.add(a.by);
  }
  for (const [id, set] of accusers) bump(read, id, Math.min(set.size, 4) * 0.8, set.size >= 2 ? { kind: "crowd", count: set.size } : undefined);
  for (const d of intel.defend) {
    bump(read, d.targetId, -0.5);
    // Vouching for someone the believed Seer called a wolf is suspicious.
    if (intel.reports.some((r) => r.targetId === d.targetId && r.isWolf && lastClaim(intel, r.by) === "seer")) bump(read, d.by, 1);
  }
  return read;
}

/** Ranked suspects (most suspicious first) among `pool`. */
export function ranked(read: Read, pool: string[]): string[] {
  return pool.filter((id) => read.score.has(id)).sort((a, b) => read.score.get(b)! - read.score.get(a)!);
}

/**
 * For wolves: how dangerous each innocent is to the pack — a believed Seer,
 * people who accuse wolves, people the town trusts.
 */
export function threat(room: Room, intel: ChatIntel): Map<string, number> {
  const game = room.game!;
  const wolves = new Set(room.players.filter((p) => isWolf(game.roles[p.id])).map((p) => p.id));
  const out = new Map<string, number>();
  for (const p of room.players) if (p.alive && !wolves.has(p.id)) out.set(p.id, Math.random() * 0.5);
  const add = (id: string, by: number) => out.has(id) && out.set(id, out.get(id)! + by);
  for (const [id, roles] of Object.entries(intel.claims)) {
    const r = roles.at(-1);
    if (r === "seer") add(id, 5);
    else if (r === "witch" || r === "bodyguard") add(id, 2.5);
    else if (r === "hunter") add(id, -1); // shooting a hunter backfires
  }
  for (const a of intel.accuse) if (wolves.has(a.targetId)) add(a.by, 2);
  for (const r of intel.reports) if (r.isWolf && wolves.has(r.targetId)) add(r.by, 4);
  for (const d of intel.defend) if (!wolves.has(d.targetId)) add(d.targetId, 0.5);
  return out;
}

/** The innocent the pack most wants gone. */
export function topThreat(room: Room, intel: ChatIntel, pool?: string[]): string | null {
  const t = threat(room, intel);
  const ids = [...t.keys()].filter((id) => !pool || pool.includes(id));
  ids.sort((a, b) => t.get(b)! - t.get(a)!);
  return ids[0] ?? null;
}

/** How many distinct people have accused `id`. */
export function accusersOf(intel: ChatIntel, id: string): string[] {
  return [...new Set(intel.accuse.filter((a) => a.targetId === id).map((a) => a.by))];
}
