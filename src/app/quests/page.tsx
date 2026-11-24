"use client";

// Quests: a daily check-in, three daily quests (new every day at midnight,
// Vietnam time) with a bonus for finishing them all, and one-time gold quests.
// Gold buys some items in the shop.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { QuestView } from "@shared/quests";
import { GoogleButton } from "@/components/ProfileEditor";
import { GoldChip, useGoldFormat } from "@/components/Quests";
import { LangSwitch, toast } from "@/components/ui";
import { GOOGLE_CLIENT_ID, claimQuestReward, refreshQuests, useAccount, useQuests } from "@/lib/account";
import { useT } from "@/lib/i18n";

export default function QuestsPage() {
  const t = useT();
  const account = useAccount();
  const q = useQuests();
  const fmt = useGoldFormat();
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  useEffect(() => {
    refreshQuests();
  }, []);

  const claim = async (id: string) => {
    setBusy(id);
    const r = await claimQuestReward(id);
    setBusy(null);
    if (r.ok) toast(t("quests.gotGold", { gold: fmt(r.gold ?? 0) }), "info");
    else toast(t(r.error ?? "err.server"));
  };

  const left = q ? Math.max(0, q.resetsAt - now) : 0;
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 pt-16 pb-10">
      <LangSwitch />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="btn-ghost btn-sm">
          ← {t("common.back")}
        </Link>
        <h1 className="font-display text-3xl font-black">📜 {t("quests.title")}</h1>
        <GoldChip className="ml-auto text-base" />
      </div>

      {!account ? (
        <section className="card flex flex-col gap-3">
          <p className="text-white/80">{t("quests.signIn")}</p>
          {GOOGLE_CLIENT_ID ? <GoogleButton /> : <p className="text-xs text-white/50">{t("profile.authUnavailable")}</p>}
        </section>
      ) : !q ? (
        <p className="text-center text-white/50">{t("quests.loading")}</p>
      ) : (
        <>
          <section className="card flex items-center gap-3">
            <span className="text-3xl">📅</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t("quests.checkin")}</p>
              <p className="text-xs text-white/60">{t("quests.checkinHint")}</p>
            </div>
            <ClaimButton claimed={q.checkin.claimed} ready reward={q.checkin.reward} busy={busy === "checkin"} onClaim={() => claim("checkin")} />
          </section>

          <section className="card flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-xl font-bold">☀️ {t("quests.daily")}</h2>
              <span className="ml-auto text-xs text-white/50">{t("quests.resetsIn", { hours, minutes })}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {q.daily.map((d) => (
                <QuestRow key={d.id} q={d} busy={busy === d.id} onClaim={() => claim(d.id)} />
              ))}
            </ul>
            <div className="flex items-center gap-3 rounded-lg border border-gold/30 bg-gold/[0.05] p-3">
              <span className="text-2xl">🎁</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t("quests.bonus")}</p>
                <p className="text-xs text-white/60">{t("quests.bonusHint")}</p>
              </div>
              <ClaimButton claimed={q.bonus.claimed} ready={q.bonus.ready} reward={q.bonus.reward} busy={busy === "bonus"} onClaim={() => claim("bonus")} />
            </div>
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="text-xl font-bold">🏆 {t("quests.goldQuests")}</h2>
            <p className="text-xs text-white/60">{t("quests.goldQuestsHint")}</p>
            <ul className="flex flex-col gap-2">
              {q.goldQuests.map((g) => (
                <QuestRow key={g.id} q={g} busy={busy === g.id} onClaim={() => claim(g.id)} />
              ))}
            </ul>
          </section>

          <Link href="/shop" className="btn-gold w-full py-3 text-center">
            🛒 {t("quests.spend")}
          </Link>
          <p className="text-center text-xs text-white/50">{t("quests.earnedTotal", { gold: fmt(q.earned) })}</p>
        </>
      )}
    </main>
  );
}

function QuestRow({ q, busy, onClaim }: { q: QuestView; busy: boolean; onClaim: () => void }) {
  const t = useT();
  const done = q.progress >= q.goal;
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border p-3 ${q.claimed ? "border-emerald-500/30 bg-emerald-500/[0.04] opacity-70" : done ? "border-gold/50 bg-gold/[0.06]" : "border-white/10 bg-white/[0.03]"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t(`quests.q.${q.id}`, { goal: q.goal })}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${(q.progress / q.goal) * 100}%` }} />
          </div>
          <span className="text-xs text-white/60 tabular-nums">
            {q.progress}/{q.goal}
          </span>
        </div>
      </div>
      <ClaimButton claimed={q.claimed} ready={done} reward={q.reward} busy={busy} onClaim={onClaim} />
    </li>
  );
}

function ClaimButton({ claimed, ready, reward, busy, onClaim }: { claimed: boolean; ready: boolean; reward: number; busy: boolean; onClaim: () => void }) {
  const t = useT();
  const fmt = useGoldFormat();
  if (claimed) return <span className="shrink-0 text-xs font-bold text-emerald-300">✓ {t("quests.claimed")}</span>;
  if (!ready) return <span className="shrink-0 text-sm font-bold text-gold/50">+{fmt(reward)} 🪙</span>;
  return (
    <button className="btn-gold btn-sm shrink-0" disabled={busy} onClick={onClaim}>
      {t("quests.claim", { gold: fmt(reward) })}
    </button>
  );
}

/** The time, updated every 30 seconds (for the reset countdown). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);
  return now;
}
