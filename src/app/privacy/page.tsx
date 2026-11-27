"use client";

import Link from "next/link";
import { LangSwitch } from "@/components/ui";
import { useT } from "@/lib/i18n";

const REPO_ISSUES = "https://github.com/thanhryan119-cloud/ma-soi-night/issues";

export default function PrivacyPage() {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 pt-16 pb-12 leading-relaxed">
      <LangSwitch />
      <Link href="/" className="btn-ghost btn-sm self-start">
        ← {t("app.name")}
      </Link>
      <header>
        <h1 className="font-display text-4xl font-black">{t("privacy.title")}</h1>
        <p className="mt-1 text-sm text-white/50">{t("privacy.updated")}</p>
      </header>
      <p className="text-white/80">{t("privacy.intro")}</p>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t("privacy.h1")}</h2>
        <p className="text-white/80">{t("privacy.p1")}</p>
        <p className="text-white/80">{t("privacy.p2")}</p>
        <p className="text-white/80">{t("privacy.p3")}</p>
        <p className="text-white/80">{t("privacy.pDonate")}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t("privacy.h2")}</h2>
        <p className="text-white/80">{t("privacy.p4")}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t("privacy.h3")}</h2>
        <p className="text-white/80">{t("privacy.p5")}</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{t("privacy.h4")}</h2>
        <p className="text-white/80">
          {t("privacy.p6")}{" "}
          <a className="underline underline-offset-4 hover:text-white" href={REPO_ISSUES} target="_blank" rel="noreferrer">
            {REPO_ISSUES}
          </a>
        </p>
      </section>
    </main>
  );
}
