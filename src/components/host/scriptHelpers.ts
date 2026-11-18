import type { NightStepId } from "@shared/types";
import type { ClientState } from "@shared/views";

/** True if at least one living player acts in this night step (host view only). */
export function stepActorsAlive(state: ClientState, step: NightStepId): boolean {
  const s = state.night.stepStatus?.find((x) => x.step === step);
  return !!s && s.actors.length > 0;
}
