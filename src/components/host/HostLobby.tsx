"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { MIN_PLAYERS } from "@shared/engine";
import { ROLES, ROLE_IDS, totalRoles } from "@shared/roles";
import type { Locale, RoleId } from "@shared/types";
import type { ClientState } from "@shared/views";
import { Avatar, RoleBadge, StyledName } from "@/components/ui";
import { ProfileLink } from "../Profile";
import { useT } from "@/lib/i18n";
import { socketUrl, storage } from "@/lib/socket";
import { useHostAction } from "./common";
import { RulesCard } from "./RulesCard";
import { SocialPanel } from "@/components/SocialPanel";
import { PasswordCard } from "@/components/PasswordField";

export function HostLobby({ state, hideRoles = false }: { state: ClientState; hideRoles?: boolean }) {
  return (
    <main className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)]">
      <div className="xl:min-h-0 xl:overflow-y-auto">
        <JoinCard state={state} />
        <div className="mt-4">
          <PasswordCard locked={state.locked} />
        </div>
      </div>
      <div className="flex flex-col gap-4 xl:min-h-0 xl:overflow-y-auto">
        <PlayersCard state={state} hideRoles={hideRoles} />
        <SocialPanel state={state} viewer="host" className="h-[min(72dvh,680px)] shrink-0" />
      </div>
      <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:overflow-y-auto">
        <RoleConfig state={state} />
        <RulesCard state={state} />
      </div>
    </main>
  );
}

