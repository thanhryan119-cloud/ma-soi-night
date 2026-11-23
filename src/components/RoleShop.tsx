"use client";

// Premium roles (Cursed Wolf, Wolf Seer, Elder, Idiot): bought once per Google
// account through payOS, then usable in every room the buyer hosts or owns.

import { useEffect, useState } from "react";
import { ITEM_PRICE_VND } from "@shared/cosmetics";
import { PREMIUM_ROLES, ROLES, roleItem } from "@shared/roles";
import type { RoleId } from "@shared/types";
import { RoleBadge, toast } from "@/components/ui";
import { usePrice } from "@/components/ProfileEditor";
import { buyItem, fetchShop, useAccount, type ShopInfo } from "@/lib/account";
import { useT } from "@/lib/i18n";

function useShopInfo() {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  useEffect(() => {
    fetchShop().then(setShop);
  }, []);
  return shop;
}

/** Starts the payOS checkout for a role (the browser leaves for payOS on success). */
function useBuyRole() {
  const t = useT();
  const account = useAccount();
  const shop = useShopInfo();
  const [busy, setBusy] = useState<RoleId | null>(null);
  const buy = async (roleId: RoleId) => {
    if (!account) return toast(t("host.signInToUnlock"), "info");
    if (shop && !shop.enabled) return toast(t("shop.disabled"), "info");
    setBusy(roleId);
    const r = await buyItem(roleItem(roleId));
    if (!r.ok) {
      setBusy(null);
      toast(t(r.error ?? "err.paymentFailed"));
    }
  };
  return { buy, busy, shop, account };
}

/** "🔒 Unlock 50.000đ" next to a locked role in the role setup. */
export function RoleUnlockButton({ roleId }: { roleId: RoleId }) {
  const t = useT();
  const price = usePrice();
  const { buy, busy, shop } = useBuyRole();
  return (
    <button
      className="btn-sm shrink-0 rounded-lg border border-gold/50 bg-gold/10 px-2 text-xs font-bold text-gold hover:bg-gold/20 disabled:opacity-50"
      disabled={!!busy}
      onClick={() => buy(roleId)}
      title={t("host.premiumHint")}
    >
      {busy === roleId ? t("shop.redirecting") : `🔒 ${t("host.unlock", { price: price(shop?.price ?? ITEM_PRICE_VND) })}`}
    </button>
  );
}

/** The special roles section of the shop (profile page). */
export function RoleShopCard() {
  const t = useT();
  const price = usePrice();
  const { buy, busy, shop, account } = useBuyRole();
  const owned = account?.user.owned ?? [];
  const cost = price(shop?.price ?? ITEM_PRICE_VND);
  return (
    <section className="card flex flex-col gap-3" aria-label={t("shop.rolesTitle")}>
      <h2 className="text-lg font-bold">🃏 {t("shop.rolesTitle")}</h2>
      <p className="text-xs text-white/60">{t("shop.rolesHint")}</p>
      {!account && <p className="text-sm text-white/70">{t("shop.signInToBuy")}</p>}
      {shop && !shop.enabled && <p className="text-sm text-white/60">{t("shop.disabled")}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {PREMIUM_ROLES.map((r) => {
          const has = owned.includes(roleItem(r));
          return (
            <li
              key={r}
              className="flex flex-col gap-1.5 rounded-lg border bg-white/5 p-2.5"
              style={{ borderColor: `${ROLES[r].color}66` }}
            >
              <div className="flex items-center justify-between gap-2">
                <RoleBadge roleId={r} />
                {has ? (
                  <span className="text-xs font-bold text-emerald-300">✓ {t("shop.owned")}</span>
                ) : (
                  account &&
                  shop?.enabled && (
                    <button className="btn-gold btn-sm" disabled={!!busy} onClick={() => buy(r)}>
                      {busy === r ? t("shop.redirecting") : t("shop.buy", { price: cost })}
                    </button>
                  )
                )}
              </div>
              <p className="text-xs leading-snug text-white/70">{t(`roles.${r}.desc`)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
