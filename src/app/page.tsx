"use client";

import Link from "next/link";
import { CollectionLink } from "@/components/RoleCollection";
import { QuestsLink } from "@/components/Quests";
import { TarotSpread } from "@/components/art/TarotSpread";
import { PlayNowButton } from "@/components/PlayNow";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@shared/types";
import { LangSwitch, useErrorToast } from "@/components/ui";
import { Leaderboard } from "@/components/Leaderboard";
import { GlobalChat } from "@/components/GlobalChat";
import { Mailbox } from "@/components/Mailbox";
import { APP_VERSION } from "@shared/changelog";
import { useLocale, useT } from "@/lib/i18n";
import { emitAck, hostKey, storage } from "@/lib/socket";
import { GOOGLE_CLIENT_ID, getAuth, useAccount } from "@/lib/account";
import { GoogleButton } from "@/components/ProfileEditor";
import { ExistingRoomDialog, SignInToCreate, useNeedsSignInToCreate } from "@/components/CreateRoomGate";

export default function Home() {
  const t = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const showError = useErrorToast();
  const [roomLocale, setRoomLocale] = useState<Locale>(locale);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  /** The room this account already runs, when it tried to make another. */
  const [existing, setExisting] = useState<string | null>(null);
  const needsSignIn = useNeedsSignInToCreate();

  useEffect(() => setRoomLocale(locale), [locale]);

  async function createRoom(replace = false) {
    setBusy(true);
    const res = await emitAck<{ ok: boolean; code: string; hostToken: string }>("host:create", {
      locale: roomLocale,
      authToken: getAuth()?.token,
      replace,
    });
    setBusy(false);
    if (!res.ok && res.error === "err.oneRoom" && res.params?.code) return setExisting(String(res.params.code));
    if (!showError(res) || !res.code) return;
    setExisting(null);
    storage.set(hostKey(res.code), res.hostToken);
    const saved = storage.get<Record<string, unknown>>("msn:hostSettings");
    if (saved) {
      await emitAck("host:action", { type: "updateSettings", settings: saved });
      if (saved.roleCounts) await emitAck("host:action", { type: "setRoleCounts", roleCounts: saved.roleCounts });
    }
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
      <GlobalChat />
      <div className="fixed top-3 right-3 z-50 flex gap-2">
        <Mailbox />
        <QuestsLink />
        <CollectionLink />
        <Link href="/shop" className="btn-ghost btn-sm border-gold/50 text-gold" title={t("shop.open")}>
          🛒 <span className="sr-only">{t("shop.open")}</span>
        </Link>
        <Link href="/profile" className="btn-ghost btn-sm" title={t("profile.open")}>
          👤 <span className="sr-only">{t("profile.open")}</span>
        </Link>
      </div>
      <header className="mb-10 flex flex-col items-center text-center">
        <TarotSpread className="mb-14 sm:mb-16" />
        <h1 className="font-display text-5xl font-black tracking-tight text-moon sm:text-6xl">{t("app.name")}</h1>
        <p className="mt-3 max-w-xl text-lg text-white/70">{t("app.tagline")}</p>
      </header>

      <section className="card mb-6 flex flex-col gap-4 border-gold/40 p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <span className="text-4xl">🌐</span>
          <span className="min-w-0 flex-1">
            <span className="block text-2xl font-bold text-moon">{t("lobby.homeTitle")}</span>
            <span className="mt-1 block text-white/60">{t("lobby.homeDesc")}</span>
          </span>
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
            <PlayNowButton className="flex-1 px-6 py-3 text-lg sm:flex-none" />
            <Link href="/lobby?quick=1" className="btn-gold flex-1 px-6 py-3 text-lg sm:flex-none">
              ⚡ {t("lobby.quickButton")}
            </Link>
            <Link href="/lobby" className="btn-ghost flex-1 px-6 py-3 text-lg sm:flex-none">
              {t("lobby.homeButton")} →
            </Link>
          </div>
        </div>
        <SignInToSave />
      </section>

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
          {needsSignIn ? (
            <div className="mt-auto">
              <SignInToCreate />
            </div>
          ) : (
            <button className="btn-primary mt-auto py-4 text-lg" onClick={() => createRoom()} disabled={busy}>
              {busy ? t("home.creating") : t("home.createButton")}
            </button>
          )}
          {existing && (
            <ExistingRoomDialog code={existing} busy={busy} onReplace={() => createRoom(true)} onClose={() => setExisting(null)} />
          )}
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
      <Leaderboard />
      <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-sm text-white/40">
        <Link href="/changelog" className="hover:text-white">
          {t("changelog.footer", { version: APP_VERSION })}
        </Link>
        <Link href="/privacy" className="hover:text-white">
          {t("privacy.link")}
        </Link>
      </footer>
    </main>
  );
}

/** Guests only: sign in before playing, so the games are kept (history, win rates, role collection). */
function SignInToSave() {
  const t = useT();
  const account = useAccount();
  const [ready, setReady] = useState(false);
  // The account is read from storage after mount: wait, so a signed-in player never sees the prompt flash.
  useEffect(() => setReady(true), []);
  if (!ready || account) return null;
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-gold/30 bg-gold/[0.05] p-3 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm text-white/80">🔐 {t("home.signInToSave")}</p>
      {GOOGLE_CLIENT_ID ? (
        <GoogleButton />
      ) : (
        <Link href="/profile" className="btn-gold btn-sm shrink-0">
          {t("home.signInButton")}
        </Link>
      )}
    </div>
  );
}