function isLocalHost(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function useJoinUrl(code: string) {
  const [base, setBase] = useState("");
  const [lan, setLan] = useState<string[]>([]);
  useEffect(() => {
    const origin = window.location.origin;
    const saved = storage.get<string>("msn:baseUrl");
    const local = isLocalHost(window.location.hostname);
    setBase(local && saved ? saved : origin);
    if (local) {
      fetch(`${socketUrl()}/info`)
        .then((r) => r.json())
        .then((info: { lan: string[] }) => {
          const port = window.location.port ? `:${window.location.port}` : "";
          const opts = info.lan.map((ip) => `${window.location.protocol}//${ip}${port}`);
          setLan(opts);
          if (!saved && opts[0]) setBase(opts[0]);
        })
        .catch(() => {});
    }
  }, []);
  const choose = (b: string) => {
    setBase(b);
    storage.set("msn:baseUrl", b);
  };
  return { url: base ? `${base}/join/${code}` : "", base, lan, choose };
}

function JoinCard({ state }: { state: ClientState }) {
  const t = useT();
  const act = useHostAction();
  const { url, base, lan, choose } = useJoinUrl(state.code);
  const [isLocal, setIsLocal] = useState(false);
  useEffect(() => setIsLocal(isLocalHost(window.location.hostname)), []);
  return (
    <section className="card flex flex-col items-center gap-4 text-center">
      <h2 className="text-lg font-bold text-white/80">{t("host.scanToJoin")}</h2>
      <div className="rounded-lg bg-white p-4">
        {url ? <QRCodeSVG value={url} size={260} level="M" marginSize={0} /> : <div className="h-[260px] w-[260px]" />}
      </div>
      <div>
        <div className="ui-label">{t("host.roomCode")}</div>
        <div className="font-mono text-6xl font-black tracking-[0.25em] text-gold">{state.code}</div>
      </div>
      <div className="w-full text-sm text-white/60">
        {t("host.orGoTo")} <span className="font-mono break-all text-white">{url}</span>
      </div>
      {isLocal && (
        <div className="w-full rounded-xl border border-gold/30 bg-gold/10 p-3 text-left text-sm">
          <p className="mb-2 text-gold">{t("host.localhostWarning")}</p>
          <label className="ui-label" htmlFor="base">
            {t("host.phoneUrl")}
          </label>
          <select id="base" className="ui-select w-full" value={base} onChange={(e) => choose(e.target.value)}>
            {[...new Set([...lan, base, window.location.origin])].filter(Boolean).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="w-full text-left">
        <span className="ui-label">{t("host.roomLanguage")}</span>
        <div className="flex gap-2">
          {(["vi", "en"] as Locale[]).map((l) => (
            <button
              key={l}
              className={`btn btn-sm flex-1 ${state.roomLocale === l ? "bg-gold text-night-950" : "btn-ghost"}`}
              onClick={() => act({ type: "setLocale", locale: l })}
            >
              {t(`lang.${l}`)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlayersCard({ state, hideRoles = false }: { state: ClientState; hideRoles?: boolean }) {
  const t = useT();
  const act = useHostAction();
  const assigned = state.players.filter((p) => p.assignedRole).length;
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{t("host.players")}</h2>
        <span className="chip">{t("host.playerCount", { count: state.players.length })}</span>
        <span className="chip">{t("host.assignedCount", { count: assigned, total: state.players.length })}</span>
      </div>
      {state.players.length === 0 && <p className="py-8 text-center text-white/50">{t("host.noPlayers")}</p>}
      <ul className="flex flex-col gap-1.5">
        {state.players.map((p) => (
          <li key={p.id} className="rise flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2">
            <ProfileLink playerId={p.id} className="shrink-0">
              <Avatar p={p} size="sm" />
            </ProfileLink>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                <ProfileLink playerId={p.id} className="max-w-full">
                  <StyledName p={p} className="truncate" />
                </ProfileLink>
              </div>
              <div className="flex flex-wrap gap-1 text-[11px] text-white/50">
                <span className="chip py-0">{p.locale.toUpperCase()}</span>
                {p.isBot && <span className="chip py-0">🤖 {t("common.bot")}</span>}
                {!p.connected && !p.isBot && <span className="chip py-0 text-blood-light">{t("common.offline")}</span>}
              </div>
            </div>
            {hideRoles ? (
              // Roles hidden: nobody glancing at the host screen can see who got what.
              <span className="chip">{p.assignedRole ? "🂠 •••" : t("host.unassigned")}</span>
            ) : (
            <select
              className="ui-select max-w-[9.5rem]"
              value={p.assignedRole ?? ""}
              onChange={(e) =>
                act({ type: "assignManual", playerId: p.id, roleId: (e.target.value || null) as RoleId | null })
              }
              aria-label={t("host.role")}
            >
              <option value="">{t("host.unassigned")}</option>
              {ROLE_IDS.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].emoji} {t(`roles.${r}.name`)}
                </option>
              ))}
            </select>
            )}
            <button
              className="btn-ghost btn-sm"
              title={t("host.rename")}
              onClick={() => {
                const name = prompt(t("host.renamePrompt", { name: p.name }), p.name);
                if (name) act({ type: "rename", playerId: p.id, name });
              }}
            >
              ✏️
            </button>
            <button
              className="btn-ghost btn-sm text-blood-light"
              title={t("host.kick")}
              onClick={() => confirm(t("host.confirmKick", { name: p.name })) && act({ type: "kick", playerId: p.id })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap gap-2 border-t border-white/10 pt-3">
        <button
          className="btn-ghost btn-sm"
          disabled={state.players.length >= 8}
          onClick={() => act({ type: "addBots", count: 8 - state.players.length })}
        >
          🤖 {t("host.addBotsTo8")}
        </button>
        <button className="btn-ghost btn-sm" disabled={state.players.length >= 20} onClick={() => act({ type: "addBots", count: 1 })}>
          {t("host.addOneBot")}
        </button>
        <button className="btn-ghost btn-sm" disabled={!state.players.some((p) => p.isBot)} onClick={() => act({ type: "removeBots" })}>
          {t("host.removeBots")}
        </button>
        <p className="w-full text-xs text-white/40">{t("host.botHint")}</p>
      </div>
    </section>
  );
}

/** Role counts. `owner`: the room owner of a machine-host room (the machine deals and starts). */
export function RoleConfig({ state, owner = false }: { state: ClientState; owner?: boolean }) {
  const t = useT();
  const act = useHostAction();
  const counts = state.settings.roleCounts;
  const total = totalRoles(counts);
  const n = state.players.length;
  const assigned = state.players.filter((p) => p.assignedRole).length;
  const set = (r: RoleId, v: number) => act({ type: "setRoleCounts", roleCounts: { ...counts, [r]: Math.max(0, v) } });
  const suggested = state.suggested;
  const sameAsSuggested = suggested && ROLE_IDS.every((r) => suggested[r] === counts[r]);

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-xl font-bold">{t("host.roleConfig")}</h2>
      <ul className={`grid grid-cols-1 gap-1.5 ${owner ? "" : "sm:grid-cols-2"}`}>
        {ROLE_IDS.map((r) => (
          <li key={r} className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
            <span className="min-w-0 flex-1">
              <RoleBadge roleId={r} />
            </span>
            <button className="btn-ghost btn-sm w-8" onClick={() => set(r, counts[r] - 1)} disabled={counts[r] <= 0} aria-label="-">
              −
            </button>
            <span className="w-6 text-center font-mono text-lg font-bold">{counts[r]}</span>
            <button
              className="btn-ghost btn-sm w-8"
              onClick={() => set(r, counts[r] + 1)}
              disabled={ROLES[r].max !== undefined && counts[r] >= ROLES[r].max!}
              aria-label="+"
            >
              +
            </button>
          </li>
        ))}
      </ul>
      <div className={`rounded-xl p-2 text-sm ${total === n ? "bg-emerald-500/10 text-emerald-300" : "bg-blood/15 text-blood-light"}`}>
        {total === n ? t("host.totalRoles", { roles: total, players: n }) : t("host.mismatch", { roles: total, players: n })}
      </div>
      {suggested && n > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/60">
          <span>{t("host.suggestedFor", { count: n })}:</span>
          {ROLE_IDS.filter((r) => suggested[r] > 0).map((r) => (
            <span key={r} className="chip">
              {ROLES[r].emoji} ×{suggested[r]}
            </span>
          ))}
          <button className="btn-ghost btn-sm" disabled={!!sameAsSuggested} onClick={() => act({ type: "useSuggested" })}>
            {t("host.useSuggested")}
          </button>
        </div>
      )}
      {!owner && (
      <>
      <div className="border-t border-white/10 pt-3">
        <h3 className="mb-2 font-bold">{t("host.assignment")}</h3>
        <button className="btn-gold w-full" disabled={total !== n || n === 0} onClick={() => act({ type: "assignRandom" })}>
          {t("host.assignRandom")}
        </button>
        <p className="mt-1 text-xs text-white/40">{t("host.assignHint")}</p>
      </div>
      <button
        className="btn-primary py-4 text-lg"
        disabled={n < MIN_PLAYERS || assigned !== n}
        onClick={() => act({ type: "start" })}
      >
        🌙 {t("host.start")}
      </button>
      {n < MIN_PLAYERS && <p className="text-center text-xs text-white/40">{t("err.notEnoughPlayers", { min: MIN_PLAYERS })}</p>}
      </>
      )}
    </section>
  );
}
