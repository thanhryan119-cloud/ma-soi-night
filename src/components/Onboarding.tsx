"use client";

// The first-visit walkthrough: asks whether the player knows Werewolf, then
// walks a newcomer through the rules, the first roles, how the phone works in
// a game and table manners, and ends on a choice of how to start playing.
// Opens by itself once per device; openOnboarding() opens it again.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROLES, ROLE_IDS } from "@shared/roles";
import { STARTER_ROLES, type PathStep } from "@shared/guide";
import type { RoleId } from "@shared/types";
import { useT } from "@/lib/i18n";

const SEEN_KEY = "msn:onboarded";
const PATH_KEY = "msn:guidePath";
const OPEN_EVENT = "msn:onboard";

type Slide = "ask" | "rules" | "roles" | "phone" | "manners" | "start";
const NEW_FLOW: Slide[] = ["rules", "roles", "phone", "manners", "start"];
const KNOW_FLOW: Slide[] = ["phone", "manners", "start"];

/** Opens the walkthrough from anywhere on a page that renders <Onboarding />. */
export function openOnboarding() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** The beginner path steps this device has done. */
export function readPath(): PathStep[] {
  try {
    const v = JSON.parse(localStorage.getItem(PATH_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function writePath(steps: PathStep[]) {
  try {
    localStorage.setItem(PATH_KEY, JSON.stringify([...new Set(steps)]));
  } catch {}
  window.dispatchEvent(new Event(PATH_KEY));
}

export function markPath(step: PathStep) {
  const steps = readPath();
  if (!steps.includes(step)) writePath([...steps, step]);
}

/** The path, kept in sync when a step is ticked off anywhere on the page. */
export function usePath(): PathStep[] {
  const [steps, setSteps] = useState<PathStep[]>([]);
  useEffect(() => {
    const sync = () => setSteps(readPath());
    sync();
    window.addEventListener(PATH_KEY, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PATH_KEY, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return steps;
}

function setSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

export function Onboarding({ auto = false }: { auto?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<Slide[]>([]);
  const [at, setAt] = useState(-1); // -1 = the opening question

  const show = useCallback(() => {
    setFlow([]);
    setAt(-1);
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener(OPEN_EVENT, show);
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    // A short delay so the page shows first and the walkthrough doesn't feel like a wall.
    const timer = auto && !seen ? setTimeout(show, 700) : undefined;
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      if (timer) clearTimeout(timer);
    };
  }, [auto, show]);

  const close = useCallback(() => {
    setSeen();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const slide: Slide = at < 0 ? "ask" : flow[at];
  const choose = (f: Slide[] | null) => {
    if (!f) return close();
    setFlow(f);
    setAt(0);
  };
  const finish = () => {
    markPath("intro");
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboard-title"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="card relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-3">
          {at >= 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1" aria-hidden>
                {flow.map((s, i) => (
                  <span key={s} className={`h-1.5 rounded-full transition-all ${i <= at ? "w-6 bg-gold" : "w-3 bg-white/20"}`} />
                ))}
              </div>
              <span className="text-xs text-white/50">{t("onboard.stepOf", { n: at + 1, total: flow.length })}</span>
            </div>
          ) : (
            <span className="text-2xl" aria-hidden>
              🐺
            </span>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={close}>
            {t("onboard.skip")}
          </button>
        </div>

        <div key={slide} className="rise min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {slide === "ask" && <Ask onChoose={choose} />}
          {slide === "rules" && <Rules />}
          {slide === "roles" && <Starters onLink={finish} />}
          {slide === "phone" && <Tips slide="phone" icons={["🃏", "💡", "👆", "🗳️"]} />}
          {slide === "manners" && <Tips slide="manners" icons={["🤫", "👻", "🚪", "😄"]} />}
          {slide === "start" && <Start onPick={finish} />}
        </div>

        {at >= 0 && slide !== "start" && (
          <div className="flex gap-2 border-t border-white/10 px-5 py-3">
            <button type="button" className="btn-ghost flex-1" onClick={() => setAt(at - 1)}>
              ← {t("onboard.prev")}
            </button>
            <button type="button" className="btn-primary flex-[2]" onClick={() => setAt(at + 1)} autoFocus>
              {t("onboard.next")} →
            </button>
          </div>
        )}
        {slide === "start" && (
          <div className="border-t border-white/10 px-5 py-3">
            <button type="button" className="btn-ghost w-full" onClick={() => setAt(at - 1)}>
              ← {t("onboard.prev")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 id="onboard-title" className="font-display text-2xl font-black text-moon sm:text-3xl">
      {children}
    </h2>
  );
}

function Ask({ onChoose }: { onChoose: (f: Slide[] | null) => void }) {
  const t = useT();
  const options: [string, string, Slide[] | null][] = [
    ["🌱", "new", NEW_FLOW],
    ["🎯", "know", KNOW_FLOW],
    ["⚡", "skip", null],
  ];
  return (
    <div className="flex flex-col gap-4">
      <Title>{t("onboard.ask.title")}</Title>
      <p className="text-white/75">{t("onboard.ask.desc")}</p>
      <div className="flex flex-col gap-2">
        {options.map(([icon, key, f], i) => (
          <button
            key={key}
            type="button"
            onClick={() => onChoose(f)}
            autoFocus={i === 0}
            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition hover:border-gold/70 hover:bg-gold/10 ${
              i === 0 ? "border-gold/50 bg-gold/[0.07]" : "border-white/15 bg-white/[0.03]"
            }`}
          >
            <span className="text-3xl">{icon}</span>
            <span className="min-w-0">
              <span className="block font-bold text-moon">{t(`onboard.ask.${key}.title`)}</span>
              <span className="block text-sm text-white/60">{t(`onboard.ask.${key}.desc`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Rules() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <Title>⏱️ {t("onboard.rules.title")}</Title>
      <p className="text-white/75">{t("onboard.rules.desc")}</p>
      <ol className="flex flex-col gap-2">
        {(
          [
            ["🌙", "flowNight"],
            ["☀️", "flowDay"],
            ["🗳️", "flowVote"],
          ] as const
        ).map(([icon, key]) => (
          <li key={key} className="flex gap-3 rounded-lg bg-white/[0.04] p-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <h3 className="font-bold text-moon">{t(`tutorial.${key}`)}</h3>
              <p className="text-sm text-white/70">{t(`tutorial.${key}Desc`)}</p>
            </div>
          </li>
        ))}
      </ol>
      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="rounded-lg bg-emerald-400/10 px-3 py-2 text-emerald-100">🏘️ {t("tutorial.winVillage")}</li>
        <li className="rounded-lg bg-blood/15 px-3 py-2 text-red-100">🐺 {t("tutorial.winWolves")}</li>
      </ul>
    </div>
  );
}

function Starters({ onLink }: { onLink: () => void }) {
  const t = useT();
  const [picked, setPicked] = useState<RoleId>(STARTER_ROLES[0]);
  return (
    <div className="flex flex-col gap-4">
      <Title>🎭 {t("onboard.roles.title")}</Title>
      <p className="text-white/75">{t("onboard.roles.desc")}</p>
      <div className="grid grid-cols-3 gap-2">
        {STARTER_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setPicked(r)}
            aria-pressed={picked === r}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition ${
              picked === r
                ? "border-gold bg-gold/15"
                : ROLES[r].team === "wolves"
                  ? "border-blood/40 bg-blood/10"
                  : "border-white/15 bg-white/[0.03]"
            }`}
          >
            <span className="text-3xl">{ROLES[r].emoji}</span>
            <span className="text-sm font-bold leading-tight">{t(`roles.${r}.name`)}</span>
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-white/10 bg-night-950/60 p-3" aria-live="polite">
        <div className="text-xs font-semibold tracking-wide text-white/50 uppercase">{t(`teams.${ROLES[picked].team}`)}</div>
        <p className="mt-1 text-sm text-white/85">{t(`roles.${picked}.desc`)}</p>
      </div>
      <Link href={`/guide?role=${picked}#roles`} className="text-sm font-semibold text-gold hover:underline" onClick={onLink}>
        📖 {t("onboard.roles.all", { n: ROLE_IDS.length })} →
      </Link>
    </div>
  );
}

function Tips({ slide, icons }: { slide: "phone" | "manners"; icons: string[] }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <Title>
        {slide === "phone" ? "📱" : "🤝"} {t(`onboard.${slide}.title`)}
      </Title>
      <ul className="flex flex-col gap-2">
        {icons.map((icon, i) => (
          <li key={icon} className="flex gap-3 rounded-lg bg-white/[0.04] p-3">
            <span className="text-2xl">{icon}</span>
            <p className="text-sm leading-relaxed text-white/80">{t(`onboard.${slide}.tip${i + 1}`)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Start({ onPick }: { onPick: () => void }) {
  const t = useT();
  const options = [
    ["⚡", "quick", "/lobby?quick=1"],
    ["🌐", "lobby", "/lobby"],
    ["📖", "guide", "/guide"],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <Title>🚀 {t("onboard.start.title")}</Title>
      <p className="text-white/75">{t("onboard.start.desc")}</p>
      <div className="flex flex-col gap-2">
        {options.map(([icon, key, href], i) => (
          <Link
            key={key}
            href={href}
            onClick={onPick}
            className={`flex items-center gap-3 rounded-xl border p-3 transition hover:border-gold/70 hover:bg-gold/10 ${
              i === 0 ? "border-gold/60 bg-gold/10" : "border-white/15 bg-white/[0.03]"
            }`}
          >
            <span className="text-3xl">{icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-moon">{t(`onboard.start.${key}.title`)}</span>
              <span className="block text-sm text-white/60">{t(`onboard.start.${key}.desc`)}</span>
            </span>
            <span className="text-white/40">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
