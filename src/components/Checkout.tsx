"use client";

// One checkout box for everything the shop sells (fonts, effects, frames,
// roles): price, a discount code field that is always visible, and the buy
// button. Inline on the profile page, or as a dialog (CheckoutDialog).

import { useEffect, useState } from "react";
import { ITEM_PRICE_VND, type ItemId } from "@shared/cosmetics";
import { buyItem, checkCode, fetchShop, useAccount, type CodeCheck, type ShopInfo } from "@/lib/account";
import { useLocale, useT } from "@/lib/i18n";
import { toast, useErrorToast } from "./ui";

/** "50.000đ" / "50,000 VND" */
export function usePrice() {
  const t = useT();
  const { locale } = useLocale();
  return (vnd: number) => t("shop.price", { price: new Intl.NumberFormat(locale === "en" ? "en-US" : "vi-VN").format(vnd) });
}

export function useShopInfo() {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  useEffect(() => {
    fetchShop().then(setShop);
  }, []);
  return shop;
}

export function CheckoutPanel({
  itemId,
  title,
  itemName,
  onCancel,
}: {
  itemId: ItemId;
  /** Heading, e.g. "Trying on: Glow" or the role's name. */
  title: string;
  /** Used in the "unlocked" message. */
  itemName: string;
  onCancel: () => void;
}) {
  const t = useT();
  const price = usePrice();
  const showError = useErrorToast();
  const account = useAccount();
  const shop = useShopInfo();
  const user = account?.user ?? null;
  const [busy, setBusy] = useState(false);
  const [codeText, setCodeText] = useState("");
  const [checking, setChecking] = useState(false);
  const [applied, setApplied] = useState<CodeCheck | null>(null);

  // Another item: start over.
  useEffect(() => {
    setApplied(null);
    setBusy(false);
  }, [itemId]);

  const listPrice = shop?.price ?? ITEM_PRICE_VND;
  const free = !!applied && applied.amount === 0;
  const cost = price(applied ? applied.amount : listPrice);

  async function apply() {
    if (!codeText.trim()) return;
    setChecking(true);
    const r = await checkCode(codeText);
    setChecking(false);
    if (showError(r) && r.code && r.kind && r.value !== undefined && r.amount !== undefined)
      setApplied({ code: r.code, kind: r.kind, value: r.value, amount: r.amount });
  }

  async function buy() {
    setBusy(true);
    const r = await buyItem(itemId, applied?.code);
    if (!showError(r)) return setBusy(false);
    // Free with a code: unlocked already. Otherwise the page is leaving for the payment page.
    if (r.free) {
      setBusy(false);
      toast(t("shop.paid", { item: itemName }), "info");
      onCancel();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gold/40 bg-gold/[0.06] p-4" role="region" aria-label={t("shop.title")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-bold">{title}</span>
        <span className="flex items-baseline gap-2">
          {applied && <s className="text-sm text-white/40">{price(listPrice)}</s>}
          <span className="font-bold text-gold">{free ? t("shop.free") : cost}</span>
        </span>
      </div>

      {!user ? (
        <p className="text-sm text-white/70">{t("shop.signInToBuy")}</p>
      ) : (
        <>
          <div>
            <label className="ui-label" htmlFor={`code-${itemId}`}>
              {t("shop.codeLabel")}
            </label>
            {applied ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="chip">🏷️ {applied.code}</span>
                <span className="text-white/70">
                  {applied.kind === "percent" ? t("shop.codePercent", { value: applied.value }) : t("shop.codeAmount", { value: price(applied.value) })}
                </span>
                <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setApplied(null)}>
                  {t("shop.codeRemove")}
                </button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  apply();
                }}
              >
                <input
                  id={`code-${itemId}`}
                  className="ui-select min-w-0 flex-1 py-2 text-base uppercase"
                  value={codeText}
                  maxLength={24}
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder={t("shop.codePlaceholder")}
                  onChange={(e) => setCodeText(e.target.value)}
                />
                <button type="submit" className="btn-ghost btn-sm" disabled={checking || !codeText.trim()}>
                  {checking ? "…" : t("shop.codeApply")}
                </button>
              </form>
            )}
          </div>
          {shop && !shop.enabled && !free ? (
            <p className="text-sm text-white/60">{t("shop.disabled")}</p>
          ) : (
            <p className="text-xs text-white/50">{t("shop.hint")}</p>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {user && (shop?.enabled || free) && (
          <button type="button" className="btn-primary flex-1" disabled={busy} onClick={buy}>
            {busy ? t("shop.redirecting") : free ? t("shop.claimFree") : t("shop.buy", { price: cost })}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t("shop.cancel")}
        </button>
      </div>
    </div>
  );
}

/** The same checkout box over the page (role unlocks from the profile and the host lobby). */
export function CheckoutDialog({
  itemId,
  title,
  itemName,
  onClose,
}: {
  itemId: ItemId;
  title: string;
  itemName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="page-enter fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="rise w-full max-w-md rounded-t-2xl bg-night-950 p-3 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <CheckoutPanel itemId={itemId} title={title} itemName={itemName} onCancel={onClose} />
      </div>
    </div>
  );
}
