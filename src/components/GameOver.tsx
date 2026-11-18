"use client";

import { ROLES } from "@shared/roles";
import type { LogEntry } from "@shared/types";
import type { ClientState } from "@shared/views";
import { formatLog, type T } from "@/lib/i18n";
import { Avatar, RoleBadge, StyledName } from "./ui";

const WIN_EMOJI = { wolves: "🐺", village: "🏡", lovers: "💘", draw: "🕯️" } as const;

export function WinnerBanner({ state, t, big = false }: { state: ClientState; t: T; big?: boolean }) {
  const w = state.winner;
  if (!w) return null;
  return (
    <div className="rise text-center">
      <div className={big ? "text-8xl" : "text-6xl"}>{WIN_EMOJI[w]}</div>
      <h2 className={`mt-3 font-display font-black text-moon ${big ? "text-6xl" : "text-3xl"}`}>{t(`winner.${w}.title`)}</h2>
      <p className={`mt-2 text-white/70 ${big ? "text-2xl" : ""}`}>{t(`winner.${w}.desc`)}</p>
    </div>
  );
}

export function RolesGrid({ state, compact = false }: { state: ClientState; compact?: boolean }) {
  const lovers = new Set(state.lovers ?? []);
  return (
    <ul className={`grid gap-2 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}>
      {state.players.map((p) => (
        <li
          key={p.id}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2"
          style={p.roleId ? { borderColor: `${ROLES[p.roleId].color}55` } : undefined}
        >
          <Avatar p={p} />
          <div className="min-w-0 flex-1">
            <div className={`truncate font-semibold ${p.alive ? "" : "text-white/50 line-through"}`}>
              <StyledName p={p} /> {lovers.has(p.id) && "💘"}
            </div>
            {p.roleId && <RoleBadge roleId={p.roleId} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function groupLabel(t: T, e: LogEntry, phaseKey: string) {
  if (phaseKey === "setup") return t("screen.setupLabel");
  return phaseKey.startsWith("n") ? t("screen.nightLabel", { n: e.night }) : t("screen.dayLabel", { n: e.day });
}

/** Timeline of nights and days, built from the public log entries. */
export function Timeline({ log, t }: { log: LogEntry[]; t: T }) {
  const groups: { key: string; first: LogEntry; items: LogEntry[] }[] = [];
  for (const e of log) {
    if (e.key === "log.join") continue;
    const key = e.night === 0 ? "setup" : e.day >= e.night ? `d${e.day}` : `n${e.night}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, first: e, items: [e] });
  }
  return (
    <ol className="relative space-y-4 border-l border-white/15 pl-5">
      {groups.map((g, i) => (
        <li key={`${g.key}-${i}`}>
          <span className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-night-950 bg-gold" />
          <h4 className="font-bold text-gold">
            {g.key.startsWith("n") ? "🌙 " : g.key.startsWith("d") ? "☀️ " : ""}
            {groupLabel(t, g.first, g.key)}
          </h4>
          <ul className="mt-1 space-y-0.5 text-sm text-white/80">
            {g.items
              .filter((e) => e.key !== "log.nightStart" && e.key !== "log.dayStart")
              .map((e, j) => (
                <li key={j}>{formatLog(t, e)}</li>
              ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
