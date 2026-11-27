"use client";

// Signing in: with Google, or a quick account made from a login name and a
// password. The lobby (and so "Play now") waits behind it. A quick account can
// link Google later from the profile, and pressing a Google button while
// signed in to one links it straight away.

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoogleButton } from "@/components/ProfileEditor";
import { useErrorToast } from "@/components/ui";
import { GOOGLE_CLIENT_ID, PASSWORD_MIN, USERNAME_RE, passwordAuth, useAccount } from "@/lib/account";
import { useT } from "@/lib/i18n";

/** Log in to a quick account, or make one. */
function QuickAccountForm() {
  const t = useT();
  const showError = useErrorToast();
  const [kind, setKind] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const name = username.trim().toLowerCase();
  const nameOk = USERNAME_RE.test(name);
  const passOk = password.length >= PASSWORD_MIN;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "register" && !nameOk) return showError({ ok: false, error: "err.usernameInvalid" });
    if (kind === "register" && !passOk) return showError({ ok: false, error: "err.passwordWeak", params: { min: PASSWORD_MIN } });
    setBusy(true);
    showError(await passwordAuth(kind, name, password));
    setBusy(false);
  }

  const tab = (k: typeof kind, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === k}
      onClick={() => setKind(k)}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-bold transition ${
        kind === k ? "bg-gold text-night-950" : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="flex gap-1 rounded-lg border border-white/10 bg-night-950/50 p-1" role="tablist">
        {tab("register", t("auth.register"))}
        {tab("login", t("auth.login"))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="ui-label">{t("auth.username")}</span>
        <input
          className="ui-input"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("auth.usernamePlaceholder")}
        />
        {kind === "register" && <span className="text-[11px] text-white/50">{t("auth.usernameHint")}</span>}
      </label>
      <label className="flex flex-col gap-1">
        <span className="ui-label">{t("auth.password")}</span>
        <input
          className="ui-input"
          type="password"
          autoComplete={kind === "register" ? "new-password" : "current-password"}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.passwordPlaceholder", { min: PASSWORD_MIN })}
        />
      </label>
      <button className="btn-primary py-3 text-base" disabled={busy || !name || !password}>
        {busy ? "…" : kind === "register" ? t("auth.registerButton") : t("auth.loginButton")}
      </button>
    </form>
  );
}

/** Google first (when the server has it), then the quick account form. */
export function AuthPanel() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      {GOOGLE_CLIENT_ID && (
        <>
          <div className="flex flex-col items-center gap-2">
            <GoogleButton />
            <p className="text-center text-xs text-white/50">{t("auth.googleHint")}</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/40">
            <span className="h-px flex-1 bg-white/10" />
            {t("auth.or")}
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      )}
      <QuickAccountForm />
    </div>
  );
}

/** Shows the page only to a signed-in player; everyone else gets the sign-in card first. */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const t = useT();
  const account = useAccount();
  // The saved sign-in is read after the first render: wait for it instead of flashing the card.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (account) return <>{children}</>;
  if (!ready) return null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <Link href="/" className="btn-ghost btn-sm self-start" title={t("common.back")}>
        ← {t("common.back")}
      </Link>
      <section className="card flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h1 className="font-display text-2xl font-black text-moon">🔐 {t("auth.title")}</h1>
          <p className="mt-1 text-sm text-white/60">{t("auth.subtitle")}</p>
        </div>
        <AuthPanel />
      </section>
    </main>
  );
}

/** Profile: a quick account can link Google (sign in with it from then on, and keep the account on any device). */
export function LinkGoogle() {
  const t = useT();
  const account = useAccount();
  if (!account || account.user.hasGoogle || !GOOGLE_CLIENT_ID) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gold/40 bg-gold/5 p-3">
      <p className="text-sm font-bold text-gold">🔗 {t("auth.linkTitle")}</p>
      <p className="text-xs text-white/60">{t("auth.linkHint")}</p>
      <GoogleButton />
    </div>
  );
}
