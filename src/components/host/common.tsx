"use client";

import { stepActorsAlive } from "./scriptHelpers";
import type { HostAction } from "@shared/types";
import type { ClientState } from "@shared/views";
import { useErrorToast } from "@/components/ui";
import type { T } from "@/lib/i18n";
import { emitAck } from "@/lib/socket";

export function useHostAction() {
  const showError = useErrorToast();
  return async (action: HostAction) => showError(await emitAck("host:action", action));
}

export const nameOf = (state: ClientState, id: string | null | undefined) =>
  state.players.find((p) => p.id === id)?.name ?? "?";

/** Narration lines for the Host to read aloud in the current phase. */
export function scriptLines(state: ClientState, t: T): string[] {
  const k = state.phase.kind;
  const names = (ids: string[]) => ids.map((id) => nameOf(state, id)).join(", ");
  switch (k) {
    case "lobby":
      return [t("script.lobby")];
    case "roleReveal":
      return [t("script.roleReveal")];
    case "night": {
      const step = state.night.step;
      const lines: string[] = [];
      if (state.phase.stepIndex === 0) lines.push(t("script.nightStart", { n: state.phase.night }));
      if (step) {
        lines.push(t(`script.step.${step}`));
        if (!stepActorsAlive(state, step)) lines.push(t("script.stepNobody"));
      }
      return lines;
    }
    case "dawn":
      return [
        state.lastDeaths.length
          ? t("script.dawnDeaths", { names: names(state.lastDeaths.map((d) => d.playerId)) })
          : t("script.dawnNone"),
      ];
    case "hunter": {
      const lines = [t("script.hunter", { name: nameOf(state, state.hunterId) })];
      if (state.hunterShot !== null)
        lines.push(state.hunterShot ? t("script.hunterShot", { name: nameOf(state, state.hunterShot) }) : t("script.hunterMissed"));
      return lines;
    }
    case "discussion":
      return [t("script.discussion")];
    case "nominate":
      return [t("script.nominate")];
    case "defense":
      return [t("script.defense", { names: names(state.nominees) })];
    case "verdict":
      return [t("script.verdict", { name: nameOf(state, state.vote?.nomineeId) })];
    case "verdictResult": {
      const r = state.verdicts[state.verdicts.length - 1];
      if (!r) return [];
      return [
        t(r.executed ? "script.verdictExecuted" : "script.verdictSpared", {
          name: nameOf(state, r.nomineeId),
          execute: r.execute,
          spare: r.spare,
        }),
      ];
    }
    case "gameOver":
      return [t("script.gameOver")];
  }
}
