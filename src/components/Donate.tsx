"use client";

import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n";

/** The header button that leads to the donate page. */
export function DonateLink() {
  const t = useT();
  return (
    <Link href="/donate" className="btn-ghost btn-sm border-gold/50 text-gold" title={t("donate.open")}>
      💝 <span className="sr-only">{t("donate.open")}</span>
    </Link>
  );
}

/** "50.000đ" / "50,000 VND" */
export function useVnd() {
  const t = useT();
  const { locale } = useLocale();
  return (vnd: number) => t("donate.price", { price: new Intl.NumberFormat(locale === "en" ? "en-US" : "vi-VN").format(vnd) });
}
