"use client";

// Discount code management: create, pause, edit limits and delete codes.
// Only accounts whose Google email is in the server's ADMIN_EMAILS get in.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ITEM_PRICE_VND } from "@shared/cosmetics";
import { CODE_PATTERN, discountedPrice, normalizeCode } from "@shared/codes";
import {
  createCode,
  deleteCode,
  listCodes,
  refreshAccount,
  updateCode,
  useAccount,
  type AdminCode,
} from "@/lib/account";
import { useLocale, useT } from "@/lib/i18n";
import { LangSwitch, Spinner, toast, useErrorToast } from "@/components/ui";
import { usePrice } from "@/components/ProfileEditor";

/** yyyy-mm-dd in local time, for <input type="date">. */
const toDateInput = (t: number | null) => {
  if (!t) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** End of that day, local time. */
const fromDateInput = (s: string): number | null => (s ? new Date(`${s}T23:59:59`).getTime() : null);

export default function CodesPage() {
  const t = useT();
  const account = useAccount();
  const [ready, setReady] = useState(false);
  const [codes, setCodes] = useState<AdminCode[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    refreshAccount().finally(() => setReady(true));
  }, []);

  const signedIn = !!account;
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    listCodes().then((r) => {
      if (!alive) return;
      if (r.ok && r.codes) setCodes(r.codes);
      else setDenied(true);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 pt-16 pb-10">
      <LangSwitch />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/profile" className="btn-ghost btn-sm">
          ← {t("common.back")}
        </Link>
        <h1 className="font-display text-3xl font-black">🏷️ {t("codes.title")}</h1>
      </div>

      {!ready && !account ? (
        <Spinner />
      ) : !account ? (
        <p className="card text-white/70">{t("codes.signIn")}</p>
      ) : denied ? (
        <p className="card text-white/70">{t("codes.notAdmin")}</p>
      ) : !codes ? (
        <Spinner />
      ) : (
        <>
          <CreateForm onCreated={setCodes} />
          <CodeList codes={codes} onChange={setCodes} />
        </>
      )}
    </main>
  );
}

function CreateForm({ onCreated }: { onCreated: (codes: AdminCode[]) => void }) {
  const t = useT();
  const price = usePrice();
  const showError = useErrorToast();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("20");
  const [maxUses, setMaxUses] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const clean = normalizeCode(code);
  const n = Math.floor(Number(value));
  const valueOk = Number.isFinite(n) && n >= 1 && (kind === "percent" ? n <= 100 : n <= 10_000_000);
  const codeOk = CODE_PATTERN.test(clean);
  const after = valueOk ? discountedPrice(ITEM_PRICE_VND, { kind, value: n }) : null;

  /** A short random code to start from. */
  const suggest = () => {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    setCode(`MASOI-${Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join("")}`);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeOk || !valueOk) return;
    setBusy(true);
    const r = await createCode({
      code: clean,
      kind,
      value: n,
      maxUses: maxUses ? Math.floor(Number(maxUses)) : null,
      expiresAt: fromDateInput(expires),
      note,
    });
    setBusy(false);
    if (!showError(r) || !r.codes) return;
    onCreated(r.codes);
    toast(t("codes.created", { code: clean }), "info");
    setCode("");
    setNote("");
  }

  return (
    <form className="card flex flex-col gap-4 p-5" onSubmit={submit}>
      <h2 className="text-xl font-bold">{t("codes.new")}</h2>
      <div>
        <label className="ui-label" htmlFor="code-name">
          {t("codes.code")}
        </label>
        <div className="flex gap-2">
          <input
            id="code-name"
            className="ui-input min-w-0 flex-1 uppercase"
            value={code}
            maxLength={24}
            autoComplete="off"
            placeholder="TETMASOI"
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="button" className="btn-ghost" onClick={suggest}>
            🎲 {t("codes.random")}
          </button>
        </div>
        <p className={`mt-1 text-xs ${code && !codeOk ? "text-blood" : "text-white/40"}`}>{t("codes.codeHint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="ui-label">{t("codes.discount")}</span>
          <div className="flex gap-2">
            <select className="ui-select" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "amount")} aria-label={t("codes.kind")}>
              <option value="percent">%</option>
              <option value="amount">VND</option>
            </select>
            <input
              className="ui-input min-w-0 flex-1"
              type="number"
              inputMode="numeric"
              min={1}
              max={kind === "percent" ? 100 : undefined}
              step={kind === "percent" ? 1 : 1000}
              value={value}
              aria-label={t("codes.value")}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <p className="mt-1 text-xs text-white/50">
            {after === null ? t("codes.valueHint") : after === 0 ? t("codes.previewFree") : t("codes.preview", { price: price(after) })}
          </p>
        </div>
        <div>
          <label className="ui-label" htmlFor="code-uses">
            {t("codes.maxUses")}
          </label>
          <input
            id="code-uses"
            className="ui-input"
            type="number"
            inputMode="numeric"
            min={1}
            value={maxUses}
            placeholder={t("codes.unlimited")}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </div>
        <div>
          <label className="ui-label" htmlFor="code-expires">
            {t("codes.expires")}
          </label>
          <input id="code-expires" className="ui-input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          <p className="mt-1 text-xs text-white/40">{t("codes.expiresHint")}</p>
        </div>
        <div>
          <label className="ui-label" htmlFor="code-note">
            {t("codes.note")}
          </label>
          <input id="code-note" className="ui-input" value={note} maxLength={80} placeholder={t("codes.notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-white/50">{t("codes.onePerAccount")}</p>
      <button type="submit" className="btn-primary py-3" disabled={busy || !codeOk || !valueOk}>
        {t("codes.create")}
      </button>
    </form>
  );
}

function CodeList({ codes, onChange }: { codes: AdminCode[]; onChange: (codes: AdminCode[]) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const price = usePrice();
  const showError = useErrorToast();
  const [busy, setBusy] = useState<string | null>(null);
  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "vi-VN", { dateStyle: "medium" });

  async function run(code: string, op: () => Promise<{ ok: boolean; error?: string; codes?: AdminCode[] }>) {
    setBusy(code);
    const r = await op();
    setBusy(null);
    if (showError(r) && r.codes) onChange(r.codes);
  }

  const status = (c: AdminCode) => {
    if (!c.active) return { label: t("codes.paused"), cls: "text-white/50" };
    if (c.expiresAt !== null && Date.now() > c.expiresAt) return { label: t("codes.expired"), cls: "text-blood" };
    if (c.maxUses !== null && c.uses >= c.maxUses) return { label: t("codes.usedUp"), cls: "text-blood" };
    return { label: t("codes.active"), cls: "text-emerald-400" };
  };

  if (!codes.length) return <p className="card text-white/60">{t("codes.empty")}</p>;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{t("codes.list", { count: codes.length })}</h2>
      {codes.map((c) => {
        const s = status(c);
        return (
          <article key={c.code} className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-lg font-bold tracking-wider">{c.code}</span>
              <span className="chip">{c.kind === "percent" ? `-${c.value}%` : `-${price(c.value)}`}</span>
              <span className={`text-sm font-semibold ${s.cls}`}>● {s.label}</span>
              <button
                type="button"
                className="btn-ghost btn-sm ml-auto"
                title={t("codes.copy")}
                onClick={() => navigator.clipboard?.writeText(c.code).then(() => toast(t("codes.copied"), "info"))}
              >
                📋
              </button>
            </div>
            {c.note && <p className="text-sm text-white/60">{c.note}</p>}
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-white/40">{t("codes.uses")}</dt>
                <dd>
                  {c.uses}
                  {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-white/40">{t("codes.revenue")}</dt>
                <dd>{price(c.revenue)}</dd>
              </div>
              <div>
                <dt className="text-white/40">{t("codes.expires")}</dt>
                <dd>{c.expiresAt ? dateFmt.format(c.expiresAt) : t("codes.never")}</dd>
              </div>
              <div>
                <dt className="text-white/40">{t("codes.createdAt")}</dt>
                <dd>{dateFmt.format(c.createdAt)}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={busy === c.code}
                onClick={() => run(c.code, () => updateCode(c.code, { active: !c.active }))}
              >
                {c.active ? `⏸ ${t("codes.pause")}` : `▶ ${t("codes.resume")}`}
              </button>
              <label className="flex items-center gap-1 text-sm text-white/60">
                {t("codes.maxUses")}
                <input
                  className="ui-select w-20"
                  type="number"
                  min={1}
                  defaultValue={c.maxUses ?? ""}
                  placeholder="∞"
                  onBlur={(e) => {
                    const v = e.target.value ? Math.floor(Number(e.target.value)) : null;
                    if (v !== c.maxUses) run(c.code, () => updateCode(c.code, { maxUses: v }));
                  }}
                />
              </label>
              <label className="flex items-center gap-1 text-sm text-white/60">
                {t("codes.expires")}
                <input
                  className="ui-select"
                  type="date"
                  defaultValue={toDateInput(c.expiresAt)}
                  onBlur={(e) => {
                    const v = fromDateInput(e.target.value);
                    if (toDateInput(v) !== toDateInput(c.expiresAt)) run(c.code, () => updateCode(c.code, { expiresAt: v }));
                  }}
                />
              </label>
              <button
                type="button"
                className="btn-ghost btn-sm ml-auto text-blood"
                disabled={busy === c.code}
                onClick={() => {
                  if (window.confirm(t("codes.confirmDelete", { code: c.code }))) run(c.code, () => deleteCode(c.code));
                }}
              >
                🗑 {t("codes.delete")}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
