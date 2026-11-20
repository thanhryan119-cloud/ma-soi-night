"use client";

// Machine-host rooms: the room owner sets the room up from their phone (players,
// bots, roles, rules, password) and starts the game; the machine deals the
// roles and narrates, so the owner never sees anyone's role.

import { MIN_PLAYERS } from "@shared/engine";
import { MACHINE_FORCED } from "@shared/multiplayer";
import { totalRoles } from "@shared/roles";
import type { OwnerAction, Settings } from "@shared/types";
import type { ClientState } from "@shared/views";
import { HostActionProvider } from "@/components/host/common";
import { RoleConfig } from "@/components/host/HostLobby";
import { RulesCard } from "@/components/host/RulesCard";
import { PasswordCard } from "@/components/PasswordField";
import { ProfileLink } from "@/components/Profile";
import { Avatar, StyledName, useErrorToast } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { emitAck } from "@/lib/socket";

/** Switches the machine always keeps on, plus the projector-only one. */
const LOCKED: (keyof Settings)[] = [...(Object.keys(MACHINE_FORCED) as (keyof Settings)[]), "bilingualScreen"];
const sendOwner = (action: OwnerAction) => emitAck("owner:action", action);

function useOwnerAction() {
  const showError = useErrorToast();
  return async (action: OwnerAction) => showError(await sendOwner(action));
}

/** Who runs the room, and the owner's buttons (lobby: settings + start, game over: new game). */
export function OwnerBar({ state, onSettings }: { state: ClientState; onSettings: () => void }) {
  const t = useT();
  const act = useOwnerAction();
  if (!state.machineHost) return null;
  const me = state.me?.id;
  const owner = state.players.find((p) => p.id === state.ownerId);
  const iOwn = !!me && me === state.ownerId;
  const kind = state.phase.kind;
  const n = state.players.length;
  const ready = n >= MIN_PLAYERS && totalRoles(state.settings.roleCounts) === n;

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-gold/30 bg-gold/5 p-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          🤖 {t("owner.machineHosts")}
          {owner && (
            <>
              {" · 👑 "}
              {iOwn ? <b>{t("owner.youOwn")}</b> : t("owner.ownerIs", { name: owner.name })}
            </>
          )}
        </span>
        {state.locked && <span title={t("lobby.locked")}>🔒</span>}
      </div>
      {iOwn && kind === "lobby" && (
        <div className="flex gap-2">
          <button className="btn-ghost btn-sm flex-1" onClick={onSettings}>
            ⚙️ {t("owner.settings")}
          </button>
          <button className="btn-primary btn-sm flex-1" disabled={!ready} onClick={() => act({ type: "start" })}>
            🌙 {t("host.start")}
          </button>
        </div>
      )}
      {iOwn && kind === "lobby" && !ready && (
        <p className="text-xs text-white/50">
          {n < MIN_PLAYERS
            ? t("err.notEnoughPlayers", { min: MIN_PLAYERS })
            : t("host.mismatch", { roles: totalRoles(state.settings.roleCounts), players: n })}
        </p>
      )}
      {iOwn && kind === "gameOver" && (
        <button className="btn-primary btn-sm" onClick={() => act({ type: "newGame" })}>
          🔁 {t("host.newGame")}
        </button>
      )}
    </div>
  );
}

/** Everything the owner can change before the game. */
export function OwnerSettings({ state }: { state: ClientState }) {
  const t = useT();
  const act = useOwnerAction();
  const n = state.players.length;
  const bots = state.players.filter((p) => p.isBot).length;
  return (
    <HostActionProvider value={(a) => sendOwner(a as OwnerAction)}>
      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("host.players")}</h2>
        <ul className="flex flex-col gap-1.5">
          {state.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-1.5">
              <ProfileLink playerId={p.id} className="shrink-0">
                <Avatar p={p} size="sm" />
              </ProfileLink>
              <span className="min-w-0 flex-1 truncate font-semibold">
                <StyledName p={p} /> {p.id === state.ownerId && "👑"} {p.isBot && "🤖"}
              </span>
              {p.id !== state.ownerId && (
                <button
                  className="btn-ghost btn-sm"
                  title={t("host.kick")}
                  onClick={() => confirm(t("host.confirmKick", { name: p.name })) && act({ type: "kick", playerId: p.id })}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {n < 8 && (
            <button className="btn-ghost btn-sm" onClick={() => act({ type: "addBots", count: 8 - n })}>
              🤖 {t("host.addBotsTo8")}
            </button>
          )}
          <button className="btn-ghost btn-sm" onClick={() => act({ type: "addBots", count: 1 })}>
            {t("host.addOneBot")}
          </button>
          <button className="btn-ghost btn-sm" disabled={!bots} onClick={() => act({ type: "removeBots" })}>
            {t("host.removeBots")}
          </button>
        </div>
      </section>
      <RoleConfig state={state} owner />
      <PasswordCard locked={state.locked} />
      <RulesCard state={state} defaultOpen={false} hidden={LOCKED} />
    </HostActionProvider>
  );
}
