"use client";

// Premium roles (Cursed Wolf, Wolf Seer, Elder, Idiot): bought once per Google
// account, then usable in every room the buyer hosts or owns. Buying opens the
// shared checkout dialog, where a discount code can be entered first.

import { useState } from "react";
import { ITEM_PRICE_VND } from "@shared/cosmetics";
import { PREMIUM_ROLES, ROLES, roleItem } from "@shared/roles";
import type { RoleId } from "@shared/types";
import { RoleBadge, toast } from "@/components/ui";
import { CheckoutDialog, usePrice, useShopInfo } from "@/components/Checkout";
import { useAccount } from "@/lib/account";
import { useT } from "@/lib/i18n";

/** Which role's checkout is open, and the dialog for it. */
function useRoleCheckout() {
  const t = useT();
  const account = useAccount();
  const [open, setOpen] = useState<RoleId | null>(null);
  const start = (roleId: RoleId) => {
    if (!account) return toast(t("host.signInToUnlock"), "info");
    setOpen(roleId);
  };
  const dialog = open && (
    <CheckoutDialog
      itemId={roleItem(open)}
      title={t("shop.unlockRole", { role: t(`roles.${open}.name`) })}
      itemName={t(`roles.${open}.name`)}
      onClose={() => setOpen(null)}
    />
  );
  return { start, dialog, account };
}

/** "🔒 Unlock 50.000đ" next to a locked role in the role setup. */
export function RoleUnlockButton({ roleId }: { roleId: RoleId }) {
  const t = useT();
  const price = usePrice();
  const shop = useShopInfo();
  const { start, dialog } = useRoleCheckout();
  return (
    <>
      <button
        className="btn-sm shrink-0 rounded-lg border border-gold/50 bg-gold/10 px-2 text-xs font-bold text-gold hover:bg-gold/20 disabled:opacity-50"
        onClick={() => start(roleId)}
        title={t("host.premiumHint")}
      >
        🔒 {t("host.unlock", { price: price(shop?.price ?? ITEM_PRICE_VND) })}
      </button>
      {dialog}
    </>
  );
}

/** The special roles section of the shop (profile page). */
export function RoleShopCard() {
  const t = useT();
  const price = usePrice();
  const shop = useShopInfo();
  const { start, dialog, account } = useRoleCheckout();
  const owned = account?.user.owned ?? [];
  const cost = price(shop?.price ?? ITEM_PRICE_VND);
  return (
    <section className="card flex flex-col gap-3" aria-label={t("shop.rolesTitle")}>
      <h2 className="text-lg font-bold">🃏 {t("shop.rolesTitle")}</h2>
      <p className="text-xs text-white/60">{t("shop.rolesHint")}</p>
      {!account && <p className="text-sm text-white/70">{t("shop.signInToBuy")}</p>}
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
                <RoleBadge roleId={r} tip={false} />
                {has ? (
                  <span className="text-xs font-bold text-emerald-300">✓ {t("shop.owned")}</span>
                ) : (
                  account && (
                    <button className="btn-gold btn-sm" onClick={() => start(r)}>
                      {t("shop.buy", { price: cost })}
                    </button>
                  )
                )}
              </div>
              <p className="text-xs leading-snug text-white/70">{t(`roles.${r}.desc`)}</p>
            </li>
          );
        })}
      </ul>
      {dialog}
    </section>
  );
}
