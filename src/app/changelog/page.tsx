"use client";

// Every version and what it changed, newest first.

import Link from "next/link";
import { APP_VERSION, CHANGELOG } from "@shared/changelog";
import { ReleaseItems, releaseDate } from "@/components/Mailbox";
import { useLocale, useT } from "@/lib/i18n";

export default function ChangelogPage() {
  const t = useT();
  const { locale } = useLocale();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-10">
      <Link href="/" className="btn-ghost btn-sm self-start">
        ← {t("common.back")}
      </Link>
      <header>
        <h1 className="font-display text-4xl font-black text-moon">✨ {t("changelog.title")}</h1>
        <p className="mt-1 text-white/60">{t("changelog.current", { version: APP_VERSION })}</p>
      </header>
      <ol className="flex flex-col gap-4">
        {CHANGELOG.map((r, i) => (
          <li key={r.version} className="card flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={`rounded px-2 py-0.5 font-mono text-sm font-bold ${i === 0 ? "bg-gold text-night-950" : "bg-white/10 text-white/80"}`}>
                v{r.version}
              </span>
              <h2 className="min-w-0 flex-1 font-display text-xl font-black text-moon">{r.title[locale === "en" ? "en" : "vi"]}</h2>
              <span className="text-xs text-white/40">{releaseDate(r.date, locale)}</span>
            </div>
            <ReleaseItems release={r} />
          </li>
        ))}
      </ol>
    </main>
  );
}
