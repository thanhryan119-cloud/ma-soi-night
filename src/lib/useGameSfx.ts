"use client";

import { useEffect, useRef } from "react";
import type { ClientState } from "@shared/views";
import { teamOf } from "@shared/roles";
import { play, setSfxQuiet } from "./sfx";

/** Did the viewing player win? (Host and screen hear the village's side.) */
function iWon(s: ClientState): boolean {
  const w = s.winner;
  const me = s.me;
  if (!me?.roleId) return w !== "wolves" && w !== "draw";
  const team = me.cursedNight || me.wildTurned ? "wolves" : teamOf(me.roleId);
  switch (w) {
    case "lovers":
      return !!s.lovers?.includes(me.id);
    case "wolves":
    case "village":
      return team === w;
    case "draw":
    case null:
      return false;
    default:
      return me.roleId === w;
  }
}

/**
 * Plays sound effects as the room state changes: wolves howl when night falls,
 * a cry at dawn when someone was killed, stamps and taps as votes come in, a
 * drum roll and trapdoor for the hanging, a gunshot for the hunter, ticking in
 * the last seconds of the clock and a fanfare (or a dirge) at the end.
 */
export function useGameSfx(state: ClientState | null, offset: number) {
  const prev = useRef<ClientState | null>(null);

  // A player's phone makes no sound of its own at night: a click, a chime for
  // "your turn" or a pick being accepted would show the table who has a night
  // role. Everyone hears the same night-wide sounds (the howl) and nothing else.
  // The host and the big screen are not players, so they keep their clicks.
  const nightQuiet = !!state?.me && state.phase.kind === "night";
  useEffect(() => {
    setSfxQuiet(nightQuiet);
  }, [nightQuiet]);
  useEffect(() => () => setSfxQuiet(false), []);

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    // The first state after loading or reconnecting is not news.
    if (!state || !before || before.code !== state.code) return;

    const kind = state.phase.kind;
    const phaseChanged =
      before.phase.kind !== kind || before.phase.night !== state.phase.night || before.phase.day !== state.phase.day || before.phase.verdictIndex !== state.phase.verdictIndex;

    if (phaseChanged) {
      switch (kind) {
        case "roleReveal":
          play("reveal");
          break;
        case "night":
          if (before.phase.kind !== "night") play("night");
          break;
        case "dawn":
          play("dawn");
          play(state.lastDeaths.length ? "death" : "safe", 1.4);
          break;
        case "discussion":
          if (before.phase.kind !== "dawn" && before.phase.kind !== "hunter") play("bell");
          break;
        case "nominate":
        case "verdict":
          play("gavel");
          break;
        case "defense":
        case "nominateResult":
          play("drum");
          break;
        case "verdictResult": {
          const v = state.verdicts[state.verdicts.length - 1];
          play(v?.executed && !v.idiotRevealed ? "hang" : "spared");
          break;
        }
        case "gameOver":
          play(iWon(state) ? "win" : "lose");
          break;
        case "lobby":
          break;
      }
    }

    // The hunter fires.
    if (state.hunterShot && state.hunterShot !== before.hunterShot) play("gunshot");

    // Someone died outside the usual reveals (the host's hand, a hunter's bullet, heartbreak…).
    const aliveBefore = new Set(before.players.filter((p) => p.alive).map((p) => p.id));
    const newlyDead = state.players.filter((p) => !p.alive && aliveBefore.has(p.id));
    if (newlyDead.length && !phaseChanged && kind !== "lobby" && kind !== "gameOver") play("death", state.hunterShot !== before.hunterShot ? 0.4 : 0);

    // Lobby comings and goings.
    if (kind === "lobby" && before.phase.kind === "lobby") {
      if (state.players.length > before.players.length) play("join");
      else if (state.players.length < before.players.length) play("leave");
    }

    // Votes: my own ballot is a stamp, everybody else's a soft tap.
    if (state.vote && before.vote && state.vote.kind === before.vote.kind && !phaseChanged) {
      const mine = state.me?.myVote ?? null;
      const mineBefore = before.me?.myVote ?? null;
      if (mine && mine !== mineBefore) play("vote");
      else if (state.vote.voted > before.vote.voted) play("voteOther");
    }

    // My turn to act (night power, vote or hunter's shot).
    const turn = (s: ClientState) => !!(s.me && ((s.me.turn && !s.me.turn.done) || s.me.canVote || s.me.hunter?.canShoot));
    if (turn(state) && !turn(before)) play("turn", phaseChanged ? 0.9 : 0);
    // A night pick accepted by the server.
    const picks = (s: ClientState) => (s.me?.turn?.selected ?? []).join(",");
    if (state.me?.turn && picks(state) !== picks(before) && picks(state)) play("select");
  }, [state]);

  // Clock: ticks for the last five seconds, then a bell.
  const timer = state?.timer;
  const running = !!timer?.running && !!timer.endsAt;
  const endsAt = timer?.endsAt ?? 0;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  useEffect(() => {
    if (!running) return;
    let lastSecond = Infinity;
    const id = setInterval(() => {
      const left = endsAt - (Date.now() + offsetRef.current);
      const sec = Math.ceil(left / 1000);
      if (sec === lastSecond) return;
      const first = lastSecond === Infinity;
      lastSecond = sec;
      if (first) return;
      if (sec >= 1 && sec <= 5) play("tick");
      else if (sec <= 0) {
        play("timeUp");
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [running, endsAt]);
}
