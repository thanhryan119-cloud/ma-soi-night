"use client";

import { SfxToggle } from "@/components/Sfx";
import Link from "next/link";
import { CollectionLink } from "@/components/RoleCollection";
import { DonateLink } from "@/components/Donate";
import { QuestsLink } from "@/components/Quests";
import { TarotSpread } from "@/components/art/TarotSpread";
import { useEffect, useState } from "react";
import { ROLE_IDS } from "@shared/roles";
import type { OnlineList } from "@shared/social";
import { LangSwitch, toast } from "@/components/ui";
import { Leaderboard } from "@/components/Leaderboard";
import { GlobalChat, useGlobalChat } from "@/components/GlobalChat";

type Chat = ReturnType<typeof useGlobalChat>;
import { Mailbox } from "@/components/Mailbox";
import { OnlinePeople } from "@/components/OnlinePeople";
import { HowToPlay } from "@/components/HowToPlay";
import { Onboarding } from "@/components/Onboarding";
import { InstallPrompt } from "@/components/InstallPrompt";
import { APP_VERSION } from "@shared/changelog";
import { useT } from "@/lib/i18n";
import { GOOGLE_CLIENT_ID, useAccount } from "@/lib/account";
import { GoogleButton } from "@/components/ProfileEditor";

export default function Home() {
  // The server chat also knows who is online, the room counts and the friends: the page shows them too.
  return <GlobalChat render={(chat) => <HomePage chat={chat} />} />;
}

function HomePage({ chat }: { chat: Chat }) {
  const t = useT();
  const { online } = chat;

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pt-14 pb-28 sm:pt-16">
      <LangSwitch />
      <InstallPrompt />
      <Onboarding auto />
      <div className="fixed top-3 right-3 z-50 flex gap-2">
        <Link href="/guide" className="btn-ghost btn-sm border-gold/50 text-gold" title={t("guide.open")}>
          📖 <span className="sr-only">{t("guide.open")}</span>
        </Link>
        <SfxToggle />
        <Mailbox />
        <QuestsLink />
        <CollectionLink />
        <DonateLink />
        <Link href="/profile" className="btn-ghost btn-sm" title={t("profile.open")}>
          👤 <span className="sr-only">{t("profile.open")}</span>
        </Link>
      </div>

      <header className="flex flex-col items-center text-center">
        <TarotSpread className="mb-12 sm:mb-14" />
        <h1 className="font-display text-5xl font-black tracking-tight text-moon drop-shadow-[0_4px_24px_rgba(232,180,90,0.35)] sm:text-7xl">
          {t("app.name")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/75 sm:text-xl">{t("home.heroTagline")}</p>
        <LiveStats online={online} />

        <Link href="/lobby?quick=1" className="cta-play mt-8 w-full max-w-xl px-8 py-5 sm:py-6">
          <span className="font-display text-3xl font-black tracking-wide uppercase sm:text-4xl">⚡ {t("home.ctaPlay")}</span>
          <span className="text-sm font-semibold opacity-80 sm:text-base">{t("home.ctaPlaySub")}</span>
        </Link>
        <div className="mt-4 flex w-full max-w-xl flex-col gap-2 sm:flex-row">
          <Link href="/lobby" className="btn-ghost flex-1 py-3 text-base">
            🌐 {t("home.ctaLobby")}
          </Link>
          <ShareButton />
          <Link href="/guide" className="btn-ghost flex-1 py-3 text-base">
            📖 {t("home.ctaHow")}
          </Link>
        </div>
        <div className="mt-4 w-full max-w-xl">
          <SignInToSave />
        </div>
      </header>

      <Features />

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <OnlinePeople chat={chat} />
        <Leaderboard className="" />
      </div>

      <HowToPlay />

      <section className="mt-12 flex flex-col items-center gap-3 rounded-2xl border border-gold/40 bg-gradient-to-br from-night-700 via-night-800 to-blood/30 px-6 py-10 text-center">
        <span className="text-5xl">🐺</span>
        <h2 className="font-display text-3xl font-black text-moon sm:text-4xl">{t("home.finalTitle")}</h2>
        <p className="max-w-lg text-white/70">{t("home.finalDesc")}</p>
        <Link href="/lobby?quick=1" className="cta-play mt-3 px-10 py-4">
          <span className="font-display text-2xl font-black uppercase">⚡ {t("home.ctaPlay")}</span>
        </Link>
      </section>

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

/** "● 12 online · 3 rooms waiting · 2 games in progress", live. */
function LiveStats({ online }: { online: OnlineList }) {
  const t = useT();
  const people = online.users.length + online.guests;
  const rooms = online.rooms;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
      <span className="flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 font-semibold text-emerald-200">
        <span className="live-dot" aria-hidden />
        {t("home.liveOnline", { n: Math.max(1, people) })}
      </span>
      {rooms && (
        <>
          <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-gold">🚪 {t("home.liveOpen", { n: rooms.open })}</span>
          <span className="rounded-full border border-blood/40 bg-blood/10 px-3 py-1 text-red-200">🔥 {t("home.livePlaying", { n: rooms.playing })}</span>
        </>
      )}
    </div>
  );
}

/** Shares the site (the phone's share sheet, or copies the link). */
function ShareButton() {
  const t = useT();
  async function share() {
    const url = window.location.origin;
    const text = t("home.shareText");
    try {
      if (navigator.share) return await navigator.share({ title: t("app.name"), text, url });
    } catch {
      return; // closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast(t("home.shareCopied"), "info");
    } catch {
      toast(url, "info");
    }
  }
  return (
    <button type="button" onClick={share} className="btn-ghost flex-1 border-gold/60 py-3 text-base text-gold">
      📣 {t("home.share")}
    </button>
  );
}

function Features() {
  const t = useT();
  const items = [
    ["📱", "feature1"],
    ["🤖", "feature2"],
    ["🃏", "feature3"],
    ["🎙️", "feature4"],
  ] as const;
  return (
    <section className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([icon, key]) => (
        <div key={key} className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-night-800/60 px-3 py-4 text-center">
          <span className="text-3xl">{icon}</span>
          <span className="font-bold text-moon">{t(`home.${key}Title`, { n: ROLE_IDS.length })}</span>
          <span className="text-xs text-white/60">{t(`home.${key}Desc`)}</span>
        </div>
      ))}
    </section>
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
    <div className="flex flex-col items-center gap-3 rounded-lg border border-gold/30 bg-gold/[0.05] p-3 text-left sm:flex-row">
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
