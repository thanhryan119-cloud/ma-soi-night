"use client";

import { QRCodeSVG } from "qrcode.react";
import { ShareRoom } from "@/components/ShareRoom";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MIN_PLAYERS } from "@shared/engine";
import { ROLES, ROLE_IDS, SOLO_ROLES, emptyRoleCounts, isAdvancedRole, suggestRoles, totalRoles } from "@shared/roles";
import { balanceOf, fixBalance, type BalanceReason } from "@shared/balance";
import { PRESET_EMOJI, PRESET_IDS, presetRoles, type PresetId } from "@shared/presets";
import { AddBots } from "./AddBots";
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
      <ShareRoom code={state.code} className="w-full" />
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
                <option key={r} value={r} disabled={!!state.lockedRoles?.includes(r) && p.assignedRole !== r}>
                  {ROLES[r].emoji} {t(`roles.${r}.name`)}
                  {state.lockedRoles?.includes(r) ? " 🔒" : ""}
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
        <AddBots players={state.players.length} onAdd={(count) => act({ type: "addBots", count })} />
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
  // "Another suggestion": a random setup of the same shape from every role,
  // dealt here and sent as plain counts. Dropped when the player count changes.
  const [alt, setAlt] = useState<{ n: number; counts: Record<RoleId, number> } | null>(null);
  const suggested = alt?.n === n ? alt.counts : state.suggested;
  const sameAsSuggested = suggested && ROLE_IDS.every((r) => suggested[r] === counts[r]);
  const locked = state.lockedRoles ?? [];
  const isLocked = (r: RoleId) => locked.includes(r);

  const grid = `grid grid-cols-1 gap-1.5 ${owner ? "" : "sm:grid-cols-2"}`;
  const row = (r: RoleId) => (
    <li key={r} className="flex items-center gap-2 rounded-xl bg-white/5 p-2" title={t(`roles.${r}.desc`)}>
      <span className={`min-w-0 flex-1 ${isLocked(r) ? "opacity-50" : ""}`}>
        <RoleBadge roleId={r} />
        {isLocked(r) && (
          <span className="ml-1" title={t("freeRoles.lockedRole")}>
            🔒
          </span>
        )}
      </span>
      <button className="btn-ghost btn-sm w-8" onClick={() => set(r, counts[r] - 1)} disabled={counts[r] <= 0} aria-label="-">
        −
      </button>
      <span className="w-6 text-center font-mono text-lg font-bold">{counts[r]}</span>
      <button
        className="btn-ghost btn-sm w-8"
        onClick={() => set(r, counts[r] + 1)}
        disabled={isLocked(r) || (ROLES[r].max !== undefined && counts[r] >= ROLES[r].max!)}
        aria-label="+"
      >
        +
      </button>
    </li>
  );

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-xl font-bold">{t("host.roleConfig")}</h2>
      {n > 0 && <RoleMaps n={n} counts={counts} locked={locked} onUse={(c) => act({ type: "setRoleCounts", roleCounts: c })} />}
      {suggested && n > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/60">
          <span>{t("host.suggestedFor", { count: n })}:</span>
          {ROLE_IDS.filter((r) => suggested[r] > 0).map((r) => (
            <span key={r} className="chip">
              {ROLES[r].emoji} ×{suggested[r]}
            </span>
          ))}
          <button
            className="btn-ghost btn-sm"
            disabled={!!sameAsSuggested}
            onClick={() => act(alt?.n === n ? { type: "setRoleCounts", roleCounts: alt.counts } : { type: "useSuggested" })}
          >
            {t("host.useSuggested")}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setAlt({ n, counts: suggestRoles(n, ROLE_IDS.filter((r) => !isLocked(r)), Math.random) })}>
            🎲 {t("host.otherSuggestion")}
          </button>
        </div>
      )}
      <ul className={grid}>{BASIC_ROLES.map(row)}</ul>
      <RoleGroup title={t("host.groupAdvanced")} roles={ADVANCED_ROLES} counts={counts} grid={grid} row={row} />
      <RoleGroup title={t("host.groupSolo")} roles={SOLO_GROUP} counts={counts} grid={grid} row={row} />
      {locked.length > 0 && (
        <p className="rounded-xl bg-white/5 p-2 text-xs text-white/60">
          🔒 {t("freeRoles.lockedHint")}{" "}
          <Link href="/shop#shop-role" className="font-semibold text-gold hover:underline">
            {t("freeRoles.toShop")}
          </Link>
        </p>
      )}
      <div className={`rounded-xl p-2 text-sm ${total === n ? "bg-emerald-500/10 text-emerald-300" : "bg-blood/15 text-blood-light"}`}>
        {total === n ? t("host.totalRoles", { roles: total, players: n }) : t("host.mismatch", { roles: total, players: n })}
      </div>
      <BalanceAlert state={state} owner={owner} locked={locked} />
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
      <button className="btn-gold py-3" title={t("owner.playNowDesc")} onClick={() => act({ type: "playNow" })}>
        ▶ {t("owner.playNow")}
      </button>
      <p className="-mt-2 text-center text-xs text-white/40">{t("owner.playNowDesc")}</p>
      {n < MIN_PLAYERS && <p className="text-center text-xs text-white/40">{t("err.notEnoughPlayers", { min: MIN_PLAYERS })}</p>}
      </>
      )}
    </section>
  );
}

