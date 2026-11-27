"use client";

// The shop: everything that can be bought, in one place: name effects, name
// fonts, avatar frames, chat decorations, and special role cards (a few roles
// are free each day, a card keeps one open; bundles are 20% off). 49.000đ each, bought once per Google
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

  const price = usePrice();
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

      <section className="relative overflow-hidden rounded-xl border border-gold/50 bg-gradient-to-br from-night-800 via-night-900 to-[#2a1640] p-5 shadow-[0_0_40px_rgba(232,180,90,0.10)] sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-xl flex-col gap-2">
            <span className="text-xs font-semibold tracking-[0.2em] text-gold/80 uppercase">🌕 {t("shop.heroTag")}</span>
            <h2 className="font-display text-3xl leading-tight font-black text-moon sm:text-4xl">{t("shop.heroTitle")}</h2>
            <p className="text-sm leading-relaxed text-white/75 sm:text-base">{t("shop.heroSub")}</p>
          </div>
          <div className="flex shrink-0 flex-row flex-wrap items-baseline gap-x-2 self-start rounded-lg border border-gold/40 bg-night-950/60 px-4 py-3 sm:flex-col sm:items-end sm:self-auto">
            <span className="text-xs text-white/60">{t("shop.heroFrom")}</span>
            <span className="text-3xl font-black text-gold">{price(shop?.price ?? ITEM_PRICE_VND)}</span>
            <span className="text-xs text-white/60">{t("shop.heroEach")}</span>
          </div>
        </div>
        <ul className="relative mt-5 grid gap-2 sm:grid-cols-3">
          {(["perkForever", "perkDevices", "perkBundle"] as const).map((k, i) => (
            <li key={k} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/85">
              <span className="text-lg">{["♾️", "☁️", "🎁"][i]}</span>
              {t(`shop.${k}`)}
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-col gap-3">
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
      </section>

      <nav
        className={`sticky top-0 z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-gold/20 bg-night-950/85 py-2 pr-4 backdrop-blur ${embedded ? "pl-4" : "pl-28 xl:pl-4"}`}
        aria-label={t("shop.title")}
      >
        <a href="#shop-role" className="shrink-0 rounded-full border border-gold/60 bg-gold/15 px-3 py-1 text-sm font-bold whitespace-nowrap text-gold hover:bg-gold/25">
          🃏 {t("shop.rolesTitle")}
        </a>
        {SECTIONS.map((s) => (
          <a
            key={s.kind}
            href={`#shop-${s.kind}`}
            className="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-sm whitespace-nowrap text-white/80 hover:border-gold/60 hover:text-gold"
          >
            {s.icon} {t(s.title)}
          </a>
        ))}
      </nav>

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
            <p className="-mt-1 text-sm text-white/65">{t(`shop.sectionDesc.${s.kind}`)}</p>
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
      <p className="-mt-2 text-sm text-white/65">{t("shop.sectionDesc.role")}</p>
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
        <ul className="grid gap-3 md:grid-cols-3">
          {BUNDLE_ITEMS.filter((id) => id !== "bundle:all").map((id) => (
            <BundleCard key={id} id={id} owned={owned} signedIn={signedIn} shop={shop} />
          ))}
          <BundleCard id="bundle:all" owned={owned} signedIn={signedIn} shop={shop} />
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

/** Accent per team, for the bundle cards. */
const TEAM_TINT: Record<"wolves" | "village" | "solo", { text: string; border: string; bg: string }> = {
  wolves: { text: "text-red-300", border: "border-red-400/40", bg: "bg-red-500/[0.05]" },
  village: { text: "text-sky-300", border: "border-sky-400/40", bg: "bg-sky-500/[0.05]" },
  solo: { text: "text-violet-300", border: "border-violet-400/40", bg: "bg-violet-500/[0.05]" },
};
const TEAM_ICON = { wolves: "🐺", village: "🏡", solo: "🎭" } as const;

/** One role in a bundle: emoji, name, and a one-line hook of what it does. */
function BundleRole({ role: r, have }: { role: RoleId; have: boolean }) {
  const t = useT();
  return (
    <li className={`flex items-start gap-2.5 py-1.5 ${have ? "opacity-50" : ""}`} title={t(`roles.${r}.desc`)}>
      <span className="w-6 shrink-0 text-center text-lg leading-tight">{ROLES[r].emoji}</span>
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold leading-tight">
          {t(`roles.${r}.name`)}
          {have && <span className="text-[11px] font-bold text-emerald-300">✓ {t("freeRoles.haveRole")}</span>}
        </span>
        <span className="text-xs leading-snug text-white/60">{t(`freeRoles.roleHook.${r}`)}</span>
      </span>
    </li>
  );
}

function BundleCard({ id, owned, signedIn, shop }: { id: ItemId; owned: string[]; signedIn: boolean; shop: ShopInfo | null }) {
  const t = useT();
  const price = usePrice();
  const itemName = useItemName();
  const [checkout, setCheckout] = useState(false);
  const name = id.slice(7) as BundleName;
  const roles = BUNDLES[name];
  const hero = name === "all";
  const cost = itemPrice(id, owned);
  const list = bundleListPrice(id, owned);
  const has = (r: RoleId) => owned.includes(`role:${r}`);
  const have = roles.filter(has).length;
  const missing = roles.length - have;
  const done = cost === 0;
  const title = itemName(id);
  const tint = hero ? null : TEAM_TINT[name as keyof typeof TEAM_TINT];
  const frame = done
    ? "border-emerald-500/40 bg-emerald-500/[0.04]"
    : hero
      ? "border-gold/60 bg-gold/[0.06] shadow-[0_0_24px_rgba(232,180,90,0.12)]"
      : `${tint!.border} ${tint!.bg}`;
  const teams = (["wolves", "village", "solo"] as const).map((team) => ({ team, roles: BUNDLES[team] }));

  return (
    <li className={`relative flex flex-col gap-3 rounded-lg border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,180,90,0.12)] ${frame} ${hero ? "md:col-span-3" : ""}`}>
      {hero && !done && (
        <span className="absolute -top-2.5 right-4 rounded-full border border-gold bg-gold px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-night-950 uppercase">
          ⭐ {t("freeRoles.bestValue")}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className={`text-lg font-bold ${hero ? "text-gold" : tint!.text}`}>
            {hero ? "👑" : TEAM_ICON[name as keyof typeof TEAM_ICON]} {title}
          </h4>
          <span className="text-xs text-white/50">{t("freeRoles.bundleCount", { count: roles.length })}</span>
        </div>
        <p className="text-sm leading-snug text-white/75">{t(`freeRoles.bundleTag.${name}`)}</p>
      </div>

      {hero ? (
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map(({ team, roles: rs }) => (
            <div key={team} className="flex flex-col">
              <span className={`border-b border-white/10 pb-1 text-[11px] font-semibold tracking-wider uppercase ${TEAM_TINT[team].text}`}>
                {TEAM_ICON[team]} {t(`teams.${team}`)} · {rs.length}
              </span>
              <ul className="flex flex-col">
                {rs.map((r) => (
                  <BundleRole key={r} role={r} have={has(r)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-white/5">
          {roles.map((r) => (
            <BundleRole key={r} role={r} have={has(r)} />
          ))}
        </ul>
      )}

      {have > 0 && !done && <p className="text-xs text-white/50">{t("freeRoles.bundleHave", { have, total: roles.length })}</p>}

      <div className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-3">
        {done ? (
          <span className="text-sm font-bold text-emerald-300">✓ {t("shop.owned")}</span>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <span className="flex flex-col">
                <span className="flex items-baseline gap-2">
                  <span className={`font-bold text-gold ${hero ? "text-2xl" : "text-xl"}`}>{price(cost)}</span>
                  <s className="text-sm text-white/40">{price(list)}</s>
                </span>
                <span className="text-xs text-white/55">{t("freeRoles.perCard", { price: price(Math.round(cost / missing / 100) * 100) })}</span>
              </span>
              <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-300">
                {t("freeRoles.save", { price: price(list - cost) })}
              </span>
            </div>
            {signedIn && shop?.enabled && (
              <button className="btn-gold btn-sm w-full" onClick={() => setCheckout(true)}>
                {t("shop.buyShort")} {title}
              </button>
            )}
            <span className="text-center text-[11px] text-white/45">{t("freeRoles.forever")}</span>
          </>
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
      className={`flex flex-col gap-2 rounded-lg border p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,180,90,0.12)] ${owned ? "bg-emerald-500/[0.04]" : "bg-white/[0.02]"}`}
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
            <span className="text-base font-black text-gold">{price(shop?.price ?? ITEM_PRICE_VND)}</span>
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
      className={`flex flex-col gap-2 rounded-lg border p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(232,180,90,0.12)] ${owned ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "border-white/10 bg-white/[0.03] hover:border-gold/50"}`}
    >
      <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md bg-[radial-gradient(ellipse_at_top,rgba(232,180,90,0.12),transparent_70%)] bg-night-900 p-3">
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
          <span className="text-base font-black text-gold">{cost}</span>
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
