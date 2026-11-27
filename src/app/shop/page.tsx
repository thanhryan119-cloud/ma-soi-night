"use client";

// The shop: everything that can be bought, in one place: name effects, name
// fonts, avatar frames, chat decorations, and special role cards (a few roles
// are free each day, a card keeps one open; bundles are 20% off). 50.000đ each, bought once per Google
// account through payOS (the buyer comes back to /profile, which confirms it).
// Some items can also be bought with gold earned from quests (GOLD_PRICES).

import Link from "next/link";
import { GlobalChat } from "@/components/GlobalChat";
import { useEffect, useState } from "react";
import {
  BUNDLES,
  BUNDLE_DISCOUNT,
  BUNDLE_ITEMS,
  DEFAULT_STYLE,
  ITEM_PRICE_VND,
  ROLE_ITEMS,
  SHOP_ITEMS,
  bundleListPrice,
  equip,
  itemPrice,
  type BundleName,
  type CardBg,
  type ChatDeco,
  type ItemId,
  type ItemKind,
  type PlayerStyle,
} from "@shared/cosmetics";
import { FREE_BATCH_SIZES, SPECIAL_ROLES, daysUntilFree, freeRolesAt, nextRotation } from "@shared/freeRoles";
import type { RoleId } from "@shared/types";
import { goldPrice } from "@shared/quests";
import { ROLES } from "@shared/roles";
import { RoleArt } from "@/components/art/Tarot";
import { CheckoutDialog, useItemName, usePrice } from "@/components/Checkout";
import { GoogleButton } from "@/components/ProfileEditor";
import { GoldChip, QuestsLink, useGoldFormat } from "@/components/Quests";
import { Avatar, ChatBubble, LangSwitch, ProfileCard, StyledName, toast } from "@/components/ui";
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
import { useEmbedded } from "@/lib/embed";

/** Shown in this order. */
const SECTIONS: { kind: ItemKind; icon: string; title: string }[] = [
  { kind: "effect", icon: "✨", title: "profile.nameEffect" },
  { kind: "font", icon: "🔤", title: "profile.nameFont" },
  { kind: "frame", icon: "⭕", title: "profile.avatarFrame" },
  { kind: "chat", icon: "💬", title: "profile.chatDeco" },
  { kind: "card", icon: "🖼️", title: "profile.cardBg" },
];

const split = (id: ItemId) => id.split(":") as [ItemKind, string];

export default function ShopPage() {
  const t = useT();
  const embedded = useEmbedded();
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
  }, [user?.style.font, user?.style.effect, user?.style.frame, user?.style.chat, user?.style.card]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <main className={`mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 pb-10 ${embedded ? "pt-4" : "pt-16"}`}>
      {!embedded && <GlobalChat />}
      {!embedded && <LangSwitch />}
      <div className="flex flex-wrap items-center gap-3">
        {!embedded && (
          <Link href="/" className="btn-ghost btn-sm" title={t("common.back")}>
            ←<span className="sr-only">{t("common.back")}</span>
          </Link>
        )}
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
            <Link href="/profile" className="btn-ghost btn-sm" title={t("profile.open")}>
              👤<span className="sr-only">{t("profile.open")}</span>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gold">{t("shop.signInFirst")}</p>
            {GOOGLE_CLIENT_ID ? <GoogleButton /> : <p className="text-xs text-white/50">{t("profile.authUnavailable")}</p>}
          </div>
        )}
        <nav className="flex flex-wrap gap-2" aria-label={t("shop.title")}>
          <a href="#shop-role" className="chip hover:border-gold/60">
            🃏 {t("shop.rolesTitle")}
          </a>
          {SECTIONS.map((s) => (
            <a key={s.kind} href={`#shop-${s.kind}`} className="chip hover:border-gold/60">
              {s.icon} {t(s.title)}
            </a>
          ))}
        </nav>
      </section>

      <RoleShop owned={owned} signedIn={!!user} shop={shop} />

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

/**
 * Special roles: a few are free today (they change at midnight), a role card
 * keeps one open every day in the rooms you create, and bundles sell a group
 * of cards at 20% off.
 */