/** Ready-made role maps: pick one to see what it deals for this table, then use it. */
function RoleMaps({
  n,
  counts,
  locked,
  onUse,
}: {
  n: number;
  counts: Record<RoleId, number>;
  locked: RoleId[];
  onUse: (counts: Record<RoleId, number>) => void;
}) {
  const t = useT();
  const [pick, setPick] = useState<PresetId | null>(null);
  const open = ROLE_IDS.filter((r) => !locked.includes(r));
  const map = pick ? presetRoles(pick, n, open) : null;
  const same = map && ROLE_IDS.every((r) => map.counts[r] === counts[r]);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 p-2">
      <span className="text-sm font-bold">{t("presets.title", { count: n })}</span>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`btn-sm ${pick === id ? "btn-gold" : "btn-ghost"}`}
            aria-pressed={pick === id}
            onClick={() => setPick(pick === id ? null : id)}
          >
            {PRESET_EMOJI[id]} {t(`presets.${id}.name`)}
          </button>
        ))}
      </div>
      {pick && map && (
        <div className="flex flex-col gap-2 text-sm text-white/70">
          <p>{t(`presets.${pick}.desc`)}</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_IDS.filter((r) => map.counts[r] > 0).map((r) => (
              <span key={r} className="chip">
                {ROLES[r].emoji} {t(`roles.${r}.name`)} ×{map.counts[r]}
              </span>
            ))}
          </div>
          {map.missing.length > 0 && (
            <p className="text-xs text-white/50">
              🔒 {t("presets.partial")} {map.missing.map((r) => ROLES[r].emoji).join(" ")}
            </p>
          )}
          <button className="btn-gold btn-sm self-start" disabled={!!same} onClick={() => onUse(map.counts)}>
            {same ? t("presets.inUse") : t("presets.use")}
          </button>
        </div>
      )}
    </div>
  );
}

const SOLO_GROUP: RoleId[] = [...SOLO_ROLES];
/** The classic roles: always shown. */
const BASIC_ROLES = ROLE_IDS.filter((r) => !isAdvancedRole(r) && !SOLO_GROUP.includes(r));
/** Advanced roles of the village and the wolves: folded away until opened. */
const ADVANCED_ROLES = ROLE_IDS.filter((r) => !BASIC_ROLES.includes(r) && !SOLO_GROUP.includes(r));

