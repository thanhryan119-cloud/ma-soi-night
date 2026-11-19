"use client";

import Link from "next/link";
import { TarotSpread } from "@/components/art/TarotSpread";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@shared/types";
import { LangSwitch, useErrorToast } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { emitAck, hostKey, storage } from "@/lib/socket";

export default function Home() {
  const t = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const showError = useErrorToast();
  const [roomLocale, setRoomLocale] = useState<Locale>(locale);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setRoomLocale(locale), [locale]);

  async function createRoom() {
    setBusy(true);
    const res = await emitAck<{ ok: boolean; code: string; hostToken: string }>("host:create", { locale: roomLocale });
    setBusy(false);
    if (!showError(res) || !res.code) return;
    storage.set(hostKey(res.code), res.hostToken);
    router.push(`/host/${res.code}`);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/join/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-10 sm:py-16">
      <LangSwitch />
      <Link href="/profile" className="btn-ghost btn-sm fixed top-3 left-3 z-50">
        👤 {t("profile.open")}
      </Link>
      <header className="mb-10 flex flex-col items-center text-center">
        <TarotSpread className="mb-14 sm:mb-16" />
        <h1 className="font-display text-5xl font-black tracking-tight text-moon sm:text-6xl">{t("app.name")}</h1>
        <p className="mt-3 max-w-xl text-lg text-white/70">{t("app.tagline")}</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card flex flex-col gap-4 p-6">
          <div>
            <h2 className="text-2xl font-bold">🎙️ {t("home.createTitle")}</h2>
            <p className="mt-1 text-white/60">{t("home.createDesc")}</p>
          </div>
          <div>
            <span className="ui-label">{t("home.roomLanguage")}</span>
            <div className="flex gap-2">
              {(["vi", "en"] as Locale[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setRoomLocale(l)}
                  className={`btn flex-1 ${roomLocale === l ? "bg-gold text-night-950" : "btn-ghost"}`}
                >
                  {t(`lang.${l}`)}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary mt-auto py-4 text-lg" onClick={createRoom} disabled={busy}>
            {busy ? t("home.creating") : t("home.createButton")}
          </button>
        </section>

        <form className="card flex flex-col gap-4 p-6" onSubmit={join}>
          <div>
            <h2 className="text-2xl font-bold">📱 {t("home.joinTitle")}</h2>
            <p className="mt-1 text-white/60">{t("home.joinDesc")}</p>
          </div>
          <input
            className="ui-input text-center font-mono text-3xl tracking-[0.4em] uppercase"
            placeholder={t("home.codePlaceholder")}
            value={code}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-label={t("home.codePlaceholder")}
          />
          <button className="btn-gold mt-auto py-4 text-lg" disabled={!code.trim()}>
            {t("home.joinButton")}
          </button>
        </form>
      </div>

      <section className="mt-10 card p-6">
        <h2 className="mb-3 text-xl font-bold">{t("home.howTitle")}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {(["home.how1", "home.how2", "home.how3"] as const).map((k, i) => (
            <li key={k} className="flex gap-3 rounded-xl bg-white/5 p-4">
              <span className="font-display text-3xl font-black text-gold">{i + 1}</span>
              <span className="text-white/80">{t(k)}</span>
            </li>
          ))}
        </ol>
      </section>
      <footer className="mt-10 text-center text-sm text-white/40">
        <Link href="/privacy" className="hover:text-white">
          {t("privacy.link")}
        </Link>
      </footer>
    </main>
  );
}
