// Simulated players ("bots") so one person can test a full 8-player game.
// Bots go through exactly the same validated playerAction() path as humans.
// When given what was said in the chat (ChatIntel), they vote and act on it.

import { currentStep, getPlayer, isStepDone, playerAction, voteEligible } from "./engine";
import { isWolf, teamOf, wakesIn } from "./roles";
import { validTargets } from "./engine";
import { accusersOf, newChatIntel, ranked, suspicion, topThreat, type ChatIntel } from "./botIntel";
import { alliesOf, chatSide, shieldsPack } from "./botChat";
import type { PlayerAction, Room } from "./types";

/** A score this high or low comes from the bot's own night check: certain. */
const CERTAIN = 50;

const pick = <T,>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];

/** A bot, or a bot standing in for an away player: it acts and talks by itself. */
export const botTalks = (p: { isBot: boolean; standIn?: boolean }) => !!(p.isBot || p.standIn);

/**
 * What a bot (or a bot standing in for an away player) does next. `anyone`:
 * asks for a human too (is there something they should be doing?).
 */
export function botDecide(room: Room, botId: string, intel: ChatIntel = newChatIntel(), anyone = false): PlayerAction | null {
  const bot = getPlayer(room, botId);
  const game = room.game;
  if (!bot || !(bot.isBot || bot.standIn || anyone) || !game) return null;
  const role = game.roles[bot.id];
  const kind = room.phase.kind;
  // The Minion votes like a wolf (he knows the pack); the White Wolf too, but
  // he wants the pack gone as well and turns on a pack mate far sooner.
  const side = chatSide(role);
  const wolf = shieldsPack(side) || teamOf(role) === "wolves";
  const busAt = side === "whiteWolf" ? 2 : 3;
  const allies = alliesOf(room, bot.id);
  const read = () => suspicion(room, intel, bot.id);

  if (kind === "night" && bot.alive) {
    const step = currentStep(room);
    if (!step || !wakesIn(role, step)) return null;
    const ns = game.nightState;
    const targets = validTargets(room, bot, step);
    switch (step) {
      case "cupid": {
        if (ns.done.cupid || targets.length < 2) return null;
        const a = pick(targets)!;
        const b = pick(targets.filter((t) => t !== a))!;
        return { type: "night", targets: [a, b] };
      }
      case "bodyguard": {
        if (ns.done.bodyguard || !targets.length) return null;
        // Guard the one believable Seer claimant, if there is exactly one.
        const seers = Object.keys(intel.claims).filter((id) => intel.claims[id].at(-1) === "seer" && targets.includes(id));
        if (seers.length === 1 && Math.random() < 0.6) return { type: "night", targets: [seers[0]] };
        const trusted = ranked(read(), targets).reverse();
        return { type: "night", targets: [Math.random() < 0.5 && trusted[0] ? trusted[0] : pick(targets)!] };
      }
      case "seer": {
        if (ns.done.seer || !targets.length) return null;
        const checked = new Set((game.seerResults[bot.id] ?? []).map((r) => r.targetId));
        const fresh = targets.filter((id) => !checked.has(id));
        const top = ranked(read(), fresh)[0];
        return { type: "night", targets: [top && Math.random() < 0.75 ? top : pick(fresh.length ? fresh : targets)!] };
      }
      case "wolfSeer": {
        if (ns.done.wolfSeer || !targets.length) return null;
        const checked = new Set((game.seerResults[bot.id] ?? []).map((r) => r.targetId));
        const fresh = targets.filter((id) => !checked.has(id));
        // Hunt the Seer first: whoever is hurting the pack most in the chat.
        const threat = topThreat(room, intel, fresh.length ? fresh : targets);
        return { type: "night", targets: [threat && Math.random() < 0.7 ? threat : pick(fresh.length ? fresh : targets)!] };
      }
      case "wildChild": {
        if (ns.done.wildChild || !targets.length) return null;
        // Look up to someone who seems trustworthy, so the child stays in the village.
        const trusted = ranked(read(), targets).reverse()[0];
        return { type: "night", targets: [trusted && Math.random() < 0.6 ? trusted : pick(targets)!] };
      }
      case "medium": {
        if (ns.done.medium || !targets.length) return null;
        const checked = new Set((game.seerResults[bot.id] ?? []).map((r) => r.targetId));
        const fresh = targets.filter((id) => !checked.has(id));
        return { type: "night", targets: [pick(fresh.length ? fresh : targets)!] };
      }
      case "bigBadWolf":
      case "silencer": {
        if (ns.done[step]) return null;
        if (!targets.length) return { type: "night", targets: [] };
        const threat = topThreat(room, intel, targets);
        return { type: "night", targets: [threat && Math.random() < 0.7 ? threat : pick(targets)!] };
      }
      case "whiteWolf": {
        if (ns.done.whiteWolf) return null;
        // Thin the pack once the village is weak enough to finish alone.
        const alive = room.players.filter((p) => p.alive).length;
        if (!targets.length || (alive > 5 && Math.random() < 0.6)) return { type: "night", targets: [] };
        return { type: "night", targets: [pick(targets)!] };
      }
      case "serialKiller": {
        if (ns.done.serialKiller) return null;
        if (!targets.length) return { type: "night", targets: [] };
        const threat = topThreat(room, intel, targets);
        return { type: "night", targets: [threat && Math.random() < 0.5 ? threat : pick(targets)!] };
      }
      case "arsonist": {
        if (ns.done.arsonist) return null;
        const doused = (game.doused ?? []).filter((id) => getPlayer(room, id)?.alive);
        const others = room.players.filter((p) => p.alive && p.id !== bot.id).length;
        if (doused.length && (doused.length >= Math.ceil(others / 2) || !targets.length)) return { type: "night", ignite: true };
        if (!targets.length) return { type: "night", targets: [] };
        return { type: "night", targets: [pick(targets)!] };
      }
      case "cursedWolf": {
        if (ns.done.cursedWolf) return null;
        // Keep the curse for a strong victim (a Seer claim or the town's favourite), else roll for it.
        const victim = ns.wolfTarget;
        const canCurse = !game.curseUsed && !!victim;
        const valuable = !!victim && (intel.claims[victim]?.length ?? 0) > 0;
        return { type: "night", curse: canCurse && (valuable || Math.random() < 0.4) };
      }
      case "werewolf": {
        if (ns.wolfFinalized || isStepDone(room, step) || !targets.length) return null;
        // Follow the pack; the first wolf goes for whoever threatens the pack most.
        const mates = Object.entries(ns.wolfVotes).filter(([id]) => id !== bot.id).map(([, t]) => t);
        const threat = topThreat(room, intel, targets);
        const choice = mates.length ? mates[0] : threat && Math.random() < 0.8 ? threat : pick(targets)!;
        if (ns.wolfVotes[bot.id] === choice) return null;
        return { type: "night", targets: [choice] };
      }
      case "witch": {
        if (ns.witchDone) return null;
        const canSave =
          game.potions.heal && !!ns.wolfTarget && (room.settings.witchSelfSave || ns.wolfTarget !== bot.id);
        const save = canSave && Math.random() < 0.5;
        const r = read();
        const suspect = ranked(r, targets)[0];
        const strong = suspect && r.score.get(suspect)! > 3;
        const poison =
          game.potions.poison && (!save || room.settings.witchBothSameNight) && strong && Math.random() < 0.6
            ? suspect
            : null;
        return { type: "night", save, poisonId: poison };
      }
    }
  }

  if ((kind === "nominate" || kind === "verdict") && game.vote && !game.vote.closed) {
    if (bot.id in game.vote.ballots || !voteEligible(room).includes(bot.id)) return null;
    // Bots vote the way they talked: the last person they accused in the chat.
    const saidVote = [...intel.accuse].reverse().find((a) => a.by === bot.id)?.targetId;
    const vouched = new Set(intel.defend.filter((d) => d.by === bot.id).map((d) => d.targetId));
    if (game.vote.kind === "nominate") {
      const all = (game.vote.candidates ?? room.players.filter((p) => p.alive).map((p) => p.id)).filter((id) => id !== bot.id);
      // Nobody votes an ally (pack mate, Sister, lover, a Wild Child's model), except a
      // pack mate this wolf already threw under the bus (one the town has caught).
      const bussed = wolf && saidVote && isWolf(game.roles[saidVote]) && accusersOf(intel, saidVote).length >= busAt ? saidVote : null;
      let options = all.filter((id) => !allies.has(id) || id === bussed);
      // The Arsonist would rather burn his doused houses than see them hanged.
      if (role === "arsonist") {
        const dry = options.filter((id) => !(game.doused ?? []).includes(id));
        if (dry.length) options = dry;
      }
      if (!options.length) options = all;
      const r = wolf ? null : read();
      const sure = r && ranked(r, options).find((id) => r.score.get(id)! > CERTAIN);
      let choice: string | undefined;
      if (sure) return { type: "vote", choice: sure }; // a wolf the Seer saw with its own eyes
      if (saidVote && options.includes(saidVote) && Math.random() < 0.85) {
        choice = saidVote;
      } else if (wolf) {
        // Pile onto the innocent the town already suspects, else the biggest threat.
        const crowd = [...options].sort((a, b) => accusersOf(intel, b).length - accusersOf(intel, a).length)[0];
        choice = crowd && accusersOf(intel, crowd).length >= 2 && Math.random() < 0.6 ? crowd : topThreat(room, intel, options) ?? pick(options);
      } else {
        const top = ranked(r!, options)[0];
        choice = top && Math.random() < 0.75 ? top : pick(options);
      }
      if (room.settings.mandatoryVote) return { type: "vote", choice: choice ?? pick(all) ?? "skip" };
      if (!choice || Math.random() < 0.1) return { type: "vote", choice: "skip" };
      return { type: "vote", choice };
    }
    const nominee = game.vote.nomineeId;
    if (!nominee) return { type: "vote", choice: "spare" };
    const caught = accusersOf(intel, nominee).length;
    if (wolf) {
      // A pack mate is spared, unless this wolf already turned on them in the chat and the town
      // has them (the White Wolf lets the town have them once it is after them).
      if (isWolf(game.roles[nominee])) {
        const letGo = (saidVote === nominee && caught >= busAt) || (side === "whiteWolf" && caught >= 2 && Math.random() < 0.7);
        return { type: "vote", choice: letGo ? "execute" : "spare" };
      }
      if (allies.has(nominee)) return { type: "vote", choice: "spare" };
      return { type: "vote", choice: Math.random() < 0.85 ? "execute" : "spare" };
    }
    // A Sister, a lover or a Wild Child's model is spared.
    if (allies.has(nominee)) return { type: "vote", choice: Math.random() < 0.95 ? "spare" : "execute" };
    if (role === "arsonist" && (game.doused ?? []).includes(nominee)) return { type: "vote", choice: Math.random() < 0.7 ? "spare" : "execute" };
    const s = read().score.get(nominee) ?? 0;
    // The Seer's own checks are certain.
    if (s > CERTAIN) return { type: "vote", choice: "execute" };
    if (s < -CERTAIN) return { type: "vote", choice: "spare" };
    // Hang the one you accused, spare the one you vouched for.
    if (saidVote === nominee) return { type: "vote", choice: Math.random() < 0.9 ? "execute" : "spare" };
    if (vouched.has(nominee)) return { type: "vote", choice: Math.random() < 0.85 ? "spare" : "execute" };
    const pExecute = s > 1 ? 0.8 : s < -1 ? 0.2 : 0.5;
    return { type: "vote", choice: Math.random() < pExecute ? "execute" : "spare" };
  }

  if (kind === "hunter" && game.pendingHunters[0] === bot.id && !(bot.id in game.hunterShots)) {
    const everyone = room.players.filter((p) => p.alive && p.id !== bot.id).map((p) => p.id);
    const safe = everyone.filter((id) => !allies.has(id));
    const targets = safe.length ? safe : everyone;
    const choice = wolf ? topThreat(room, intel, targets) : ranked(read(), targets)[0];
    return { type: "hunterShot", targetId: choice ?? pick(targets) ?? null };
  }
  return null;
}

/** Runs one decision for every bot; returns true if anything changed. */
export function runBots(room: Room, intel?: ChatIntel): boolean {
  let changed = false;
  for (const p of room.players) {
    if (!p.isBot && !p.standIn) continue;
    const action = botDecide(room, p.id, intel);
    if (action && playerAction(room, p.id, action).ok) changed = true;
  }
  return changed;
}