/** A folded group of roles. The header lists the ones in play, so nothing in the setup is hidden. */
function RoleGroup({
  title,
  roles,
  counts,
  grid,
  row,
}: {
  title: string;
  roles: RoleId[];
  counts: Record<RoleId, number>;
  grid: string;
  row: (r: RoleId) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const inPlay = roles.filter((r) => counts[r] > 0);
  return (
    <div className="rounded-xl border border-white/10">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-2 p-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-bold">
          {open ? "▾" : "▸"} {title}
        </span>
        <span className="text-xs text-white/40">({roles.length})</span>
        {!open &&
          inPlay.map((r) => (
            <span key={r} className="chip">
              {ROLES[r].emoji} ×{counts[r]}
            </span>
          ))}
      </button>
      {open && <ul className={`${grid} px-2 pb-2`}>{roles.map(row)}</ul>}
    </div>
  );
}

const LEVEL_STYLE = ["", "border-gold/40 bg-gold/10 text-gold", "border-orange-400/50 bg-orange-500/10 text-orange-300", "border-blood/60 bg-blood/15 text-blood-light"];

/**
 * Warns when the setup leans too far to one side, says why, and offers a fix.
 * Uses the roles handed out by hand once everyone has one, the role counts otherwise.
 */
function BalanceAlert({ state, owner, locked }: { state: ClientState; owner: boolean; locked: RoleId[] }) {
  const t = useT();
  const act = useHostAction();
  const n = state.players.length;
  const counts = state.settings.roleCounts;
  const dealt = emptyRoleCounts();
  for (const p of state.players) if (p.assignedRole) dealt[p.assignedRole]++;
  const byHand = n > 0 && state.players.every((p) => p.assignedRole) && ROLE_IDS.some((r) => dealt[r] !== counts[r]);
  const setup = byHand ? dealt : counts;
  if (n === 0 || totalRoles(setup) !== n) return null;
  const b = balanceOf(setup);
  if (!b.leans) return <p className="text-center text-xs text-emerald-300/80">{t("host.balance.fair")}</p>;

  const open = ROLE_IDS.filter((r) => !locked.includes(r));
  const fix = fixBalance(setup, open);
  const name = (r: RoleId) => `${ROLES[r].emoji} ${t(`roles.${r}.name`)}`;
  const reason = (r: BalanceReason) => {
    switch (r.key) {
      case "noWolves":
      case "noSeer":
        return t(`host.balance.${r.key}`);
      case "packHalf":
        return t("host.balance.packHalf", { wolves: r.wolves, players: r.players });
      case "packSize":
        return t(r.wolves > r.ideal ? "host.balance.packBig" : "host.balance.packSmall", { wolves: r.wolves, players: r.players, ideal: r.ideal });
      case "strongRoles":
        return t(r.side === "wolves" ? "host.balance.strongWolves" : "host.balance.strongVillage", { roles: r.roles.map(name).join(", ") });
      case "solos":
        return t("host.balance.solos", { count: r.count });
    }
  };
  const apply = async (roleCounts: Record<RoleId, number>) => {
    await act({ type: "setRoleCounts", roleCounts });
    // Roles were handed out by hand: deal the new setup so the fix takes effect.
    if (byHand && !owner) await act({ type: "assignRandom" });
  };
  const standard = state.suggested && !ROLE_IDS.every((r) => state.suggested![r] === setup[r]) ? state.suggested : null;

  return (
    <div role="alert" className={`flex flex-col gap-2 rounded-xl border p-3 text-sm ${LEVEL_STYLE[b.level]}`}>
      <div className="flex flex-wrap items-center gap-2 font-bold">
        <span>{b.leans === "wolves" ? "🐺" : "🏘️"} ⚠️ {t(`host.balance.${b.leans}`)}</span>
        <span className="chip py-0 text-[11px]">{t(`host.balance.level${b.level}`)}</span>
      </div>
      {byHand && <p className="text-xs opacity-80">{t("host.balance.fromAssignment")}</p>}
      <div>
        <div className="ui-label">{t("host.balance.why")}</div>
        <ul className="list-disc space-y-0.5 pl-5 text-white/80">
          {b.reasons.map((r, i) => (
            <li key={i}>{reason(r)}</li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-white/50">{t("host.balance.score", { score: b.score > 0 ? `+${b.score}` : b.score, limit: b.limit })}</p>
      </div>
      {(fix || standard) && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
          <div className="ui-label">{t("host.balance.suggest")}</div>
          {fix && (
            <>
              <p className="text-white/80">{t("host.balance.suggestFix", { count: fix.swaps.length })}</p>
              <ul className="flex flex-col gap-1">
                {fix.swaps.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-1.5">
                    <span className="chip line-through opacity-70">{name(s.from)}</span>
                    <span aria-hidden>→</span>
                    <span className="chip">{name(s.to)}</span>
                  </li>
                ))}
              </ul>
              {!fix.fair && <p className="text-xs text-white/50">{t("host.balance.partial")}</p>}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {fix && (
              <button className="btn-gold btn-sm" onClick={() => apply(fix.counts)}>
                {byHand && !owner ? t("host.balance.applyDeal") : t("host.balance.apply")}
              </button>
            )}
            {standard && (
              <button className="btn-ghost btn-sm" onClick={() => apply(standard)}>
                {t("host.balance.useSuggested", { count: n })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
