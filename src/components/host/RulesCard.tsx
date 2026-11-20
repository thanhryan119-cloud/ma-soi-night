"use client";

import { useEffect, useState } from "react";
import { NIGHT_STEP_ROLE } from "@shared/roles";
import type { Settings } from "@shared/types";
import type { ClientState } from "@shared/views";
import { RoleBadge } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useHostAction } from "./common";

const BOOLS = [
  "autoAdvance",
  "noScreen",
  "aiBots",
  "wolvesMustBite",
  "mandatoryVote",
  "voiceChat",
  "decoyActions",
  "bilingualScreen",
  "deadSeeRoles",
  "revealRoleOnDeath",
  "bodyguardSelf",
  "witchSelfSave",
  "witchBothSameNight",
  "hunterShootsWhenPoisoned",
] as const;

function NumberField({ label, value, onCommit, min, max }: { label: string; value: number; onCommit: (n: number) => void; min: number; max: number }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <input
        type="number"
        className="ui-select w-24 text-right"
        min={min}
        max={max}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v);
          if (Number.isFinite(n) && n !== value) onCommit(n);
          else setV(String(value));
        }}
      />
    </label>
  );
}

export function RulesCard({
  state,
  defaultOpen = true,
  hidden = [],
}: {
  state: ClientState;
  defaultOpen?: boolean;
  /** Switches that don't apply here (e.g. the ones a machine-host room always keeps on). */
  hidden?: readonly (keyof Settings)[];
}) {
  const t = useT();
  const act = useHostAction();
  const s = state.settings;
  const update = (patch: Partial<Settings>) => act({ type: "updateSettings", settings: patch });
  const move = (i: number, d: number) => {
    const order = [...s.nightOrder];
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update({ nightOrder: order });
  };

  return (
    <details className="card group" open={defaultOpen}>
      <summary className="cursor-pointer list-none text-xl font-bold">
        ⚙️ {t("host.rules")} <span className="text-sm text-white/40 group-open:hidden">▸</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4 text-sm">
        <fieldset className="flex flex-col gap-2">
          <legend className="ui-label">{t("settings.nominationMode")}</legend>
          <select
            className="ui-select"
            value={s.nomination.mode}
            onChange={(e) => update({ nomination: { ...s.nomination, mode: e.target.value as Settings["nomination"]["mode"] } })}
          >
            {(["top1", "topN", "threshold"] as const).map((m) => (
              <option key={m} value={m}>
                {t(`settings.mode.${m}`)}
              </option>
            ))}
          </select>
          {s.nomination.mode === "topN" && (
            <NumberField label={t("settings.n")} value={s.nomination.n} min={1} max={10} onCommit={(n) => update({ nomination: { ...s.nomination, n } })} />
          )}
          {s.nomination.mode === "threshold" && (
            <NumberField
              label={t("settings.threshold")}
              value={s.nomination.threshold}
              min={1}
              max={20}
              onCommit={(threshold) => update({ nomination: { ...s.nomination, threshold } })}
            />
          )}
          {s.nomination.mode !== "threshold" && (
            <label className="flex flex-col gap-1">
              <span>{t("settings.tie")}</span>
              <select
                className="ui-select"
                value={s.nomination.tie}
                onChange={(e) => update({ nomination: { ...s.nomination, tie: e.target.value as Settings["nomination"]["tie"] } })}
              >
                {(["allTied", "none", "revote"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`settings.tieMode.${m}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="ui-label">{t("settings.majority")}</legend>
          <select
            className="ui-select"
            value={s.verdict.majority}
            onChange={(e) => update({ verdict: { ...s.verdict, majority: e.target.value as Settings["verdict"]["majority"] } })}
          >
            {(["simple", "absolute"] as const).map((m) => (
              <option key={m} value={m}>
                {t(`settings.majorityMode.${m}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-gold)]"
              checked={s.verdict.anonymous}
              onChange={(e) => update({ verdict: { ...s.verdict, anonymous: e.target.checked } })}
            />
            {t("settings.anonymous")}
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <NumberField label={t("settings.discussionSeconds")} value={s.discussionSeconds} min={10} max={3600} onCommit={(discussionSeconds) => update({ discussionSeconds })} />
          <NumberField label={t("settings.defenseSeconds")} value={s.defenseSeconds} min={10} max={3600} onCommit={(defenseSeconds) => update({ defenseSeconds })} />
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          {BOOLS.filter((k) => !hidden.includes(k)).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-gold)]"
                checked={s[k]}
                onChange={(e) => update({ [k]: e.target.checked })}
              />
              {t(`settings.${k}`)}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend className="ui-label">{t("settings.nightOrder")}</legend>
          <ol className="flex flex-col gap-1">
            {s.nightOrder.map((step, i) => (
              <li key={step} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1">
                <span className="w-5 text-white/40">{i + 1}.</span>
                <span className="flex-1">
                  <RoleBadge roleId={NIGHT_STEP_ROLE[step]} />
                </span>
                <button className="btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="up">
                  ↑
                </button>
                <button className="btn-ghost btn-sm" disabled={i === s.nightOrder.length - 1} onClick={() => move(i, 1)} aria-label="down">
                  ↓
                </button>
              </li>
            ))}
          </ol>
        </fieldset>
      </div>
    </details>
  );
}
