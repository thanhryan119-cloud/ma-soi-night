"use client";

// The guide: a beginner path, how to play every role, the features people
// miss, and the questions people ask most.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GlobalChat } from "@/components/GlobalChat";
import { Onboarding, markPath, openOnboarding, usePath, writePath } from "@/components/Onboarding";
import { RoleArt } from "@/components/art/Tarot";
import { LangSwitch } from "@/components/ui";
import {
  FAQ,
  FAQ_CATEGORIES,
  PATH_STEPS,
  ROLE_FILTERS,
  STARTER_ROLES,
  filterFaq,
  filterRoles,
  isBasicRole,
  nightRule,
  seerTricks,
  type FaqCategory,
  type PathStep,
  type RoleFilter,
} from "@shared/guide";
import { ROLES, ROLE_IDS } from "@shared/roles";
import { MAX_PLAYERS, MIN_PLAYERS } from "@shared/engine";
import { MIN_HUMANS_FOR_STATS } from "@shared/stats";
import { TIER_WINS } from "@shared/achievements";
import type { RoleId } from "@shared/types";
import { useT } from "@/lib/i18n";

const NAV = [
  ["🚀", "start"],
  ["🎭", "roles"],
  ["✨", "features"],
  ["❓", "faq"],
] as const;

export default function GuidePage() {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pt-14 pb-24">
      <GlobalChat />
      <LangSwitch />
      <Onboarding />
      <div className="fixed top-3 right-3 z-50">
        <Link href="/" className="btn-ghost btn-sm" title={t("common.back")}>
          🏠 <span className="sr-only">{t("common.back")}</span>
        </Link>
      </div>

      <header className="text-center">
        <h1 className="font-display text-5xl font-black text-moon sm:text-6xl">📖 {t("guide.title")}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-white/70">{t("guide.subtitle")}</p>
      </header>

      <nav
        className="sticky top-14 z-40 mx-auto mt-6 flex max-w-full gap-1 overflow-x-auto rounded-full border border-gold/30 bg-night-900/90 p-1 backdrop-blur"
        aria-label={t("guide.title")}
      >
        {NAV.map(([icon, id]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white/80 hover:bg-gold/15 hover:text-moon">
            {icon} {t(`guide.nav.${id}`)}
          </a>
        ))}
      </nav>

      <BeginnerPath />
      <RoleGuide />
      <Features />
      <Faq />
    </main>
  );
}

