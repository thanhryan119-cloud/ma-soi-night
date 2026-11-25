"use client";

// The shop: everything that can be bought, in one place: name effects, name
// fonts, avatar frames and chat decorations (every role is free). 50.000đ each, bought once per Google
// account through payOS (the buyer comes back to /profile, which confirms it).
// Some items can also be bought with gold earned from quests (GOLD_PRICES).

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_STYLE, ITEM_PRICE_VND, SHOP_ITEMS, equip, type ChatDeco, type ItemId, type ItemKind, type PlayerStyle } from "@shared/cosmetics";
import { goldPrice } from "@shared/quests";
import { CheckoutDialog, usePrice } from "@/components/Checkout";
import { GoogleButton } from "@/components/ProfileEditor";
import { GoldChip, QuestsLink, useGoldFormat } from "@/components/Quests";
import { Avatar, ChatBubble, LangSwitch, StyledName, toast } from "@/components/ui";
import {
  GOOGLE_CLIENT_ID,
  buyWithGold,
  fetchShop,
  loadLocalProfile,
  refreshAccount,
  saveLocalProfile,
  updateAccount,
  useAccount,
  useQuests,
  type LocalProfile,
  type ShopInfo,
} from "@/lib/account";
import { useT } from "@/lib/i18n";

/** Shown in this order. */
const SECTIONS: { kind: ItemKind; icon: string; title: string }[] = [
  { kind: "effect", icon: "✨", title: "profile.nameEffect" },
  { kind: "font", icon: "🔤", title: "profile.nameFont" },
  { kind: "frame", icon: "⭕", title: "profile.avatarFrame" },
  { kind: "chat", icon: "💬", title: "profile.chatDeco" },
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
  }, [user?.style.font, user?.style.effect, user?.style.frame, user?.style.chat]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <GoldChip />
      </div>

      <section className="card flex flex-col gap-3">
        <p className="text-white/80">{t("shop.pageHint")}</p>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/30 bg-gold/[0.05] p-3">
          <p className="min-w-0 flex-1 text-sm text-gold">🪙 {t("shop.goldHint")}</p>
          <QuestsLink />
        </div>
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
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
  const [buying, setBuying] = useState(false);
  const quests = useQuests();
  const fmtGold = useGoldFormat();
  const gold = goldPrice(id);
  const [kind, value] = split(id);
  const cost = price(shop?.price ?? ITEM_PRICE_VND);
  const title = t(`profile.${kind}.${value}`);
  const base: PlayerStyle = profile?.style ?? DEFAULT_STYLE;
  const preview = { name, avatar: profile?.avatar ?? "🐺", avatarUrl, style: equip(base, id), alive: true };
  const wearing = owned && profile?.style[kind] === value;

  const payGold = async () => {
    setBuying(true);
    const r = await buyWithGold(id);
    setBuying(false);
    if (r.ok) toast(t("shop.boughtWithGold", { item: title }), "info");
    else toast(t(r.error ?? "err.server"));
  };

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 ${owned ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "border-white/10 bg-white/[0.03]"}`}
    >
      <div className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-md bg-night-900 p-2">
          {kind === "frame" ? (
            <Avatar p={preview} size="lg" />
          ) : kind === "chat" ? (
            <ChatBubble color={1} deco={value as ChatDeco} className="px-3 py-1.5">
              {t("profile.chatSample")}
            </ChatBubble>
          ) : (
            <StyledName p={preview} className="block max-w-full truncate text-xl font-black" />
          )}
          <span className="text-xs text-white/60">{title}</span>
        </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        {owned ? (
          <span className="text-xs font-bold text-emerald-300">✓ {t("shop.owned")}</span>
        ) : (
          <span className="text-sm font-bold text-gold">{cost}</span>
        )}
        {owned ? (
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
      {!owned && gold !== null && (
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <span className="text-sm font-bold text-gold">🪙 {fmtGold(gold)}</span>
          {signedIn && (
            <button
              className="btn-ghost btn-sm border-gold/50 text-gold"
              disabled={buying || !quests || quests.gold < gold}
              title={quests && quests.gold < gold ? t("shop.needGold", { gold: fmtGold(gold - quests.gold) }) : undefined}
              onClick={payGold}
            >
              {t("shop.buyGold")}
            </button>
          )}
        </div>
      )}
      {/* Price, discount code and the payment button. */}
      {checkout && <CheckoutDialog itemId={id} title={title} itemName={title} onClose={() => setCheckout(false)} />}
    </li>
  );
}
