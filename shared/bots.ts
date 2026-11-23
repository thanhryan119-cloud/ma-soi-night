// Simulated players ("bots") so one person can test a full 8-player game.
// Bots go through exactly the same validated playerAction() path as humans.
// When given what was said in the chat (ChatIntel), they vote and act on it.

import { currentStep, getPlayer, isStepDone, playerAction, voteEligible } from "./engine";
import { isWolf, wakesIn } from "./roles";
import { validTargets } from "./engine";
import { accusersOf, newChatIntel, ranked, suspicion, topThreat, type ChatIntel } from "./botIntel";
import type { PlayerAction, Room } from "./types";

const pick = <T,>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];

/** Returns the next action a bot wants to take right now, or null. */
export function botDecide(room: Room, botId: string, intel: ChatIntel = newChatIntel()): PlayerAction | null {
  const bot = getPlayer(room, botId);
  const game = room.game;
  if (!bot || !bot.isBot || !game) return null;
  const role = game.roles[bot.id];
  const kind = room.phase.kind;
  const wolf = isWolf(role);
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
      // A wolf only votes a pack mate it already threw under the bus (one the town has caught).
      const bussed = wolf && saidVote && isWolf(game.roles[saidVote]) && accusersOf(intel, saidVote).length >= 3 ? saidVote : null;
      const options = all.filter((id) => !(wolf && isWolf(game.roles[id]) && id !== bussed));
      let choice: string | undefined;
      if (saidVote && options.includes(saidVote) && Math.random() < 0.85) {
        choice = saidVote;
      } else if (wolf) {
        // Pile onto the innocent the town already suspects, else the biggest threat.
        const crowd = [...options].sort((a, b) => accusersOf(intel, b).length - accusersOf(intel, a).length)[0];
        choice = crowd && accusersOf(intel, crowd).length >= 2 && Math.random() < 0.6 ? crowd : topThreat(room, intel, options) ?? pick(options);
      } else {
        const top = ranked(read(), options)[0];
        choice = top && Math.random() < 0.75 ? top : pick(options);
      }
      if (room.settings.mandatoryVote) return { type: "vote", choice: choice ?? pick(all) ?? "skip" };
      if (!choice || Math.random() < 0.1) return { type: "vote", choice: "skip" };
      return { type: "vote", choice };
    }
    const nominee = game.vote.nomineeId;
    if (!nominee) return { type: "vote", choice: "spare" };
    if (wolf) {
      // A pack mate is spared, unless this wolf already turned on them in the chat and the town has them.
      const friend = isWolf(game.roles[nominee]);
      if (friend && saidVote === nominee && accusersOf(intel, nominee).length >= 3) return { type: "vote", choice: "execute" };
      return { type: "vote", choice: friend ? "spare" : Math.random() < 0.85 ? "execute" : "spare" };
    }
    // Hang the one you accused, spare the one you vouched for.
    if (saidVote === nominee) return { type: "vote", choice: Math.random() < 0.9 ? "execute" : "spare" };
    if (vouched.has(nominee)) return { type: "vote", choice: Math.random() < 0.85 ? "spare" : "execute" };
    const s = read().score.get(nominee) ?? 0;
    const pExecute = s > 1 ? 0.8 : s < -1 ? 0.2 : 0.5;
    return { type: "vote", choice: Math.random() < pExecute ? "execute" : "spare" };
  }

  if (kind === "hunter" && game.pendingHunters[0] === bot.id && !(bot.id in game.hunterShots)) {
    const targets = room.players.filter((p) => p.alive && p.id !== bot.id).map((p) => p.id);
    const choice = wolf ? topThreat(room, intel, targets) : ranked(read(), targets)[0];
    return { type: "hunterShot", targetId: choice ?? pick(targets) ?? null };
  }
  return null;
}

/** Runs one decision for every bot; returns true if anything changed. */
export function runBots(room: Room, intel?: ChatIntel): boolean {
  let changed = false;
  for (const p of room.players) {
    if (!p.isBot) continue;
    const action = botDecide(room, p.id, intel);
    if (action && playerAction(room, p.id, action).ok) changed = true;
  }
  return changed;
}
