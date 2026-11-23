"use client";

// The shop: everything that can be bought, in one place — special roles, name
// effects, name fonts and avatar frames. 50.000đ each, bought once per Google
// account through payOS (the buyer comes back to /profile, which confirms it).

import Link from "next/link";
import { useEffect, useState } from "react";
import { ITEM_PRICE_VND, SHOP_ITEMS, equip, type ItemId, type ItemKind, type PlayerStyle } from "@shared/cosmetics";
import { ROLES } from "@shared/roles";
import type { RoleId } from "@shared/types";
import { RoleArt } from "@/components/art/Tarot";
import { CheckoutDialog, usePrice } from "@/components/Checkout";
import { GoogleButton } from "@/components/ProfileEditor";
import { Avatar, LangSwitch, StyledName } from "@/components/ui";
import {
  GOOGLE_CLIENT_ID,
  fetchShop,
  loadLocalProfile,
  refreshAccount,
  saveLocalProfile,
  updateAccount,
  useAccount,
  type LocalProfile,
  type ShopInfo,
} from "@/lib/account";
import { useT } from "@/lib/i18n";

/** Shown in this order. */
const SECTIONS: { kind: ItemKind; icon: string; title: string }[] = [
  { kind: "role", icon: "🃏", title: "shop.rolesTitle" },
  { kind: "effect", icon: "✨", title: "profile.nameEffect" },
  { kind: "font", icon: "🔤", title: "profile.nameFont" },
  { kind: "frame", icon: "⭕", title: "profile.avatarFrame" },
];

const split = (id: ItemId) => id.split(":") as [ItemKind, string];

