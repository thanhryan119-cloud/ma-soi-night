"use client";

import type { ClientState, PlayerView } from "@shared/views";
import type { T } from "@/lib/i18n";
import { Avatar, StyledName } from "./ui";

type Size = "sm" | "lg";

/**
 * Who voted for what — revealed only after the (secret) vote is closed.
 * Works for the nomination vote (phase nominateResult/defense) and the
 * execute/spare vote (last verdict, phase verdictResult).
 */
export function VoteBreakdown({ state, t, size = "sm" }: { state: ClientState; t: T; size?: Size }) {
  const players = new Map(state.players.map((p) => [p.id, p]));
  const lg = size === "lg";

  if (state.phase.kind === "verdictResult") {
    const r = state.verdicts[state.verdicts.length - 1];
    if (!r) return null;
    const ballots = r.ballots;
    const voters = (choice: string) => (ballots ? Object.keys(ballots).filter((v) => ballots[v] === choice) : []);
    const voted = new Set(Object.keys(ballots ?? {}));
    const eligible = state.players.filter(
      (p) => !state.nominees.includes(p.id) && (p.alive || r.deaths.some((d) => d.playerId === p.id)),
    );
    const abstained = ballots ? eligible.filter((p) => !voted.has(p.id)).map((p) => p.id) : [];
    return (
      <Frame t={t} lg={lg} anonymous={!ballots}>
        <Row lg={lg} tone="red" label={`🪢 ${t("player.execute")}`} count={r.execute} ids={voters("execute")} players={players} t={t} />
        <Row lg={lg} tone="green" label={`🕊️ ${t("player.spare")}`} count={r.spare} ids={voters("spare")} players={players} t={t} />
        {abstained.length > 0 && (
          <Row lg={lg} tone="muted" label={t("vote.noVote")} count={abstained.length} ids={abstained} players={players} t={t} />
        )}
      </Frame>
    );
  }

  const vote = state.vote;
  if (!vote || vote.kind !== "nominate" || !vote.closed) return null;
  const ballots = vote.ballots;
  const counts = state.nomination?.counts ?? {};
  const targets = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const votersFor = (target: string) => (ballots ? Object.keys(ballots).filter((v) => ballots[v] === target) : []);
  const voted = new Set(Object.keys(ballots ?? {}));
  const abstained = ballots ? state.players.filter((p) => p.alive && !voted.has(p.id)).map((p) => p.id) : [];
  const skips = state.nomination?.skips ?? 0;

  return (
    <Frame t={t} lg={lg} anonymous={!ballots}>
      {targets.map((id) => (
        <Row
          key={id}
          lg={lg}
          tone={state.nominees.includes(id) ? "gold" : "plain"}
          target={players.get(id)}
          count={counts[id]}
          ids={votersFor(id)}
          players={players}
          t={t}
        />
      ))}
      {skips > 0 && (
        <Row lg={lg} tone="muted" label={t("vote.skip")} count={skips} ids={votersFor("skip")} players={players} t={t} />
      )}
      {abstained.length > 0 && (
        <Row lg={lg} tone="muted" label={t("vote.noVote")} count={abstained.length} ids={abstained} players={players} t={t} />
      )}
      {!targets.length && !skips && <p className="text-center text-white/50">{t("vote.empty")}</p>}
    </Frame>
  );
}

function Frame({ t, lg, anonymous, children }: { t: T; lg: boolean; anonymous: boolean; children: React.ReactNode }) {
  return (
    <section className={`flex w-full flex-col gap-2 text-left ${lg ? "max-w-5xl" : ""}`}>
      <h3 className={`font-bold text-white/80 ${lg ? "text-2xl" : "text-sm"}`}>🗳️ {t("vote.title")}</h3>
      {anonymous && <p className="text-xs text-white/50">{t("vote.anonymousNote")}</p>}
      <div className={lg ? "grid gap-3 md:grid-cols-2" : "flex flex-col gap-2"}>{children}</div>
    </section>
  );
}

const TONES = {
  gold: "border-gold/60 bg-gold/10",
  red: "border-blood/50 bg-blood/10",
  green: "border-emerald-500/50 bg-emerald-500/10",
  plain: "border-white/10 bg-white/5",
  muted: "border-white/5 bg-black/20 opacity-80",
} as const;

function Row({
  lg,
  tone,
  target,
  label,
  count,
  ids,
  players,
  t,
}: {
  lg: boolean;
  tone: keyof typeof TONES;
  target?: PlayerView;
  label?: string;
  count: number;
  ids: string[];
  players: Map<string, PlayerView>;
  t: T;
}) {
  return (
    <div className={`rise rounded-xl border p-2 ${TONES[tone]} ${lg ? "p-3" : ""}`}>
      <div className={`flex items-center gap-2 font-bold ${lg ? "text-2xl" : "text-sm"}`}>
        {target ? (
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Avatar p={target} size={lg ? "md" : "sm"} /> <StyledName p={target} />
          </span>
        ) : (
          <span>{label}</span>
        )}
        <span className={`ml-auto shrink-0 rounded-full bg-white/10 px-2 ${lg ? "text-xl" : "text-xs"}`}>
          {t("vote.votes", { count })}
        </span>
      </div>
      {ids.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ids.map((id) => {
            const p = players.get(id);
            return (
              <span key={id} className={`chip ${lg ? "px-3 py-1 text-lg" : ""}`}>
                {p ? <Avatar p={p} size="sm" /> : null} {p ? <StyledName p={p} /> : "?"}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Narration line describing what happens after the nomination vote. */
export function nominationOutcomeLine(state: ClientState): { k: string; params: Record<string, string> } | null {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "?";
  switch (state.nominationOutcome) {
    case "defense":
      return { k: "script.nominateResultDefense", params: { names: state.nominees.map(name).join(", ") } };
    case "revote":
      return { k: "script.nominateResultRevote", params: { names: (state.nomination?.tiedIds ?? []).map(name).join(", ") } };
    case "none":
      return { k: "script.nominateResultNone", params: {} };
    default:
      return null;
  }
}
