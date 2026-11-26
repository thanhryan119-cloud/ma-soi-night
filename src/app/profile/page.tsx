"use client";

import Link from "next/link";
import { GlobalChat } from "@/components/GlobalChat";
import { useEffect, useRef, useState } from "react";
import { ProfileEditor } from "@/components/ProfileEditor";
import { QuestsLink } from "@/components/Quests";
import { CollectionLink } from "@/components/RoleCollection";
import { Avatar, LangSwitch, ProfileCard, StyledName, toast } from "@/components/ui";
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
import { useItemName } from "@/components/Checkout";
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
  const backTo = usePaymentReturn(setProfile);
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
        <Link href="/shop" className="btn-ghost btn-sm border-gold/50 text-gold" title={t("shop.open")}>
          🛒<span className="sr-only">{t("shop.open")}</span>
        </Link>
      </div>
      {backTo && (
        <Link href={backTo} className="btn-ghost w-full">
          ← {t("shop.backToRoom")}
        </Link>
      )}
      {look && (
        <ProfileCard bg={look.style.card} className="flex items-center gap-4 p-4">
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
      <AdminLink />
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
  const itemName = useItemName();
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
          const item = itemName(itemId);
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

/** Admins (ADMIN_EMAILS on the server) get a way into the code management page. */
function AdminLink() {
  const t = useT();
  const account = useAccount();
  if (!account?.user.isAdmin) return null;
  return (
    <Link href="/admin/codes" className="btn-ghost w-full">
      🏷️ {t("codes.manage")}
    </Link>
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
