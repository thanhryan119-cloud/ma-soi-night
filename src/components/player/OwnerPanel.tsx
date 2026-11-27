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
import { ShareRoom } from "@/components/ShareRoom";
import { ProfileLink } from "@/components/Profile";
import { useState } from "react";
import { Avatar, RoleBadge, StyledName, toast, useErrorToast } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { emitAck } from "@/lib/socket";
import { useNow } from "@/lib/useRoom";

/** Switches the machine always keeps on, plus the projector-only one. */
const LOCKED: (keyof Settings)[] = [...(Object.keys(MACHINE_FORCED) as (keyof Settings)[]), "bilingualScreen"];
const sendOwner = (action: OwnerAction) => emitAck("owner:action", action);
/** The owner's lobby toolbar buttons: small, so the setup below keeps the room. */
const TOOL = "btn-sm gap-1.5 whitespace-nowrap";

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

  // The owner setting up the lobby: one slim row of small buttons (share and
  // settings sit in the header, see OwnerTools), so the bots and roles get the room.
  if (iOwn && kind === "lobby")
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button className={`btn-primary ${TOOL}`} disabled={!ready} onClick={() => act({ type: "start" })}>
          🌙 {t("host.start")}
        </button>
        <button className={`btn-gold ${TOOL}`} title={t("owner.playNowDesc")} onClick={() => act({ type: "playNow" })}>
          ▶ {t("owner.playNow")}
        </button>
        {!ready && (
          <span className="text-xs text-white/50">
            {n < MIN_PLAYERS
              ? t("err.notEnoughPlayers", { min: MIN_PLAYERS })
              : t("host.mismatch", { roles: totalRoles(state.settings.roleCounts), players: n })}
          </span>
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

/** The lobby owner's small header buttons: lock badge, share the invite link, room settings. */
export function OwnerTools({ state, onSettings }: { state: ClientState; onSettings: () => void }) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {state.locked && <span title={t("lobby.locked")}>🔒</span>}
      <ShareRoom code={state.code} toolbar />
      <button className={`btn-ghost ${TOOL}`} onClick={onSettings} title={t("owner.settings")}>
        ⚙️<span className="sr-only">{t("owner.settings")}</span>
      </button>
    </div>
  );
}

/** Few people for this long: suggest bots so the game can start now. */
const BOT_HINT_AFTER_MS = 45_000;

/**
 * Lobby helpers everyone sees, so a room never waits on one person: the
 * countdown before the game starts by itself, taking over from an owner (or
 * host) who walked away, and adding bots when too few people are here.
 */
export function LobbyHelp({ state, offset }: { state: ClientState; offset: number }) {
  const t = useT();
  const act = useOwnerAction();
  const showError = useErrorToast();
  const [since] = useState(() => Date.now());
  const local = useNow(500);
  const now = local + offset;
  if (state.phase.kind !== "lobby" || !state.me) return null;
  const iOwn = state.machineHost && state.me.id === state.ownerId;
  const humans = state.players.filter((p) => !p.isBot && p.connected).length;
  const cards: React.ReactNode[] = [];

  if (state.autoStartAt) {
    const secs = Math.max(0, Math.ceil((state.autoStartAt - now) / 1000));
    cards.push(
      <div key="auto" className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-2.5 text-sm">
        <span className="min-w-0 flex-1">
          <b className="text-emerald-200">⏳ {t("lobbyHelp.autoStart", { n: secs })}</b>
          <span className="block text-xs text-white/60">{t("lobbyHelp.autoStartDesc")}</span>
        </span>
        {iOwn && (
          <button className="btn-ghost btn-sm shrink-0" onClick={() => act({ type: "holdAutoStart" })}>
            {t("lobbyHelp.hold")}
          </button>
        )}
      </div>,
    );
  }

  if (state.leaderAway) {
    cards.push(
      iOwn ? (
        <div key="away" className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 p-2.5 text-sm">
          <span className="min-w-0 flex-1">👀 {t("lobbyHelp.youAway")}</span>
          <button className="btn-gold btn-sm shrink-0">{t("lobbyHelp.imHere")}</button>
        </div>
      ) : (
        <div key="away" className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 p-2.5 text-sm">
          <span className="min-w-0 flex-1">💤 {t(state.machineHost ? "lobbyHelp.ownerAway" : "lobbyHelp.hostAway")}</span>
          <button className="btn-gold btn-sm shrink-0" onClick={async () => showError(await emitAck("room:claim"))}>
            👑 {t("lobbyHelp.claim")}
          </button>
        </div>
      ),
    );
  }

  // The owner already has the play-with-bots button in their toolbar.
  if (!iOwn && !state.autoStartAt && humans < MIN_PLAYERS && local - since >= BOT_HINT_AFTER_MS) {
    cards.push(
      <div key="bots" className="flex flex-col gap-2 rounded-xl border border-white/15 bg-white/5 p-2.5 text-sm">
        <span>
          🤖 {t("lobbyHelp.fewPeople", { n: humans, min: MIN_PLAYERS })}
          <span className="block text-xs text-white/60">{t("lobbyHelp.botsOther")}</span>
        </span>
        {!state.leaderAway && (
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              const res = await emitAck("room:nudge");
              if (res.ok) toast(t("lobbyHelp.nudgeSent"), "info");
              else showError(res);
            }}
          >
            📣 {t("lobbyHelp.nudge")}
          </button>
        )}
      </div>,
    );
  }

  if (!cards.length) return null;
  return <div className="flex shrink-0 flex-col gap-1.5">{cards}</div>;
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
    <section className="card flex flex-wrap items-center gap-2 px-3 py-1.5">
      <h3 className="min-w-0 flex-1 truncate text-sm font-bold">🤖 {t("lobbySetup.bots", { count: bots })}</h3>
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
