"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";
import { LangSwitch, toast } from "@/components/ui";
import { loadLocalProfile, refreshAccount, saveLocalProfile, useAccount, type LocalProfile } from "@/lib/account";
import { StatsView } from "@/components/Profile";
import { fetchMyStats } from "@/lib/stats";
import type { UserStats } from "@shared/stats";
import { useT } from "@/lib/i18n";

export default function ProfilePage() {
  const t = useT();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  useEffect(() => {
    setProfile(loadLocalProfile());
    refreshAccount();
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 pt-16 pb-10">
      <LangSwitch />
      <div className="flex items-center gap-3">
        <Link href="/" className="btn-ghost btn-sm">
          ← {t("common.back")}
        </Link>
        <h1 className="font-display text-3xl font-black">{t("profile.title")}</h1>
      </div>
      {profile && <ProfileEditor value={profile} onChange={setProfile} />}
      <button
        className="btn-primary py-4 text-lg"
        disabled={!profile}
        onClick={() => {
          if (!profile) return;
          saveLocalProfile(profile);
          toast(t("profile.saved"), "info");
        }}
      >
        {t("profile.save")}
      </button>
      <MyStats />
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
        <StatsView stats={stats} />
      )}
    </section>
  );
}
