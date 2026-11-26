"use client";

// Role collection: every role's card, tinted bronze, silver, gold or rainbow
// by the signed-in player's wins with it.

import Link from "next/link";
import { GlobalChat } from "@/components/GlobalChat";
import { GoogleButton } from "@/components/ProfileEditor";
import { CollectionRule, CollectionSummary, RoleCollection } from "@/components/RoleCollection";
import { LangSwitch } from "@/components/ui";
import { GOOGLE_CLIENT_ID, useAccount } from "@/lib/account";
import { useMyStats } from "@/lib/stats";
import { useT } from "@/lib/i18n";
import { useEmbedded } from "@/lib/embed";

export default function CollectionPage() {
  const t = useT();
  const embedded = useEmbedded();
  const account = useAccount();
  const stats = useMyStats(account?.user.id, true);
  return (
    <main className={`mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 pb-10 ${embedded ? "pt-4" : "pt-16"}`}>
      {!embedded && <GlobalChat />}
      {!embedded && <LangSwitch />}
      <div className="flex flex-wrap items-center gap-3">
        {!embedded && (
          <Link href="/profile" className="btn-ghost btn-sm" title={t("common.back")}>
            ←<span className="sr-only">{t("common.back")}</span>
          </Link>
        )}
        <h1 className="font-display text-3xl font-black">🃏 {t("collection.title")}</h1>
      </div>
      <p className="text-sm text-white/70">{t("collection.intro")}</p>

      {!account ? (
        <>
          <section className="card flex flex-col gap-3 border-gold/40">
            <p className="font-bold text-white/90">🔐 {t("collection.signIn")}</p>
            <p className="text-xs text-white/55">{t("collection.guestNote")}</p>
            {GOOGLE_CLIENT_ID ? <GoogleButton /> : <p className="text-xs text-white/50">{t("profile.authUnavailable")}</p>}
          </section>
          {/* A taste of what signing in unlocks: every card, still locked. */}
          <h2 className="-mb-2 text-sm font-bold text-white/70">{t("collection.preview")}</h2>
          <RoleCollection stats={null} />
        </>
      ) : stats === undefined ? (
        <p className="text-center text-white/50">{t("collection.loading")}</p>
      ) : (
        <>
          <section className="card flex flex-col gap-3">
            <CollectionSummary stats={stats} />
            <CollectionRule />
          </section>
          <RoleCollection stats={stats} />
        </>
      )}
    </main>
  );
}
