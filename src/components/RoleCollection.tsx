"use client";

// The role collection: one card per role, tinted by how often the player won
// with it (bronze, silver, gold, rainbow). Used on /collection and, smaller,
// on other players' profile cards.

import Link from "next/link";
import { ROLE_IDS, ROLES } from "@shared/roles";
import { MIN_HUMANS_FOR_STATS, type UserStats } from "@shared/stats";
import { TIERS, TIER_WINS, collectionSummary, nextTier, roleWins, tierFor, type CardTier } from "@shared/achievements";
import { RoleArt } from "@/components/art/Tarot";
import { useT } from "@/lib/i18n";

const TIER_ICON: Record<CardTier, string> = { bronze: "🥉", silver: "🥈", gold: "🥇", rainbow: "🌈" };

/** A small label for a tier, coloured like its metal. */
export function TierChip({ tier, className = "" }: { tier: CardTier; className?: string }) {
  const t = useT();
  return (
    <span className={`chip py-0 text-[11px] font-bold tier-chip-${tier} ${className}`}>
      <span className="[color:initial]">{TIER_ICON[tier]}</span> {t(`collection.tier.${tier}`)}
    </span>
  );
}

/** How many roles reached each tier. */
export function CollectionSummary({ stats }: { stats: UserStats | null | undefined }) {
  const t = useT();
  const { total, atLeast } = collectionSummary(stats);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-white/80">{t("collection.collected", { n: atLeast.bronze, total })}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TIERS.map((tier) => (
          <li key={tier} className="flex flex-col items-center gap-1 rounded-xl bg-white/5 px-2 py-2.5 text-center">
            <TierChip tier={tier} />
            <span className="font-display text-xl font-black text-moon tabular-nums">
              {atLeast[tier]}
              <span className="text-sm font-normal text-white/40">/{total}</span>
            </span>
            <span className="text-[11px] text-white/50">{t("collection.tierNeeds", { n: TIER_WINS[tier] })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CollectionCard({ role, wins }: { role: (typeof ROLE_IDS)[number]; wins: number }) {
  const t = useT();
  const tier = tierFor(wins);
  const next = nextTier(wins);
  const from = tier ? TIER_WINS[tier] : 0;
  const progress = next ? (wins - from) / (next.wins - from) : 1;
  return (
    <li className="flex flex-col gap-1.5">
      <RoleArt role={role} tier={tier} locked={!tier} className="w-full" />
      <div className="flex min-h-5 items-center justify-between gap-1">
        {tier ? <TierChip tier={tier} /> : <span className="text-[11px] text-white/40">{t("collection.locked")}</span>}
        <span className="shrink-0 text-xs font-bold text-white/70 tabular-nums">{t("collection.wins", { n: wins })}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10" title={next ? t("collection.toNext", { n: next.wins - wins, tier: t(`collection.tier.${next.tier}`) }) : t("collection.maxed")}>
        <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: ROLES[role].color }} />
      </div>
      <span className="text-[10px] leading-tight text-white/45">
        {next ? t("collection.toNext", { n: next.wins - wins, tier: t(`collection.tier.${next.tier}`) }) : t("collection.maxed")}
      </span>
    </li>
  );
}

/** Every role's card. Best tiers first, then the rest in the usual role order. */
export function RoleCollection({ stats }: { stats: UserStats | null | undefined }) {
  const roles = [...ROLE_IDS].sort((a, b) => roleWins(stats, b) - roleWins(stats, a));
  return (
    <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4">
      {roles.map((r) => (
        <CollectionCard key={r} role={r} wins={roleWins(stats, r)} />
      ))}
    </ul>
  );
}

/** A compact strip for profile cards: the summary and only the roles already won with. */
export function CollectionPeek({ stats }: { stats: UserStats | null | undefined }) {
  const t = useT();
  const won = ROLE_IDS.filter((r) => roleWins(stats, r) > 0).sort((a, b) => roleWins(stats, b) - roleWins(stats, a));
  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-sm font-bold text-white/80">🃏 {t("collection.title")}</h4>
      <CollectionSummary stats={stats} />
      {won.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {won.map((r) => (
            <li key={r} className="flex flex-col items-center gap-0.5" title={t(`roles.${r}.name`)}>
              <RoleArt role={r} tier={tierFor(roleWins(stats, r))} className="w-full" />
              <span className="text-[10px] text-white/60 tabular-nums">{t("collection.wins", { n: roleWins(stats, r) })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CollectionLink({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <Link href="/collection" className={`btn-ghost btn-sm border-gold/50 text-gold ${className}`} title={t("collection.title")}>
      🃏 <span className="max-sm:sr-only">{t("collection.open")}</span>
    </Link>
  );
}

export function CollectionRule() {
  const t = useT();
  return <p className="text-xs text-white/50">ℹ️ {t("collection.countRule", { min: MIN_HUMANS_FOR_STATS })}</p>;
}