export default function ShopPage() {
  const t = useT();
  const account = useAccount();
  const user = account?.user ?? null;
  const owned = user?.owned ?? [];
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  useEffect(() => {
    fetchShop().then(setShop);
    setProfile(loadLocalProfile());
    refreshAccount();
  }, []);
  // Follow the account's style (a purchase or another device equips items).
  useEffect(() => {
    if (user) setProfile((p) => (p ? { ...p, style: user.style } : p));
  }, [user?.style.font, user?.style.effect, user?.style.frame]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = profile?.name || user?.name || t("shop.sampleName");

  /** Wears an owned style item (saved on this device and to the account). */
  const wear = (id: ItemId) => {
    if (!profile) return;
    const style = equip(profile.style, id);
    const next = { ...profile, style };
    setProfile(next);
    saveLocalProfile(next);
    if (user) updateAccount({ style });
  };

  const total = SHOP_ITEMS.length;
  const mine = SHOP_ITEMS.filter((id) => owned.includes(id)).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 pt-16 pb-10">
      <LangSwitch />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="btn-ghost btn-sm">
          ← {t("common.back")}
        </Link>
        <h1 className="font-display text-3xl font-black">🛒 {t("shop.title")}</h1>
        {user && <span className="chip ml-auto">{t("shop.ownedCount", { owned: mine, total })}</span>}
      </div>

      <section className="card flex flex-col gap-3">
        <p className="text-white/80">{t("shop.pageHint")}</p>
        {shop && !shop.enabled && <p className="text-sm text-blood-light">{t("shop.disabled")}</p>}
        {user ? (
          <div className="flex items-center gap-3">
            {profile && <Avatar p={{ avatar: profile.avatar, avatarUrl: user.avatarUrl, style: profile.style, alive: true }} size="md" />}
            <span className="min-w-0 flex-1 truncate text-sm text-white/70">{t("profile.signedInAs", { name: user.name })}</span>
            <Link href="/profile" className="btn-ghost btn-sm">
              👤 {t("profile.open")}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gold">{t("shop.signInFirst")}</p>
            {GOOGLE_CLIENT_ID ? <GoogleButton /> : <p className="text-xs text-white/50">{t("profile.authUnavailable")}</p>}
          </div>
        )}
        <nav className="flex flex-wrap gap-2" aria-label={t("shop.title")}>
          {SECTIONS.map((s) => (
            <a key={s.kind} href={`#shop-${s.kind}`} className="chip hover:border-gold/60">
              {s.icon} {t(s.title)}
            </a>
          ))}
        </nav>
      </section>

      {SECTIONS.map((s) => {
        const items = SHOP_ITEMS.filter((id) => split(id)[0] === s.kind);
        const have = items.filter((id) => owned.includes(id)).length;
        return (
          <section key={s.kind} id={`shop-${s.kind}`} className="card flex scroll-mt-4 flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-xl font-bold">
                {s.icon} {t(s.title)}
              </h2>
              {user && <span className="text-xs text-white/50">{t("shop.ownedCount", { owned: have, total: items.length })}</span>}
            </div>
            {s.kind === "role" && <p className="text-xs text-white/60">{t("shop.rolesHint")}</p>}
            <ul className={`grid gap-3 ${s.kind === "role" ? "sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
              {items.map((id) => (
                <ShopItem
                  key={id}
                  id={id}
                  name={name}
                  profile={profile}
                  avatarUrl={user?.avatarUrl ?? null}
                  owned={owned.includes(id)}
                  signedIn={!!user}
                  shop={shop}
                  onWear={() => wear(id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

function ShopItem({
  id,
  name,
  profile,
  avatarUrl,
  owned,
  signedIn,
  shop,
  onWear,
}: {
  id: ItemId;
  name: string;
  profile: LocalProfile | null;
  avatarUrl: string | null;
  owned: boolean;
  signedIn: boolean;
  shop: ShopInfo | null;
  onWear: () => void;
}) {
  const t = useT();
  const price = usePrice();
  const [checkout, setCheckout] = useState(false);
  const [kind, value] = split(id);
  const cost = price(shop?.price ?? ITEM_PRICE_VND);
  const isRole = kind === "role";
  const title = isRole ? t(`roles.${value}.name`) : t(`profile.${kind}.${value}`);
  const base: PlayerStyle = profile?.style ?? { font: "default", effect: "none", frame: "none" };
  const preview = { name, avatar: profile?.avatar ?? "🐺", avatarUrl, style: isRole ? base : equip(base, id), alive: true };
  const wearing = !isRole && owned && profile?.style[kind as keyof PlayerStyle] === value;


  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 ${owned ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "border-white/10 bg-white/[0.03]"}`}
      style={isRole ? { borderColor: `${ROLES[value as RoleId].color}66` } : undefined}
    >
      {isRole ? (
        <div className="flex gap-3">
          <RoleArt role={value as RoleId} className="w-24 shrink-0 sm:w-28" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-bold">
              {ROLES[value as RoleId].emoji} {title}
            </span>
            <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">{t(`teams.${ROLES[value as RoleId].team}`)}</span>
            <p className="text-xs leading-snug text-white/70">{t(`roles.${value}.desc`)}</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-md bg-night-900 p-2">
          {kind === "frame" ? (
            <Avatar p={preview} size="lg" />
          ) : (
            <StyledName p={preview} className="block max-w-full truncate text-xl font-black" />
          )}
          <span className="text-xs text-white/60">{title}</span>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2">
        {owned ? (
          <span className="text-xs font-bold text-emerald-300">✓ {t("shop.owned")}</span>
        ) : (
          <span className="text-sm font-bold text-gold">{cost}</span>
        )}
        {owned ? (
          !isRole &&
          (wearing ? (
            <span className="text-xs text-white/50">{t("shop.wearing")}</span>
          ) : (
            <button className="btn-ghost btn-sm" onClick={onWear}>
              {t("shop.wear")}
            </button>
          ))
        ) : (
          signedIn &&
          shop?.enabled && (
            <button className="btn-gold btn-sm" onClick={() => setCheckout(true)}>
              {t("shop.buyShort")}
            </button>
          )
        )}
      </div>
      {/* Price, discount code and the payment button. */}
      {checkout && <CheckoutDialog itemId={id} title={title} itemName={title} onClose={() => setCheckout(false)} />}
    </li>
  );
}
