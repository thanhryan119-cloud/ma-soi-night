"use client";

import Link from "next/link";
import { GlobalChat } from "@/components/GlobalChat";
import { LinkGoogle } from "@/components/AuthPanel";
import { useEffect, useState } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";
import { QuestsLink } from "@/components/Quests";
import { CollectionLink } from "@/components/RoleCollection";
import { Avatar, LangSwitch, ProfileCard, StyledName, toast } from "@/components/ui";
import {
  loadLocalProfile,
  refreshAccount,
  saveLocalProfile,
  signOut,
  useAccount,
  type LocalProfile,
} from "@/lib/account";
import { DonateLink } from "@/components/Donate";
import { StatsView } from "@/components/Profile";
import { fetchMyStats } from "@/lib/stats";
import type { UserStats } from "@shared/stats";
import { useT } from "@/lib/i18n";
import { useEmbedded } from "@/lib/embed";

export default function ProfilePage() {
  const t = useT();
  const embedded = useEmbedded();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  useEffect(() => {
    setProfile(loadLocalProfile());
    refreshAccount();
  }, []);
  const account = useAccount();
  // The page shows the card and the stats; every edit option lives in a window
  // opened by the edit button.
  const [editing, setEditing] = useState(false);
  const closeEditor = () => {
    if (profile) saveLocalProfile(profile);
    setEditing(false);
  };
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeEditor();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const look = profile && {
    name: profile.name || t("player.namePlaceholder"),
    avatar: profile.avatar,
    avatarUrl: account?.user.avatarUrl ?? null,
    style: profile.style,
    alive: true,
  };
  return (
    <main className={`mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 pb-10 ${embedded ? "pt-4" : "pt-16"}`}>
      {!embedded && <GlobalChat />}
      {!embedded && <LangSwitch />}
      <div className="flex items-center gap-3">
        {!embedded && (
          <Link href="/" className="btn-ghost btn-sm" title={t("common.back")}>
            ←<span className="sr-only">{t("common.back")}</span>
          </Link>
        )}
        <h1 className="font-display text-3xl font-black">{t("profile.title")}</h1>
        <span className="ml-auto">
          <QuestsLink />
        </span>
        <CollectionLink />
        <DonateLink />
      </div>
      {look && (
        <ProfileCard bg={look.style.card} className="flex items-center gap-4 px-5 py-8">
          <Avatar p={look} size="xl" />
          <div className="min-w-0 flex-1">
            <StyledName p={look} className="block truncate text-3xl font-black" />
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setEditing(true)}>
              ✏️ {t("profile.edit")}
            </button>
          </div>
        </ProfileCard>
      )}
      <MyStats />
      {editing && profile && (
        <div
          className="page-enter fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeEditor}
          role="dialog"
          aria-modal="true"
          aria-label={t("profile.edit")}
        >
          <div
            className="rise flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-night-950 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2">
              <h3 className="min-w-0 flex-1 truncate font-bold">✏️ {t("profile.edit")}</h3>
              <button className="btn-ghost btn-sm" onClick={closeEditor} aria-label={t("common.close")} title={t("common.close")}>
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <ProfileEditor value={profile} onChange={setProfile} />
            </div>
            <div className="shrink-0 border-t border-white/10 p-3">
              <button
                className="btn-primary w-full py-3 text-lg"
                onClick={() => {
                  closeEditor();
                  toast(t("profile.saved"), "info");
                }}
              >
                {t("profile.save")}
              </button>
            </div>
          </div>
        </div>
      )}
      <LinkGoogle />
      <SignOutButton />
    </main>
  );
}

/** The signed-in player's own career (guests are invited to sign in). */
function MyStats() {
  const t = useT();
  const account = useAccount();
  const [stats, setStats] = useState<UserStats | null | undefined>(undefined);
  const userId = account?.user.id;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchMyStats().then((r) => alive && setStats(r.ok ? r.data : null));
    return () => {
      alive = false;
    };
  }, [userId]);
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-xl font-bold">📊 {t("stats.mine")}</h2>
      {!account ? (
        <p className="text-sm text-white/60">{t("stats.signInForStats")}</p>
      ) : stats === undefined ? null : (
        <>
          <Link href="/collection" className="btn-ghost w-full border-gold/50 text-gold">
            🃏 {t("collection.title")}
          </Link>
          <StatsView stats={stats} />
        </>
      )}
    </section>
  );
}

/** At the very bottom of your own profile: leave this account on this device. */
function SignOutButton() {
  const t = useT();
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  return (
    <button
      type="button"
      className="btn-ghost w-full border-blood/50 text-red-300"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        setBusy(false);
        toast(t("profile.signOut"), "info");
      }}
    >
      🚪 {t("profile.signOut")}
    </button>
  );
}
