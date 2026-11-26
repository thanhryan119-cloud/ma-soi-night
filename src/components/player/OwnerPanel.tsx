"use client";

// Machine-host rooms: the room owner sets the room up from their phone (players,
// bots, roles, rules, password) and starts the game; the machine deals the
// roles and narrates, so the owner never sees anyone's role.

import { MIN_PLAYERS } from "@shared/engine";
import { MACHINE_FORCED } from "@shared/multiplayer";
import { ROLE_IDS, totalRoles } from "@shared/roles";
import type { OwnerAction, Settings } from "@shared/types";
import type { ClientState } from "@shared/views";
import { HostActionProvider } from "@/components/host/common";
import { AddBots } from "@/components/host/AddBots";
import { RoleConfig } from "@/components/host/HostLobby";
import { RulesCard } from "@/components/host/RulesCard";
import { PasswordCard } from "@/components/PasswordField";
import { ProfileLink } from "@/components/Profile";
import { Avatar, RoleBadge, StyledName, useErrorToast } from "@/components/ui";
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

  // The owner setting up the lobby: one compact row of buttons, so the setup below gets the room.
  if (iOwn && kind === "lobby")
    return (
      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex gap-1.5">
          <button className="btn-ghost btn-sm shrink-0 px-3" onClick={onSettings} title={t("owner.settings")}>
            ⚙️<span className="sr-only">{t("owner.settings")}</span>
          </button>
          <button className="btn-primary btn-sm min-w-0 flex-1 truncate" disabled={!ready} onClick={() => act({ type: "start" })}>
            🌙 {t("host.start")}
          </button>
          <button className="btn-gold btn-sm min-w-0 flex-1 truncate" title={t("owner.playNowDesc")} onClick={() => act({ type: "playNow" })}>
            ▶ {t("owner.playNow")}
          </button>
          {state.locked && <span className="self-center" title={t("lobby.locked")}>🔒</span>}
        </div>
        {!ready && (
          <p className="text-xs text-white/50">
            {n < MIN_PLAYERS
              ? t("err.notEnoughPlayers", { min: MIN_PLAYERS })
              : t("host.mismatch", { roles: totalRoles(state.settings.roleCounts), players: n })}
          </p>
        )}
      </div>
    );

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
          <button className="btn-ghost btn-sm shrink-0 px-4" onClick={onSettings} title={t("owner.settings")}>
            ⚙️<span className="sr-only">{t("owner.settings")}</span>
          </button>
          <button className="btn-primary btn-sm flex-1" disabled={!ready} onClick={() => act({ type: "start" })}>
            🌙 {t("host.start")}
          </button>
        </div>
      )}
      {iOwn && kind === "lobby" && (
        <button className="btn-gold btn-sm" title={t("owner.playNowDesc")} onClick={() => act({ type: "playNow" })}>
          ▶ {t("owner.playNow")}
        </button>
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

/**
 * Bots and roles, right in the lobby for everyone to see: the owner of a
 * machine-host room changes them here, everyone else sees what is set.
 */
export function LobbySetup({ state }: { state: ClientState }) {
  const t = useT();
  const act = useOwnerAction();
  const iOwn = !!state.machineHost && !!state.me && state.ownerId === state.me.id;
  const n = state.players.length;
  const bots = state.players.filter((p) => p.isBot).length;
  const counts = state.settings.roleCounts;
  const total = totalRoles(counts);

  const botsRow = (
    <section className="card flex flex-wrap items-center gap-2 p-2.5">
      <h3 className="min-w-0 flex-1 font-bold whitespace-nowrap">🤖 {t("lobbySetup.bots", { count: bots })}</h3>
      {iOwn && <AddBots players={n} onAdd={(count) => act({ type: "addBots", count })} />}
      {iOwn && (
        <button className="btn-ghost btn-sm" disabled={!bots} onClick={() => act({ type: "removeBots" })}>
          {t("host.removeBots")}
        </button>
      )}
    </section>
  );

  if (iOwn)
    return (
      <HostActionProvider value={(a) => sendOwner(a as OwnerAction)}>
        <div className="flex flex-col gap-3">
          {botsRow}
          <RoleConfig state={state} owner />
        </div>
      </HostActionProvider>
    );

  return (
    <div className="flex flex-col gap-3">
      {botsRow}
      <section className="card flex flex-col gap-2 p-3">
        <h3 className="font-bold">🃏 {t("host.roleConfig")}</h3>
        {total ? (
          <ul className="flex flex-wrap gap-1.5">
            {ROLE_IDS.filter((r) => counts[r] > 0).map((r) => (
              <li key={r} className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-sm" title={t(`roles.${r}.desc`)}>
                <RoleBadge roleId={r} /> <b className="font-mono">×{counts[r]}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/50">{t("lobbySetup.noRoles")}</p>
        )}
        <p className={`rounded-lg p-1.5 text-xs ${total === n ? "bg-emerald-500/10 text-emerald-300" : "bg-blood/15 text-blood-light"}`}>
          {total === n ? t("host.totalRoles", { roles: total, players: n }) : t("host.mismatch", { roles: total, players: n })}
        </p>
      </section>
    </div>
  );
}

/** What the owner can change before the game besides bots and roles (shown in the lobby). */
export function OwnerSettings({ state }: { state: ClientState }) {
  const t = useT();
  const act = useOwnerAction();
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
              {p.id !== state.ownerId && !p.isBot && p.connected && (
                <button
                  className="btn-ghost btn-sm"
                  title={t("owner.makeOwner")}
                  aria-label={t("owner.makeOwner")}
                  onClick={() => confirm(t("owner.confirmMakeOwner", { name: p.name })) && act({ type: "transferOwner", playerId: p.id })}
                >
                  👑
                </button>
              )}
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
      </section>
      <PasswordCard locked={state.locked} />
      <RulesCard state={state} defaultOpen={false} hidden={LOCKED} />
    </HostActionProvider>
  );
}
