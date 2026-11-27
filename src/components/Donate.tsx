"use client";

// "Buy the dev a coffee": the owner's own VietQR code (public/donate-qr.png),
// shown in a window or on /donate. No payment goes through the game: players
// scan it with their banking app. Donations unlock nothing.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "./ui";

/** The account behind the QR image, for people who type the transfer in by hand. */
const DONATE_BANK = "Techcombank";
const DONATE_ACCOUNT = "7816555555";
const DONATE_HOLDER = "NGUYEN TUAN THANH";
const QR_SRC = "/donate-qr.png";

const grouped = (n: string) => n.replace(/^(\d{4})(\d{4})(\d+)$/, "$1 $2 $3");

/** The card itself: the ask, the QR, a download button and a kind line. */
export function DonateCard({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const copy = () =>
    navigator.clipboard?.writeText(DONATE_ACCOUNT).then(
      () => toast(t("donate.copied"), "info"),
      () => {},
    );
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="max-w-xs text-lg leading-snug font-semibold text-white/90">{t("donate.title")}</p>
      <div className="w-full max-w-[260px] rounded-3xl border-4 border-pink-300/90 bg-white p-3 shadow-[0_0_32px_rgba(249,168,212,0.25)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={QR_SRC} alt={t("donate.qrAlt")} width={630} height={760} className="h-auto w-full" />
      </div>
      <div className="flex flex-col items-center gap-0.5 text-sm">
        <span className="font-bold tracking-wide text-white/90">{DONATE_HOLDER}</span>
        <button type="button" onClick={copy} className="font-mono text-white/70 hover:text-gold" title={t("donate.copy")}>
          {DONATE_BANK} · {grouped(DONATE_ACCOUNT)} ⧉
        </button>
      </div>
      <a href={QR_SRC} download="ma-soi-qr.png" className="btn-ghost btn-sm px-4">
        ⬇ {t("donate.download")}
      </a>
      <p className="max-w-xs text-sm text-white/55">{t("donate.spread")}</p>
      {onDone && (
        <button type="button" className="btn-ghost w-full max-w-[220px] py-3 text-base font-bold" onClick={onDone}>
          {t("donate.done")}
        </button>
      )}
    </div>
  );
}

/** The card in a window over the page. */
export function DonateDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
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
      aria-label={t("donate.open")}
    >
      <div className="rise max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-night-900 p-6 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <DonateCard onDone={onClose} />
      </div>
    </div>
  );
}

/** Opens the coffee window; `children` is the button's face. */
function DonateTrigger({ className, title, children }: { className: string; title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} title={title} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <DonateDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** The small header button. */
export function DonateLink() {
  const t = useT();
  return (
    <DonateTrigger className="btn-ghost btn-sm border-pink-300/50 text-pink-200" title={t("donate.open")}>
      ☕ <span className="sr-only">{t("donate.open")}</span>
    </DonateTrigger>
  );
}

/** The wide button on the home page, under Play now. */
export function DonateButton({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <DonateTrigger className={`btn-ghost border-pink-300/50 py-3 text-base text-pink-200 ${className}`}>
      ☕ {t("donate.button")}
    </DonateTrigger>
  );
}
