"use client";

import { ROLES } from "@shared/roles";
import type { LogEntry } from "@shared/types";
import type { ClientState } from "@shared/views";
import { formatLog, type T } from "@/lib/i18n";
import { Avatar, RoleBadge, StyledName } from "./ui";
import { SceneArt } from "./art/Woodcut";

export function WinnerBanner({ state, t, big = false }: { state: ClientState; t: T; big?: boolean }) {
  const w = state.winner;
  if (!w) return null;
  return (
    <div className="rise text-center">
      <SceneArt scene={w === "wolves" ? "wolves" : w === "village" ? "village" : w === "lovers" ? "lovers" : "draw"} className={`mx-auto w-full ${big ? "max-w-xl" : "max-w-xs"}`} />
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

type Section = "step" | "dawn" | "nominate" | "defense" | "verdict" | "hunter" | "host" | "other";

/** Which part of a night or day an entry belongs to (null: stays in the current part). */
function sectionOf(key: string, inNight: boolean, current: Section | null): Section | null {
  if (key === "log.step") return "step";
  if (key === "log.verdictStart") return "verdict";
  if (/^log\.host\./.test(key)) return current ?? "host";
  if (inNight && (/^log\.savedBy/.test(key) || /^log\.death\./.test(key) || key === "log.noDeath")) return "dawn";
  if (key === "log.voteNominate" || key === "log.voteSkip") return "nominate";
  if (key === "log.nominationTally" || key === "log.nominated" || key === "log.nominateNone" || key === "log.nominateTieRevote") return "nominate";
  if (key === "log.defenseDone") return "defense";
  if (/^log\.voteVerdict/.test(key) || key === "log.executed" || key === "log.spared" || key === "log.death.execution") return "verdict";
  if (key === "log.hunterShot" || key === "log.hunterNoShot" || key === "log.death.hunter") return "hunter";
  if (key === "log.voteRandom") return current === "verdict" ? "verdict" : "nominate";
  return current ? null : "other";
}

const SECTION_ICON: Record<Section, string> = {
  step: "🔔",
  dawn: "🌅",
  nominate: "🗳️",
  defense: "⚖️",
  verdict: "🪢",
  hunter: "🏹",
  host: "🛠️",
  other: "•",
};

/**
 * The story of the game, night by night and day by day. Inside each, the big
 * headings are the moments (each role called at night, the night's outcome,
 * the nomination vote, the defense, the verdict, the hunter) and every action
 * that happened in that moment is listed indented underneath.
 */
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
    <ol className="relative space-y-5 border-l border-white/15 pl-5">
      {groups.map((g, i) => {
        const inNight = g.key.startsWith("n");
        const sections: { kind: Section; head: LogEntry | null; items: LogEntry[] }[] = [];
        for (const e of g.items) {
          if (e.key === "log.nightStart" || e.key === "log.dayStart") continue;
          const cur = sections[sections.length - 1];
          const kind = sectionOf(e.key, inNight, cur?.kind ?? null);
          // A new heading for each role call, and whenever the kind of moment changes.
          const headed = e.key === "log.step" || e.key === "log.verdictStart";
          if (kind && (headed || !cur || cur.kind !== kind || (kind === "nominate" && cur.items.some((x) => x.key === "log.nominateTieRevote")))) {
            sections.push({ kind, head: headed ? e : null, items: headed ? [] : [e] });
          } else if (cur) cur.items.push(e);
          else sections.push({ kind: "other", head: null, items: [e] });
        }
        return (
          <li key={`${g.key}-${i}`}>
            <span className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-night-950 bg-gold" />
            <h4 className="font-display text-lg font-bold text-gold">
              {inNight ? "🌙 " : g.key.startsWith("d") ? "☀️ " : ""}
              {groupLabel(t, g.first, g.key)}
            </h4>
            <div className="mt-1.5 space-y-2">
              {sections.map((sec, j) => (
                <div key={j}>
                  {sec.kind !== "other" && (
                    <div className="text-sm font-bold text-moon">
                      {SECTION_ICON[sec.kind]} {sec.head ? formatLog(t, sec.head) : t(`timeline.${sec.kind}`)}
                    </div>
                  )}
                  <ul className={`space-y-0.5 text-sm text-white/80 ${sec.kind !== "other" ? "ml-2 border-l border-white/15 pl-3" : ""}`}>
                    {sec.items.map((e, k) => (
                      <li key={k} className={e.public ? "text-white" : undefined}>
                        {formatLog(t, e)}
                      </li>
                    ))}
                    {sec.kind === "step" && !sec.items.length && <li className="text-white/40">—</li>}
                  </ul>
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
