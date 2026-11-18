"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";
import { LangSwitch, toast } from "@/components/ui";
import { loadLocalProfile, refreshAccount, saveLocalProfile, type LocalProfile } from "@/lib/account";
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
    </main>
  );
}
