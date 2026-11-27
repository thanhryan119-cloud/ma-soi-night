"use client";

// Donations. The game is free and every role and cosmetic is open to all; a
// donation only helps pay for the servers. The transfer is shown right here
// like payOS's own checkout: a VietQR code, the account, the amount and the
// transfer note, with the status checked every few seconds.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BANK_BY_BIN } from "@shared/donate";
import { GlobalChat } from "@/components/GlobalChat";
import { useVnd } from "@/components/Donate";
import { LangSwitch, toast, useErrorToast } from "@/components/ui";
import { checkDonation, fetchDonateInfo, startDonation, type DonateInfo, type DonationView } from "@/lib/account";
import { useEmbedded } from "@/lib/embed";
import { useT } from "@/lib/i18n";

/** How often an open transfer asks whether the money has landed. */
const POLL_MS = 3000;

export default function DonatePage() {
  const t = useT();
  const embedded = useEmbedded();
  const [info, setInfo] = useState<DonateInfo | null | undefined>(undefined);
  const [donation, setDonation] = useState<DonationView | null>(null);

  const load = () => fetchDonateInfo().then(setInfo);
  useEffect(() => {
    load();
  }, []);

  // Back from payOS's own page with ?order=<code>: show how it went.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderCode = parseInt(params.get("order") ?? params.get("orderCode") ?? "", 10);
    if (!orderCode) return;
    window.history.replaceState(null, "", window.location.pathname);
    checkDonation(orderCode).then((r) => r.ok && r.donation && setDonation(r.donation));
  }, []);

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
        <h1 className="font-display text-3xl font-black">💝 {t("donate.title")}</h1>
      </div>

      <section className="card flex flex-col gap-2">
        <p className="text-white/85">{t("donate.intro")}</p>
        <p className="text-sm text-emerald-300">✓ {t("donate.allFree")}</p>
        <p className="text-xs text-white/50">{t("donate.noReward")}</p>
      </section>

      {donation ? (
        <Transfer
          donation={donation}
          onUpdate={(d) => {
            setDonation(d);
            if (d.status === "paid") load();
          }}
          onDone={() => setDonation(null)}
        />
      ) : info === undefined ? (
        <p className="text-center text-white/50">{t("donate.loading")}</p>
      ) : !info || !info.enabled ? (
        <p className="card text-center text-white/70">{t("donate.off")}</p>
      ) : (
        <DonateForm info={info} onStart={setDonation} />
      )}

      {!!info?.recent.length && <Supporters recent={info.recent} />}
    </main>
  );
}

function DonateForm({ info, onStart }: { info: DonateInfo; onStart: (d: DonationView) => void }) {
  const t = useT();
  const vnd = useVnd();
  const showError = useErrorToast();
  const [amount, setAmount] = useState<number>(info.presets[1] ?? info.min);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const typed = custom ? parseInt(custom.replace(/\D/g, ""), 10) || 0 : null;
  const value = typed ?? amount;
  const valid = value >= info.min && value <= info.max;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const r = await startDonation(value, name, message);
    setBusy(false);
    if (showError(r) && r.donation) onStart(r.donation);
  }

  return (
    <form className="card flex flex-col gap-4" onSubmit={submit}>
      <div>
        <span className="ui-label">{t("donate.amount")}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {info.presets.map((p) => {
            const selected = typed === null && amount === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setAmount(p);
                  setCustom("");
                }}
                className={`rounded-md border px-2 py-2.5 text-sm font-bold transition ${selected ? "border-gold bg-gold/10 text-gold" : "border-white/10 hover:border-white/30"}`}
              >
                {vnd(p)}
              </button>
            );
          })}
          <input
            className={`ui-select min-w-0 py-2 text-center text-sm ${typed !== null ? "border-gold" : ""}`}
            inputMode="numeric"
            placeholder={t("donate.other")}
            aria-label={t("donate.other")}
            value={custom ? new Intl.NumberFormat("vi-VN").format(typed ?? 0) : ""}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        </div>
        {typed !== null && !valid && <p className="mt-1 text-xs text-blood-light">{t("donate.range", { min: vnd(info.min), max: vnd(info.max) })}</p>}
      </div>

      <div>
        <label className="ui-label" htmlFor="donor-name">
          {t("donate.name")}
        </label>
        <input id="donor-name" className="ui-input" maxLength={32} value={name} placeholder={t("donate.namePlaceholder")} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="ui-label" htmlFor="donor-message">
          {t("donate.message")}
        </label>
        <textarea
          id="donor-message"
          className="ui-input min-h-20 resize-y"
          maxLength={200}
          value={message}
          placeholder={t("donate.messagePlaceholder")}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <button type="submit" className="btn-gold w-full py-3" disabled={busy || !valid}>
        {busy ? t("donate.creating") : `💝 ${t("donate.button", { price: vnd(value) })}`}
      </button>
    </form>
  );
}