function RoleShop({ owned, signedIn, shop }: { owned: string[]; signedIn: boolean; shop: ShopInfo | null }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const free = freeRolesAt(now);
  const left = Math.max(0, nextRotation(now) - now);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return (
    <section id="shop-role" className="card flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-xl font-bold">🃏 {t("shop.rolesTitle")}</h2>
        {signedIn && (
          <span className="text-xs text-white/50">
            {t("shop.ownedCount", { owned: ROLE_ITEMS.filter((id) => owned.includes(id)).length, total: ROLE_ITEMS.length })}
          </span>
        )}
      </div>
      <p className="text-sm text-white/70">{t("freeRoles.hint", { sizes: FREE_BATCH_SIZES.join(", "), total: SPECIAL_ROLES.length })}</p>

      <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.05] p-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-bold text-emerald-300">🎁 {t("freeRoles.today", { count: free.length })}</h3>
          <span className="text-xs text-white/50">{t("freeRoles.changesIn", { hours, minutes })}</span>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {free.map((r) => (
            <li key={r} className="chip" title={t(`roles.${r}.desc`)}>
              {ROLES[r].emoji} {t(`roles.${r}.name`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-bold">
          📦 {t("freeRoles.bundles")}
          <span className="chip border-emerald-500/50 py-0 font-bold text-emerald-300">-{Math.round(BUNDLE_DISCOUNT * 100)}%</span>
        </h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {BUNDLE_ITEMS.map((id) => (
            <BundleCard key={id} id={id} owned={owned} signedIn={signedIn} shop={shop} />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-bold">🎴 {t("freeRoles.cards")}</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SPECIAL_ROLES.map((r) => (
            <RoleCard key={r} role={r} now={now} owned={owned.includes(`role:${r}`)} signedIn={signedIn} shop={shop} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function BundleCard({ id, owned, signedIn, shop }: { id: ItemId; owned: string[]; signedIn: boolean; shop: ShopInfo | null }) {
  const t = useT();
  const price = usePrice();
  const itemName = useItemName();
  const [checkout, setCheckout] = useState(false);
  const roles = BUNDLES[id.slice(7) as BundleName];
  const cost = itemPrice(id, owned);
  const have = roles.filter((r) => owned.includes(`role:${r}`)).length;
  const done = cost === 0;
  const title = itemName(id);
  return (
    <li className={`flex flex-col gap-2 rounded-lg border p-3 ${done ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "border-gold/40 bg-gold/[0.04]"}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-bold">{title}</span>
        <span className="text-xs text-white/50">{t("freeRoles.bundleCount", { count: roles.length })}</span>
      </div>
      <p className="text-lg leading-none" title={roles.map((r) => t(`roles.${r}.name`)).join(", ")}>
        {roles.map((r) => (
          <span key={r} className={owned.includes(`role:${r}`) ? "opacity-40" : ""}>
            {ROLES[r].emoji}
          </span>
        ))}
      </p>
      {have > 0 && !done && <p className="text-xs text-white/50">{t("freeRoles.bundleHave", { have, total: roles.length })}</p>}
      <div className="mt-auto flex items-center justify-between gap-2">
        {done ? (
          <span className="text-xs font-bold text-emerald-300">✓ {t("shop.owned")}</span>
        ) : (
          <span className="flex items-baseline gap-2">
            <s className="text-xs text-white/40">{price(bundleListPrice(id, owned))}</s>
            <span className="text-sm font-bold text-gold">{price(cost)}</span>
          </span>
        )}
        {!done && signedIn && shop?.enabled && (
          <button className="btn-gold btn-sm" onClick={() => setCheckout(true)}>
            {t("shop.buyShort")}
          </button>
        )}
      </div>
      {checkout && <CheckoutDialog itemId={id} title={title} itemName={title} onClose={() => setCheckout(false)} />}
    </li>
  );
}

function RoleCard({ role: r, now, owned, signedIn, shop }: { role: RoleId; now: number; owned: boolean; signedIn: boolean; shop: ShopInfo | null }) {
  const t = useT();
  const price = usePrice();
  const [checkout, setCheckout] = useState(false);
  const days = daysUntilFree(r, now);
  const name = t(`roles.${r}.name`);
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 ${owned ? "bg-emerald-500/[0.04]" : ""}`}
      style={{ borderColor: owned ? "rgb(16 185 129 / 0.4)" : `${ROLES[r].color}66` }}
    >
      <div className="flex gap-3">
        <RoleArt role={r} className="w-24 shrink-0 sm:w-28" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-bold">
            {ROLES[r].emoji} {name}
          </span>
          <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">{t(`teams.${ROLES[r].team}`)}</span>
          <p className="text-xs leading-snug text-white/70">{t(`roles.${r}.desc`)}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        {owned ? (
          <span className="text-xs font-bold text-emerald-300">✓ {t("freeRoles.ownedCard")}</span>
        ) : (
          <span className="flex flex-col">
            <span className="text-sm font-bold text-gold">{price(shop?.price ?? ITEM_PRICE_VND)}</span>
            {days === 0 && <span className="text-xs font-bold text-emerald-300">{t("freeRoles.freeToday")}</span>}
          </span>
        )}
        {!owned && signedIn && shop?.enabled && (
          <button className="btn-gold btn-sm" onClick={() => setCheckout(true)}>
            {t("shop.buyShort")}
          </button>
        )}
      </div>
      {checkout && <CheckoutDialog itemId={`role:${r}`} title={name} itemName={name} onClose={() => setCheckout(false)} />}
    </li>
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
            // Room for the parts of a frame that reach past the avatar (crown, ears, drips).
            <span className="py-3">
              <Avatar p={preview} size="lg" />
            </span>
          ) : kind === "card" ? (
            <ProfileCard bg={value as CardBg} className="flex w-full items-center gap-2 px-2.5 py-4">
              <Avatar p={preview} size="md" />
              <StyledName p={preview} className="block min-w-0 truncate text-base font-black" />
            </ProfileCard>
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
