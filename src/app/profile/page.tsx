"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";
import { RoleShopCard } from "@/components/RoleShop";
import { LangSwitch, toast } from "@/components/ui";
import {
  SHOP_RETURN_KEY,
  checkOrder,
  loadLocalProfile,
  refreshAccount,
  saveLocalProfile,
  useAccount,
  type LocalProfile,
} from "@/lib/account";
import { storage } from "@/lib/socket";
import type { ItemKind } from "@shared/cosmetics";
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
  const backTo = usePaymentReturn(setProfile);
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 pt-16 pb-10">
      <LangSwitch />
      <div className="flex items-center gap-3">
        <Link href="/" className="btn-ghost btn-sm">
          ← {t("common.back")}
        </Link>
        <h1 className="font-display text-3xl font-black">{t("profile.title")}</h1>
      </div>
      {backTo && (
        <Link href={backTo} className="btn-ghost w-full">
          ← {t("shop.backToRoom")}
        </Link>
      )}
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
      <RoleShopCard />
      <MyStats />
    </main>
  );
}

/**
 * payOS sends the buyer back here with ?order=<code>. Ask the server whether the
 * money landed (it double-checks with payOS), wear the item, and tidy the URL.
 * Returns the page the purchase started from, if any.
 */
function usePaymentReturn(setProfile: React.Dispatch<React.SetStateAction<LocalProfile | null>>) {
  const t = useT();
  const [backTo, setBackTo] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    const params = new URLSearchParams(window.location.search);
    const orderCode = parseInt(params.get("order") ?? params.get("orderCode") ?? "", 10);
    if (!orderCode) return;
    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    const from = storage.get<string>(SHOP_RETURN_KEY);
    storage.remove(SHOP_RETURN_KEY);
    if (from && from.startsWith("/") && !from.startsWith("/profile")) setBackTo(from);

    let alive = true;
    (async () => {
      // The webhook can land a few seconds after the buyer is sent back.
      for (let i = 0; i < 6 && alive; i++) {
        const r = await checkOrder(orderCode);
        if (!r.ok || !r.order) return toast(t(r.error ?? "err.server"));
        const { status, itemId } = r.order;
        if (status === "paid") {
          if (r.user) {
            const style = r.user.style;
            setProfile((p) => {
              if (!p) return p;
              const next = { ...p, style };
              saveLocalProfile(next);
              return next;
            });
          }
          const [kind, value] = itemId.split(":") as [ItemKind, string];
          const item = kind === "role" ? t("shop.roleBought", { role: t(`roles.${value}.name`) }) : t(`profile.${kind}.${value}`);
          return toast(t("shop.paid", { item }), "info");
        }
        if (status === "cancelled" || status === "expired" || params.get("cancel") === "true")
          return toast(t("shop.cancelled"), "info");
        if (i === 0) toast(t("shop.checking"), "info");
        await new Promise((res) => setTimeout(res, 3000));
      }
      if (alive) toast(t("shop.pending"));
    })();
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return backTo;
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
