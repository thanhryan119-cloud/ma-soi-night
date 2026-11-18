// Simulated players ("bots") so one person can test a full 8-player game.
// Bots go through exactly the same validated playerAction() path as humans.

import { currentStep, getPlayer, isStepDone, playerAction, voteEligible } from "./engine";
import { NIGHT_STEP_ROLE, isWolf } from "./roles";
import { validTargets } from "./engine";
import type { PlayerAction, Room } from "./types";

const pick = <T,>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];

/** Returns the next action a bot wants to take right now, or null. */
export function botDecide(room: Room, botId: string): PlayerAction | null {
  const bot = getPlayer(room, botId);
  const game = room.game;
  if (!bot || !bot.isBot || !game) return null;
  const role = game.roles[bot.id];
  const kind = room.phase.kind;

  if (kind === "night" && bot.alive) {
    const step = currentStep(room);
    if (!step || NIGHT_STEP_ROLE[step] !== role) return null;
    const ns = game.nightState;
    const targets = validTargets(room, bot, step);
    switch (step) {
      case "cupid": {
        if (ns.done.cupid || targets.length < 2) return null;
        const a = pick(targets)!;
        const b = pick(targets.filter((t) => t !== a))!;
        return { type: "night", targets: [a, b] };
      }
      case "bodyguard":
      case "seer":
        if (ns.done[step] || !targets.length) return null;
        return { type: "night", targets: [pick(targets)!] };
      case "werewolf": {
        if (ns.wolfFinalized || isStepDone(room, step) || !targets.length) return null;
        // Follow the pack: copy the most common pick by a teammate, else choose.
        const mates = Object.entries(ns.wolfVotes).filter(([id]) => id !== bot.id).map(([, t]) => t);
        const choice = mates.length ? mates[0] : pick(targets)!;
        if (ns.wolfVotes[bot.id] === choice) return null;
        return { type: "night", targets: [choice] };
      }
      case "witch": {
        if (ns.witchDone) return null;
        const canSave =
          game.potions.heal && !!ns.wolfTarget && (room.settings.witchSelfSave || ns.wolfTarget !== bot.id);
        const save = canSave && Math.random() < 0.5;
        const poison =
          game.potions.poison && (!save || room.settings.witchBothSameNight) && Math.random() < 0.25
            ? pick(targets) ?? null
            : null;
        return { type: "night", save, poisonId: poison };
      }
    }
  }

  if ((kind === "nominate" || kind === "verdict") && game.vote && !game.vote.closed) {
    if (bot.id in game.vote.ballots || !voteEligible(room).includes(bot.id)) return null;
    if (game.vote.kind === "nominate") {
      const options = (game.vote.candidates ?? room.players.filter((p) => p.alive).map((p) => p.id)).filter(
        (id) => id !== bot.id && !(isWolf(role) && isWolf(game.roles[id])),
      );
      if (room.settings.mandatoryVote) {
        const any = (game.vote.candidates ?? room.players.filter((p) => p.alive).map((p) => p.id)).filter((id) => id !== bot.id);
        return { type: "vote", choice: pick(options.length ? options : any) ?? "skip" };
      }
      if (!options.length || Math.random() < 0.15) return { type: "vote", choice: "skip" };
      return { type: "vote", choice: pick(options)! };
    }
    const nominee = game.vote.nomineeId;
    const wolfFriend = nominee && isWolf(role) && isWolf(game.roles[nominee]);
    return { type: "vote", choice: wolfFriend || Math.random() < 0.4 ? "spare" : "execute" };
  }

  if (kind === "hunter" && game.pendingHunters[0] === bot.id && !(bot.id in game.hunterShots)) {
    const targets = room.players.filter((p) => p.alive && p.id !== bot.id).map((p) => p.id);
    return { type: "hunterShot", targetId: pick(targets) ?? null };
  }
  return null;
}

/** Runs one decision for every bot; returns true if anything changed. */
export function runBots(room: Room): boolean {
  let changed = false;
  for (const p of room.players) {
    if (!p.isBot) continue;
    const action = botDecide(room, p.id);
    if (action && playerAction(room, p.id, action).ok) changed = true;
  }
  return changed;
}
