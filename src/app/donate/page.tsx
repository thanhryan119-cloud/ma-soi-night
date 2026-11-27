"use client";

// The coffee card on its own page (opened in a window over a room, or from a link).

import Link from "next/link";
import { DonateCard } from "@/components/Donate";
import { LangSwitch } from "@/components/ui";
import { useEmbedded } from "@/lib/embed";
import { useT } from "@/lib/i18n";

export default function DonatePage() {
  const t = useT();
  const embedded = useEmbedded();
  return (
    <main className={`mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pb-10 ${embedded ? "pt-4" : "pt-16"}`}>
      {!embedded && <LangSwitch />}
      {!embedded && (
        <Link href="/" className="btn-ghost btn-sm self-start" title={t("common.back")}>
          ←<span className="sr-only">{t("common.back")}</span>
        </Link>
      )}
      <section className="card p-6">
        <DonateCard />
      </section>
    </main>
  );
}