/** The open transfer: QR, account and note, checked until it lands or expires. */
function Transfer({ donation, onUpdate, onDone }: { donation: DonationView; onUpdate: (d: DonationView) => void; onDone: () => void }) {
  const t = useT();
  const vnd = useVnd();
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(onUpdate);
  latest.current = onUpdate;
  const pending = donation.status === "pending";

  useEffect(() => {
    if (!pending) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    let alive = true;
    const poll = setInterval(async () => {
      const r = await checkDonation(donation.orderCode);
      if (alive && r.ok && r.donation && r.donation.status !== "pending") latest.current(r.donation);
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [pending, donation.orderCode]);

  if (donation.status === "paid")
    return (
      <section className="card flex flex-col items-center gap-3 text-center">
        <div className="text-5xl">🎉</div>
        <h2 className="text-xl font-bold text-gold">{t("donate.thanks")}</h2>
        <p className="text-white/80">{t("donate.thanksBody", { price: vnd(donation.amount) })}</p>
        <button type="button" className="btn-ghost" onClick={onDone}>
          {t("donate.again")}
        </button>
      </section>
    );

  const left = Math.max(0, donation.expiresAt - now);
  if (!pending || left === 0)
    return (
      <section className="card flex flex-col items-center gap-3 text-center">
        <p className="text-white/80">{donation.status === "cancelled" ? t("donate.cancelled") : t("donate.expired")}</p>
        <button type="button" className="btn-gold" onClick={onDone}>
          {t("donate.again")}
        </button>
      </section>
    );

  const mm = Math.floor(left / 60_000);
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  const bank = donation.bin ? (BANK_BY_BIN[donation.bin] ?? donation.bin) : null;

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{t("donate.scan")}</h2>
        <span className="font-mono text-sm text-white/60" title={t("donate.expiresIn")}>
          ⏱ {mm}:{ss}
        </span>
      </div>

      {donation.qrCode ? (
        <div className="mx-auto rounded-2xl bg-white p-3 shadow-lg">
          <QRCodeSVG value={donation.qrCode} size={232} level="M" marginSize={0} aria-label={t("donate.qrLabel")} />
        </div>
      ) : (
        <p className="text-center text-sm text-white/60">{t("donate.noQr")}</p>
      )}
      <p className="text-center text-xs text-white/50">{t("donate.scanHint")}</p>

      <dl className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 text-sm">
        {bank && <Row label={t("donate.bank")} value={bank} />}
        {donation.accountName && <Row label={t("donate.accountName")} value={donation.accountName} />}
        {donation.accountNumber && <Row label={t("donate.accountNumber")} value={donation.accountNumber} copy />}
        <Row label={t("donate.amount")} value={vnd(donation.amount)} copy={String(donation.amount)} strong />
        {donation.description && <Row label={t("donate.note")} value={donation.description} copy />}
      </dl>
      <p className="text-xs text-amber-200/80">⚠ {t("donate.noteWarning")}</p>

      <p className="flex items-center justify-center gap-2 text-sm text-white/70" role="status">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gold" />
        {t("donate.waiting")}
      </p>

      <div className="flex flex-wrap gap-2">
        {donation.checkoutUrl && (
          <a href={donation.checkoutUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost flex-1 text-center">
            {t("donate.openPayos")}
          </a>
        )}
        <button type="button" className="btn-ghost" onClick={onDone}>
          {t("donate.cancel")}
        </button>
      </div>
    </section>
  );
}

function Row({ label, value, copy, strong }: { label: string; value: string; copy?: boolean | string; strong?: boolean }) {
  const t = useT();
  const text = typeof copy === "string" ? copy : value;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/55">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <span className={`truncate ${strong ? "font-bold text-gold" : "font-semibold"}`}>{value}</span>
        {copy && (
          <button
            type="button"
            className="btn-ghost btn-sm px-2 py-0.5 text-xs"
            onClick={() =>
              navigator.clipboard?.writeText(text).then(
                () => toast(t("donate.copied"), "info"),
                () => {},
              )
            }
          >
            {t("donate.copy")}
          </button>
        )}
      </dd>
    </div>
  );
}

function Supporters({ recent }: { recent: DonateInfo["recent"] }) {
  const t = useT();
  const vnd = useVnd();
  return (
    <section className="card flex flex-col gap-2">
      <h2 className="font-bold">🌟 {t("donate.supporters")}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {recent.map((d, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">{d.name || t("donate.anonymous")}</span>
            <span className="shrink-0 text-gold">{vnd(d.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
