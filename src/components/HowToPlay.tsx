"use client";

// Home page tutorial: from opening the site to a standard game with friends,
// the suggested role sets by player count, how a game goes and the basic roles.

import Link from "next/link";
import { ROLES, emptyRoleCounts, suggestRoles } from "@shared/roles";
import { MIN_HUMANS_FOR_STATS } from "@shared/stats";
import type { RoleId } from "@shared/types";
import { useT } from "@/lib/i18n";

const STEPS = [1, 2, 3, 4, 5, 6] as const;
const STEP_ICONS = ["🔐", "🪪", "🏠", "📲", "🃏", "🌙"];
/** Player counts shown in the role table. */
const SIZES = [6, 7, 8, 9, 10, 12];
const BASIC: RoleId[] = ["werewolf", "villager", "seer", "bodyguard", "witch", "hunter"];

export function HowToPlay() {
  const t = useT();
  return (
    <section id="cach-choi" className="mt-12 scroll-mt-20">
      <div className="mb-6 text-center">
        <h2 className="font-display text-4xl font-black text-moon sm:text-5xl">📖 {t("tutorial.title")}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-white/70">{t("tutorial.subtitle")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/guide#roles" className="btn-ghost btn-sm">
            🎭 {t("guide.nav.roles")}
          </Link>
          <Link href="/guide#features" className="btn-ghost btn-sm">
            ✨ {t("guide.nav.features")}
          </Link>
          <Link href="/guide#faq" className="btn-ghost btn-sm">
            ❓ {t("guide.nav.faq")}
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-col items-start gap-3 rounded-xl border border-emerald-400/40 bg-emerald-400/[0.07] p-4 sm:flex-row sm:items-center">
        <span className="text-3xl">⚡</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-emerald-200">{t("tutorial.quickTitle")}</h3>
          <p className="text-sm text-white/75">{t("tutorial.quickDesc")}</p>
        </div>
        <Link href="/lobby?quick=1" className="btn-primary shrink-0">
          ⚡ {t("home.ctaPlay")}
        </Link>
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="mb-4 text-2xl font-bold text-gold">🏆 {t("tutorial.standardTitle")}</h3>
        <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((n, i) => (
            <li key={n} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold font-display text-xl font-black text-night-950">
                {n}
              </span>
              <div className="min-w-0">
                <h4 className="font-bold text-moon">
                  {STEP_ICONS[i]} {t(`tutorial.step${n}Title`)}
                </h4>
                <p className="mt-1 text-sm leading-relaxed text-white/70">{t(`tutorial.step${n}Desc`, { min: MIN_HUMANS_FOR_STATS })}</p>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="mt-8 mb-3 text-lg font-bold">🃏 {t("tutorial.setupTitle")}</h3>
        <RoleTable />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <h3 className="mb-4 text-xl font-bold">🔄 {t("tutorial.flowTitle")}</h3>
          <ol className="flex flex-col gap-3">
            {(
              [
                ["🌙", "flowNight"],
                ["☀️", "flowDay"],
                ["🗳️", "flowVote"],
              ] as const
            ).map(([icon, key]) => (
              <li key={key} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-night-950/70 text-xl">{icon}</span>
                <div>
                  <h4 className="font-bold text-moon">{t(`tutorial.${key}`)}</h4>
                  <p className="text-sm text-white/70">{t(`tutorial.${key}Desc`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <h4 className="mt-5 mb-2 font-bold text-gold">🏁 {t("tutorial.winTitle")}</h4>
          <ul className="flex flex-col gap-1.5 text-sm">
            <li className="rounded-lg bg-emerald-400/10 px-3 py-2 text-emerald-100">🏘️ {t("tutorial.winVillage")}</li>
            <li className="rounded-lg bg-blood/15 px-3 py-2 text-red-100">🐺 {t("tutorial.winWolves")}</li>
          </ul>
        </div>

        <div className="card p-5 sm:p-6">
          <h3 className="mb-4 text-xl font-bold">🎭 {t("tutorial.rolesTitle")}</h3>
          <ul className="flex flex-col gap-2">
            {BASIC.map((r) => (
              <li key={r} className="flex gap-3 rounded-lg bg-white/[0.04] p-2.5">
                <span className="text-2xl">{ROLES[r].emoji}</span>
                <div className="min-w-0">
                  <span className="font-bold">{t(`roles.${r}.name`)}</span>
                  <p className="text-sm text-white/65">{t(`roles.${r}.desc`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card mt-6 p-5 sm:p-6">
        <h3 className="mb-3 text-xl font-bold">💡 {t("tutorial.tipsTitle")}</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-white/80">
              {t(`tutorial.tip${n}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The suggested basic set for each table size (what "Use suggestion" deals with only the basic roles). */
function RoleTable() {
  const t = useT();
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {SIZES.map((n) => {
        const counts = { ...emptyRoleCounts(), ...suggestRoles(n) };
        const roles = (Object.keys(counts) as RoleId[]).filter((r) => counts[r] > 0);
        // Wolves first, then the village's special roles, plain villagers last.
        roles.sort((a, b) => Number(ROLES[b].team === "wolves") - Number(ROLES[a].team === "wolves") || Number(a === "villager") - Number(b === "villager"));
        return (
          <div key={n} className="rounded-xl border border-white/10 bg-night-950/50 p-3">
            <div className="mb-2 font-display text-lg font-black text-gold">{t("tutorial.setupPlayers", { n })}</div>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <span
                  key={r}
                  className={`chip py-1 text-sm ${ROLES[r].team === "wolves" ? "border-blood/50 bg-blood/15 text-red-100" : ""}`}
                >
                  {ROLES[r].emoji} {t(`roles.${r}.name`)}
                  {counts[r] > 1 && <b className="tabular-nums">×{counts[r]}</b>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