function SectionTitle({ id, icon, title, desc }: { id: string; icon: string; title: string; desc: string }) {
  return (
    <div id={id} className="mb-5 scroll-mt-32 text-center">
      <h2 className="font-display text-3xl font-black text-moon sm:text-4xl">
        {icon} {title}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-white/65">{desc}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beginner path
// ---------------------------------------------------------------------------

const PATH_ICONS: Record<PathStep, string> = { intro: "🧭", roles: "🎭", bots: "🤖", signIn: "🔐", friends: "🎉" };

function BeginnerPath() {
  const t = useT();
  const done = usePath();
  const n = PATH_STEPS.filter((s) => done.includes(s)).length;
  const next = PATH_STEPS.find((s) => !done.includes(s));

  const act = (step: PathStep) => {
    if (step === "intro") return openOnboarding();
    markPath(step);
  };
  const href: Partial<Record<PathStep, string>> = {
    roles: "#roles",
    bots: "/lobby?quick=1",
    signIn: "/profile",
    friends: "/#cach-choi",
  };

  return (
    <section className="mt-10">
      <SectionTitle id="start" icon="🚀" title={t("guide.path.title")} desc={t("guide.path.desc")} />
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="h-2.5 min-w-40 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(n / PATH_STEPS.length) * 100}%` }} />
          </div>
          <span className="text-sm font-bold text-gold tabular-nums">{t("guide.path.progress", { n, total: PATH_STEPS.length })}</span>
          {n > 0 && (
            <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => writePath([])}>
              {t("guide.path.reset")}
            </button>
          )}
        </div>
        {!next && <p className="mb-4 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100">{t("guide.path.done")}</p>}
        <ol className="flex flex-col gap-2">
          {PATH_STEPS.map((step, i) => {
            const isDone = done.includes(step);
            const current = step === next;
            const cls = current ? "btn-primary btn-sm shrink-0" : "btn-ghost btn-sm shrink-0";
            return (
              <li
                key={step}
                className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center ${
                  current ? "border-gold/60 bg-gold/[0.07]" : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <button
                    type="button"
                    onClick={() => writePath(isDone ? done.filter((s) => s !== step) : [...done, step])}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-display font-black ${
                      isDone ? "border-emerald-400 bg-emerald-400 text-night-950" : "border-gold/50 text-gold"
                    }`}
                    aria-pressed={isDone}
                    title={t("guide.path.mark")}
                  >
                    {isDone ? "✓" : i + 1}
                  </button>
                  <div className="min-w-0">
                    <h3 className={`font-bold ${isDone ? "text-white/60 line-through" : "text-moon"}`}>
                      {PATH_ICONS[step]} {t(`guide.path.${step}.title`)}
                    </h3>
                    <p className="text-sm text-white/65">{t(`guide.path.${step}.desc`)}</p>
                  </div>
                </div>
                {href[step] ? (
                  <Link href={href[step]!} className={cls} onClick={() => act(step)}>
                    {t(`guide.path.${step}.cta`)} →
                  </Link>
                ) : (
                  <button type="button" className={cls} onClick={() => act(step)}>
                    {t(`guide.path.${step}.cta`)} →
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const TEAM_STYLE: Record<string, string> = {
  village: "border-emerald-400/30",
  wolves: "border-blood/50",
  solo: "border-violet-400/40",
};
const FILTER_ICON: Record<RoleFilter, string> = { all: "🃏", basic: "🌱", village: "🏘️", wolves: "🐺", solo: "🎭" };

function RoleGuide() {
  const t = useT();
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<RoleId | null>(null);
  const nameOf = useCallback((r: RoleId) => t(`roles.${r}.name`), [t]);
  const list = useMemo(() => filterRoles(filter, query, nameOf), [filter, query, nameOf]);

  // /guide?role=seer opens that role (links from the game and the walkthrough).
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("role");
    if (r && (ROLE_IDS as string[]).includes(r)) setOpen(r as RoleId);
  }, []);

  const pick = (r: RoleId) => {
    setOpen(r);
    if (STARTER_ROLES.includes(r)) markPath("roles");
  };

  return (
    <section className="mt-14">
      <SectionTitle id="roles" icon="🎭" title={t("guide.roles.title")} desc={t("guide.roles.desc", { n: ROLE_IDS.length })} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("guide.roles.search")}
          aria-label={t("guide.roles.search")}
          className="ui-input py-2 text-base sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5" role="group">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                filter === f ? "border-gold bg-gold text-night-950" : "border-white/15 text-white/75 hover:border-gold/60"
              }`}
            >
              {FILTER_ICON[f]} {t(`guide.roles.filter.${f}`)}
            </button>
          ))}
        </div>
        <span className="text-sm text-white/45 sm:ml-auto">{t("guide.roles.count", { n: list.length })}</span>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl bg-white/[0.04] p-6 text-center text-white/60">{t("guide.roles.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <li key={r}>
              <button
                type="button"
                onClick={() => pick(r)}
                className={`flex h-full w-full gap-3 rounded-xl border bg-night-800/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-gold/70 ${TEAM_STYLE[ROLES[r].team]}`}
              >
                <span className="text-4xl leading-none">{ROLES[r].emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-moon">{t(`roles.${r}.name`)}</span>
                    <RoleBadges role={r} />
                  </span>
                  <span className="mt-0.5 block text-xs text-white/45">{t(`teams.${ROLES[r].team}`)}</span>
                  <span className="mt-1 line-clamp-2 block text-sm text-white/70">{t(`roles.${r}.desc`)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <RoleDetail role={open} list={list.includes(open) ? list : ROLE_IDS} onPick={pick} onClose={() => setOpen(null)} />}
    </section>
  );
}

function RoleBadges({ role }: { role: RoleId }) {
  const t = useT();
  if (STARTER_ROLES.includes(role)) return <span className="chip border-emerald-400/40 bg-emerald-400/10 py-0 text-[11px] text-emerald-200">🌱 {t("guide.roles.starter")}</span>;
  if (!isBasicRole(role)) return <span className="chip border-violet-400/40 bg-violet-400/10 py-0 text-[11px] text-violet-200">{t("guide.roles.advanced")}</span>;
  return null;
}

function RoleDetail({ role, list, onPick, onClose }: { role: RoleId; list: RoleId[]; onPick: (r: RoleId) => void; onClose: () => void }) {
  const t = useT();
  const def = ROLES[role];
  const i = list.indexOf(role);
  const prev = list[(i - 1 + list.length) % list.length];
  const next = list[(i + 1) % list.length];
  const wake = nightRule(role);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPick(prev);
      if (e.key === "ArrowRight") onPick(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPick, prev, next]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-detail-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div key={role} className="card rise flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden p-0">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-5 sm:flex-row">
            <RoleArt role={role} className="mx-auto w-36 shrink-0 sm:mx-0 sm:w-44" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="role-detail-title" className="font-display text-3xl font-black text-moon">
                  {def.emoji} {t(`roles.${role}.name`)}
                </h3>
                <RoleBadges role={role} />
              </div>
              <p className="mt-0.5 text-sm font-semibold text-white/50">{t(`teams.${def.team}`)}</p>
              <p className="mt-3 leading-relaxed text-white/85">{t(`roles.${role}.desc`)}</p>
              <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <Fact label={t("guide.roles.goalTitle")} value={t(`guide.roles.goal.${def.team}`)} wide />
                <Fact
                  label={`🌙 ${t("guide.roles.wakeTitle")}`}
                  value={`${t(`guide.roles.wake.${wake}`)}${def.night && def.alsoWakesIn?.length ? `. ${t("guide.roles.packToo")}` : ""}`}
                />
                <Fact label={`🔮 ${t("guide.roles.seerTitle")}`} value={def.seenAsWolf ? `🐺 ${t("guide.roles.seerWolf")}` : `🙂 ${t("guide.roles.seerVillage")}`} />
                {def.night && <Fact label={`👆 ${t("guide.roles.actionTitle")}`} value={t(`roles.${role}.action`)} wide />}
              </dl>
            </div>
          </div>
          <h4 className="mt-5 mb-2 font-bold text-gold">💡 {t("guide.roles.tipsTitle")}</h4>
          <ul className="flex flex-col gap-1.5">
            {t(`roles.${role}.tips`)
              .split("\n")
              .filter(Boolean)
              .map((tip) => (
                <li key={tip} className="rounded-lg bg-white/[0.04] px-3 py-2 text-sm leading-relaxed text-white/85">
                  {tip}
                </li>
              ))}
          </ul>
        </div>
        <div className="flex gap-2 border-t border-white/10 px-5 py-3">
          <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => onPick(prev)} aria-label={t("guide.roles.prev")}>
            ← {ROLES[prev].emoji} <span className="truncate">{t(`roles.${prev}.name`)}</span>
          </button>
          <button type="button" className="btn-primary btn-sm px-4" onClick={onClose} autoFocus>
            {t("guide.roles.close")}
          </button>
          <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => onPick(next)} aria-label={t("guide.roles.next")}>
            <span className="truncate">{t(`roles.${next}.name`)}</span> {ROLES[next].emoji} →
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-night-950/50 px-3 py-2 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs font-semibold tracking-wide text-white/45 uppercase">{label}</dt>
      <dd className="mt-0.5 text-white/90">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

const FEATURES: [string, string, string?][] = [
  ["⚡", "quick", "/lobby?quick=1"],
  ["🤖", "machine", "/lobby"],
  ["🧠", "bots", "/lobby?quick=1"],
  ["🎙️", "voice"],
  ["👻", "ghost"],
  ["👀", "watch", "/lobby"],
  ["📺", "screen"],
  ["🎞️", "replay", "/profile"],
  ["🃏", "collection", "/collection"],
  ["📜", "quests", "/quests"],
  ["🤝", "friends", "/"],
  ["🏆", "leaderboard", "/"],
  ["🔒", "password", "/lobby"],
  ["✨", "style", "/profile"],
  ["🔊", "sfx"],
  ["📲", "install"],
];

function Features() {
  const t = useT();
  return (
    <section className="mt-14">
      <SectionTitle id="features" icon="✨" title={t("guide.features.title")} desc={t("guide.features.desc")} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([icon, key, href]) => (
          <li key={key} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-night-800/60 p-4">
            <span className="text-3xl">{icon}</span>
            <h3 className="font-bold text-moon">{t(`guide.features.items.${key}.title`)}</h3>
            <p className="flex-1 text-sm text-white/65">{t(`guide.features.items.${key}.desc`, { min: MIN_HUMANS_FOR_STATS })}</p>
            {href && (
              <Link href={href} className="mt-2 self-start text-sm font-semibold text-gold hover:underline">
                {t("guide.features.try")} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Q&A
// ---------------------------------------------------------------------------

const CAT_ICON: Record<FaqCategory, string> = { all: "📚", start: "🚀", game: "🌙", roles: "🎭", account: "👤", tech: "🛠️" };

function Faq() {
  const t = useT();
  const [cat, setCat] = useState<FaqCategory>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const name = (r: RoleId) => t(`roles.${r}.name`);
  const vars = {
    min: MIN_PLAYERS,
    max: MAX_PLAYERS,
    stats: MIN_HUMANS_FOR_STATS,
    roles: seerTricks().map(name).join(", "),
    mayor: name("mayor"),
    villager: name("villager"),
    bodyguard: name("bodyguard"),
    hunter: name("hunter"),
    seer: name("seer"),
    witch: name("witch"),
    werewolf: name("werewolf"),
    tanner: name("tanner"),
    arsonist: name("arsonist"),
    ...TIER_WINS,
  };
  const q = (id: string) => t(`guide.faq.items.${id}.q`);
  const a = (id: string) => t(`guide.faq.items.${id}.a`, vars);
  const ids = filterFaq(cat, query, (id) => `${q(id)} ${a(id)}`);

  return (
    <section className="mt-14">
      <SectionTitle id="faq" icon="❓" title={t("guide.faq.title")} desc={t("guide.faq.desc")} />
      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("guide.faq.search")}
          aria-label={t("guide.faq.search")}
          className="ui-input py-2 text-base sm:max-w-md"
        />
        <div className="flex flex-wrap gap-1.5" role="group">
          {FAQ_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                cat === c ? "border-gold bg-gold text-night-950" : "border-white/15 text-white/75 hover:border-gold/60"
              }`}
            >
              {CAT_ICON[c]} {t(`guide.faq.cat.${c}`)}
              <span className="ml-1 opacity-60 tabular-nums">{c === "all" ? FAQ.length : FAQ.filter((f) => f.cat === c).length}</span>
            </button>
          ))}
        </div>
      </div>

      {ids.length === 0 ? (
        <p className="rounded-xl bg-white/[0.04] p-6 text-center text-white/60">{t("guide.faq.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ids.map((id) => {
            const isOpen = open === id;
            return (
              <li key={id} className={`overflow-hidden rounded-xl border transition ${isOpen ? "border-gold/50 bg-gold/[0.05]" : "border-white/10 bg-night-800/60"}`}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-${id}`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold text-moon"
                >
                  <span className="min-w-0 flex-1">{q(id)}</span>
                  <span className={`shrink-0 text-gold transition-transform ${isOpen ? "rotate-45" : ""}`} aria-hidden>
                    ＋
                  </span>
                </button>
                {isOpen && (
                  <p id={`faq-${id}`} className="rise px-4 pb-4 text-sm leading-relaxed text-white/80">
                    {a(id)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
