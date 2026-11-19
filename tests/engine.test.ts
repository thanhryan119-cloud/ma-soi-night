import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, playerAction } from "../shared/engine";
import { runBots } from "../shared/bots";
import { buildView } from "../shared/views";
import type { RoleId, Room } from "../shared/types";

function setupRoom(roles: RoleId[]): { room: Room; ids: string[] } {
  const room = createRoom("TEST1", "vi");
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i + 1}` }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  return { room, ids };
}

const next = (room: Room) => hostAction(room, { type: "next" });

describe("engine flow", () => {
  it("plays a scripted night → dawn with bodyguard save and wolf bite", () => {
    // P1 wolf, P2 wolf, P3 seer, P4 bodyguard, P5 witch, P6..P8 villagers
    const { room, ids } = setupRoom(["werewolf", "werewolf", "seer", "bodyguard", "witch", "villager", "villager", "villager"]);
    const [w1, w2, seer, guard, witch, v1] = ids;
    expect(next(room).ok).toBe(true); // roleReveal -> night 1
    expect(room.phase.kind).toBe("night");
    expect(room.phase.steps).toEqual(["bodyguard", "werewolf", "witch", "seer"]);

    // bodyguard step
    expect(playerAction(room, w1, { type: "night", targets: [v1] }).error).toBe("err.notYourTurn");
    expect(playerAction(room, guard, { type: "night", targets: [seer] }).ok).toBe(true);
    expect(playerAction(room, guard, { type: "night", targets: [v1] }).error).toBe("err.alreadyActed");
    next(room);

    // wolves step: wolves can't bite wolves, must agree
    expect(playerAction(room, w1, { type: "night", targets: [w2] }).error).toBe("err.invalidTarget");
    playerAction(room, w1, { type: "night", targets: [seer] });
    playerAction(room, w2, { type: "night", targets: [v1] });
    const wolfView = buildView(room, "player", w2);
    expect(wolfView.me?.turn?.packVotes).toEqual({ [w1]: seer, [w2]: v1 });
    expect(wolfView.me?.turn?.done).toBe(false);
    playerAction(room, w2, { type: "night", targets: [seer] });
    expect(buildView(room, "player", w2).me?.turn?.done).toBe(true);
    next(room);
    expect(room.game!.nightState.wolfTarget).toBe(seer);

    // witch sees the victim, passes
    const witchView = buildView(room, "player", witch);
    expect(witchView.me?.turn?.witch?.victimId).toBe(seer);
    expect(playerAction(room, witch, { type: "night", save: false, poisonId: null }).ok).toBe(true);
    next(room);

    // seer inspects a wolf
    expect(playerAction(room, seer, { type: "night", targets: [w1] }).ok).toBe(true);
    expect(buildView(room, "player", seer).me?.seerResults).toEqual([{ night: 1, targetId: w1, isWolf: true }]);
    next(room);

    // dawn: seer was protected → nobody died
    expect(room.phase.kind).toBe("dawn");
    expect(room.game!.lastDeaths).toEqual([]);
    expect(room.players.every((p) => p.alive)).toBe(true);
  });

  it("bodyguard cannot protect the same player two nights in a row", () => {
    const { room, ids } = setupRoom(["werewolf", "bodyguard", "villager", "villager", "villager"]);
    const [, guard, v1] = ids;
    hostAction(room, { type: "updateSettings", settings: { wolvesMustBite: false } });
    next(room);
    playerAction(room, guard, { type: "night", targets: [v1] });
    next(room); // -> werewolf
    next(room); // -> dawn (no bite)
    next(room); // -> discussion
    next(room); // -> nominate
    for (const id of ids) playerAction(room, id, { type: "vote", choice: "skip" });
    next(room); // -> nomination results (nobody)
    expect(room.phase.kind).toBe("nominateResult");
    expect(room.game!.nominationOutcome).toBe("none");
    next(room); // -> night 2
    expect(room.phase.kind).toBe("night");
    expect(room.phase.night).toBe(2);
    expect(playerAction(room, guard, { type: "night", targets: [v1] }).error).toBe("err.invalidTarget");
  });

  it("day voting: prevents double votes, nominees cannot vote in the verdict", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager", "villager"]);
    const [w, a, b, c, d] = ids;
    next(room); // night 1
    playerAction(room, w, { type: "night", targets: [a] });
    next(room); // dawn: a dies
    expect(room.players.find((p) => p.id === a)!.alive).toBe(false);
    next(room); // discussion
    next(room); // nominate
    expect(playerAction(room, a, { type: "vote", choice: w }).error).toBe("err.dead");
    expect(playerAction(room, b, { type: "vote", choice: b }).error).toBe("err.invalidTarget");
    expect(playerAction(room, b, { type: "vote", choice: w }).ok).toBe(true);
    expect(playerAction(room, b, { type: "vote", choice: c }).error).toBe("err.alreadyVoted");
    playerAction(room, c, { type: "vote", choice: w });
    playerAction(room, d, { type: "vote", choice: "skip" });
    playerAction(room, w, { type: "vote", choice: b });
    // While the vote is open, players and the screen only see the progress.
    expect(buildView(room, "player", c).vote?.ballots).toBeUndefined();
    expect(buildView(room, "screen").vote?.ballots).toBeUndefined();
    expect(buildView(room, "screen").vote?.voted).toBe(4);
    next(room); // results revealed
    expect(room.phase.kind).toBe("nominateResult");
    // Ballots were secret while voting, and are public once closed.
    const villagerView = buildView(room, "player", c);
    expect(villagerView.vote?.closed).toBe(true);
    expect(villagerView.vote?.ballots).toEqual({ [b]: w, [c]: w, [d]: "skip", [w]: b });
    next(room); // defense
    expect(room.phase.kind).toBe("defense");
    expect(room.game!.nominees).toEqual([w]);
    next(room); // verdict
    expect(playerAction(room, w, { type: "vote", choice: "spare" }).error).toBe("err.onStand");
    playerAction(room, b, { type: "vote", choice: "execute" });
    playerAction(room, c, { type: "vote", choice: "execute" });
    playerAction(room, d, { type: "vote", choice: "spare" });
    next(room); // verdictResult
    expect(room.players.find((p) => p.id === w)!.alive).toBe(false);
    expect(room.game!.pendingWin).toBe("village");
    expect(next(room).error).toBe("err.winPending");
    expect(hostAction(room, { type: "confirmWin" }).ok).toBe(true);
    expect(room.phase.kind).toBe("gameOver");
    expect(room.game!.winner).toBe("village");
  });

  it("hunter shot cascades into a lover's death", () => {
    const { room, ids } = setupRoom(["werewolf", "werewolf", "hunter", "cupid", "villager", "villager", "villager", "villager"]);
    const [w1, w2, hunter, cupid, v1, v2] = ids;
    next(room); // night 1 -> cupid
    expect(room.phase.steps[0]).toBe("cupid");
    expect(playerAction(room, cupid, { type: "night", targets: [v1, v2] }).ok).toBe(true);
    next(room); // werewolf
    playerAction(room, w1, { type: "night", targets: [hunter] });
    playerAction(room, w2, { type: "night", targets: [hunter] });
    next(room); // dawn
    expect(room.game!.pendingHunters).toEqual([hunter]);
    next(room); // hunter phase
    expect(room.phase.kind).toBe("hunter");
    expect(playerAction(room, v1, { type: "hunterShot", targetId: w1 }).error).toBe("err.notYourTurn");
    expect(playerAction(room, hunter, { type: "hunterShot", targetId: v1 }).ok).toBe(true);
    expect(room.players.filter((p) => !p.alive).map((p) => p.id).sort()).toEqual([hunter, v1, v2].sort());
    next(room); // discussion
    expect(room.phase.kind).toBe("discussion");
  });

  it("revote on a top-1 tie restricts candidates", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager", "villager", "villager"]);
    hostAction(room, { type: "updateSettings", settings: { wolvesMustBite: false, nomination: { mode: "top1", n: 1, threshold: 2, tie: "revote" } } });
    const [w, a, b, c, d, e] = ids;
    next(room); // night
    next(room); // dawn (no bite)
    next(room); // discussion
    next(room); // nominate
    playerAction(room, w, { type: "vote", choice: a });
    playerAction(room, a, { type: "vote", choice: b });
    for (const id of [b, c, d, e]) playerAction(room, id, { type: "vote", choice: "skip" });
    next(room); // tie -> results
    expect(room.game!.nominationOutcome).toBe("revote");
    next(room); // -> revote
    expect(room.phase.kind).toBe("nominate");
    expect(room.game!.vote!.candidates!.sort()).toEqual([a, b].sort());
    expect(playerAction(room, c, { type: "vote", choice: d }).error).toBe("err.invalidTarget");
    playerAction(room, c, { type: "vote", choice: a });
    playerAction(room, e, { type: "vote", choice: a });
    for (const id of [w, a, b, d]) playerAction(room, id, { type: "vote", choice: "skip" });
    next(room); // results
    next(room);
    expect(room.phase.kind).toBe("defense");
    expect(room.game!.nominees).toEqual([a]);
  });
});

describe("missed votes", () => {
  it("anyone who didn't vote counts as a random vote for someone else", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager", "villager"]);
    hostAction(room, { type: "updateSettings", settings: { wolvesMustBite: false } });
    next(room); // night
    next(room); // dawn
    next(room); // discussion
    next(room); // nominate
    playerAction(room, ids[1], { type: "vote", choice: ids[0] });
    next(room); // close: the other four get random ballots
    const ballots = room.game!.vote!.ballots;
    expect(Object.keys(ballots).sort()).toEqual([...ids].sort());
    for (const [voter, target] of Object.entries(ballots)) expect(target).not.toBe(voter);
  });
});

describe("secrecy", () => {
  it("players only receive roles they are allowed to know", () => {
    const { room, ids } = setupRoom(["werewolf", "werewolf", "seer", "villager", "villager"]);
    const [w1, w2, seer, v1] = ids;
    const villager = buildView(room, "player", v1);
    expect(villager.players.filter((p) => p.roleId).map((p) => p.id)).toEqual([v1]);
    const wolf = buildView(room, "player", w1);
    expect(wolf.players.filter((p) => p.roleId).map((p) => p.id).sort()).toEqual([w1, w2].sort());
    const screen = buildView(room, "screen");
    expect(screen.players.some((p) => p.roleId)).toBe(false);
    expect(screen.log).toBeUndefined();
    const host = buildView(room, "host");
    expect(host.players.every((p) => p.roleId)).toBe(true);
    expect(villager.players.find((p) => p.id === seer)?.roleId).toBeUndefined();
    // No tokens leak to anyone.
    for (const v of [villager, wolf, screen, host]) {
      for (const p of room.players) expect(JSON.stringify(v)).not.toContain(p.token);
      expect(JSON.stringify(v)).not.toContain(room.hostToken);
    }
  });

  it("dead players see all roles when the setting is on", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager"]);
    hostAction(room, { type: "override", action: { kind: "kill", playerId: ids[1] } });
    expect(buildView(room, "player", ids[1]).players.every((p) => p.roleId)).toBe(true);
    hostAction(room, { type: "updateSettings", settings: { deadSeeRoles: false } });
    expect(buildView(room, "player", ids[1]).players.filter((p) => p.roleId)).toHaveLength(1);
  });
});

describe("bot simulation", () => {
  it("8 bots can play complete games without errors", () => {
    for (let game = 0; game < 30; game++) {
      const room = createRoom("BOTS", "en");
      hostAction(room, { type: "addBots", count: 8 });
      hostAction(room, { type: "updateSettings", settings: { nomination: { mode: "top1", n: 1, threshold: 2, tie: game % 3 === 0 ? "revote" : "allTied" } } });
      expect(room.players).toHaveLength(8);
      expect(hostAction(room, { type: "useSuggested" }).ok).toBe(true);
      expect(hostAction(room, { type: "assignRandom" }).ok).toBe(true);
      expect(hostAction(room, { type: "start" }).ok).toBe(true);
      let guard = 0;
      while (room.phase.kind !== "gameOver" && guard++ < 500) {
        for (let i = 0; i < 10; i++) if (!runBots(room)) break;
        if (room.game!.pendingWin) {
          expect(hostAction(room, { type: "confirmWin" }).ok).toBe(true);
          break;
        }
        const res = next(room);
        expect(res.ok, res.error).toBe(true);
      }
      expect(room.phase.kind).toBe("gameOver");
      expect(["wolves", "village", "lovers", "draw"]).toContain(room.game!.winner);
      // All roles are public at the end.
      expect(buildView(room, "screen").players.every((p) => p.roleId)).toBe(true);
    }
  });
});

describe("mandatory rules", () => {
  it("wolves must bite: the host can't skip the werewolf step without a pick", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager"]);
    const [w, a] = ids;
    room.players.find((p) => p.id === w)!.connected = true;
    next(room); // night 1, werewolf step
    expect(room.phase.steps).toEqual(["werewolf"]);
    expect(next(room).error).toBe("err.wolvesMustBite");
    playerAction(room, w, { type: "night", targets: [a] });
    expect(next(room).ok).toBe(true);
    expect(room.players.find((p) => p.id === a)!.alive).toBe(false);
  });

  it("offline wolves get a random victim so the game can go on", () => {
    const { room } = setupRoom(["werewolf", "villager", "villager", "villager"]);
    next(room);
    expect(next(room).ok).toBe(true); // all wolves offline -> auto pick
    expect(room.game!.lastDeaths).toHaveLength(1);
  });

  it("mandatory vote: no skipping and the host waits for connected voters", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager", "villager"]);
    const [w, a, b, c, d] = ids;
    hostAction(room, { type: "updateSettings", settings: { mandatoryVote: true, wolvesMustBite: false } });
    for (const p of room.players) p.connected = true;
    next(room); // night
    next(room); // dawn
    next(room); // discussion
    next(room); // nominate
    expect(playerAction(room, a, { type: "vote", choice: "skip" }).error).toBe("err.skipNotAllowed");
    playerAction(room, a, { type: "vote", choice: w });
    playerAction(room, b, { type: "vote", choice: w });
    const res = next(room);
    expect(res.error).toBe("err.votesMissing");
    expect(res.params).toEqual({ count: 3 });
    // An offline player doesn't block the vote.
    room.players.find((p) => p.id === d)!.connected = false;
    playerAction(room, c, { type: "vote", choice: w });
    playerAction(room, w, { type: "vote", choice: a });
    expect(next(room).ok).toBe(true);
    expect(room.phase.kind).toBe("nominateResult");
  });

  it("bots never skip when voting is mandatory", () => {
    for (let g = 0; g < 10; g++) {
      const room = createRoom("MAND", "en");
      hostAction(room, { type: "addBots", count: 8 });
      hostAction(room, { type: "updateSettings", settings: { mandatoryVote: true } });
      hostAction(room, { type: "useSuggested" });
      hostAction(room, { type: "assignRandom" });
      hostAction(room, { type: "start" });
      let guard = 0;
      while (room.phase.kind !== "gameOver" && guard++ < 500) {
        for (let i = 0; i < 12; i++) if (!runBots(room)) break;
        if (room.game!.vote && !room.game!.vote.closed)
          expect(Object.values(room.game!.vote.ballots)).not.toContain("skip");
        if (room.game!.pendingWin) {
          hostAction(room, { type: "confirmWin" });
          break;
        }
        const r = next(room);
        expect(r.ok, r.error).toBe(true);
      }
      expect(room.phase.kind).toBe("gameOver");
    }
  });
});
