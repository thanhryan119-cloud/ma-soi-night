"use client";

import { useEffect, useRef, useState } from "react";
import { AVATARS } from "@shared/engine";
import { AVATAR_FRAMES, DEFAULT_STYLE, NAME_EFFECTS, NAME_FONTS, type PlayerStyle } from "@shared/cosmetics";
import {
  GOOGLE_CLIENT_ID,
  signInWithGoogle,
  signOut,
  updateAccount,
  uploadAvatar,
  useAccount,
  type LocalProfile,
} from "@/lib/account";
import { useLocale, useT } from "@/lib/i18n";
import { Avatar, StyledName, toast, useErrorToast } from "./ui";

// ---------------------------------------------------------------------------
// Google Identity Services button
// ---------------------------------------------------------------------------

type GoogleId = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};

let gsiPromise: Promise<GoogleId> | null = null;
function loadGsi(): Promise<GoogleId> {
  gsiPromise ??= new Promise((resolve, reject) => {
    const w = window as unknown as { google?: GoogleId };
    if (w.google?.accounts) return resolve(w.google);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: GoogleId }).google);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return gsiPromise;
}

function GoogleButton() {
  const ref = useRef<HTMLDivElement>(null);
  const { locale } = useLocale();
  const showError = useErrorToast();
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !ref.current) return;
    let cancelled = false;
    loadGsi()
      .then((g) => {
        if (cancelled || !ref.current) return;
        g.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => showError(await signInWithGoogle(credential)),
        });
        ref.current.innerHTML = "";
        g.accounts.id.renderButton(ref.current, {
          theme: "filled_black",
          size: "large",
          shape: "rectangular",
          text: "signin_with",
          locale,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locale]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className="min-h-11" />;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function Picker<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => React.ReactNode;
}) {
  return (
    <div>
      <span className="ui-label">{label}</span>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={o === value}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm transition ${
              o === value ? "border-white bg-white/10" : "border-white/10 hover:border-white/30"
            }`}
          >
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Name, avatar (emoji or uploaded photo), name font/effect and avatar frame.
 * Works for guests (saved on this device) and signed-in players (saved to the account).
 */
export function ProfileEditor({
  value,
  onChange,
  compact = false,
}: {
  value: LocalProfile;
  onChange: (p: LocalProfile) => void;
  compact?: boolean;
}) {
  const t = useT();
  const account = useAccount();
  const showError = useErrorToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const user = account?.user ?? null;
  const [open, setOpen] = useState(!compact);

  // When the player signs in, adopt the account's name and style once.
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (user && adopted.current !== user.id) {
      adopted.current = user.id;
      const accountIsDefault = JSON.stringify(user.style) === JSON.stringify(DEFAULT_STYLE);
      const localIsDefault = JSON.stringify(value.style) === JSON.stringify(DEFAULT_STYLE);
      if (accountIsDefault && !localIsDefault) {
        // First sign-in: keep what the player picked as a guest and save it to the account.
        updateAccount({ style: value.style });
        onChange({ ...value, name: value.name || user.name });
      } else onChange({ ...value, name: value.name || user.name, style: user.style });
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStyle = (patch: Partial<PlayerStyle>) => {
    const style = { ...value.style, ...patch };
    onChange({ ...value, style });
    if (user) updateAccount({ style });
  };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    showError(await uploadAvatar(file));
    setUploading(false);
  }

  const preview = {
    name: value.name || t("player.namePlaceholder"),
    avatar: value.avatar,
    avatarUrl: user?.avatarUrl ?? null,
    style: value.style,
    alive: true,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-night-900 p-4">
        <Avatar p={preview} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="ui-label">{t("profile.preview")}</div>
          <StyledName p={preview} className="block truncate text-3xl font-black" />
        </div>
      </div>

      <div>
        <label className="ui-label" htmlFor="profile-name">
          {t("profile.name")}
        </label>
        <input
          id="profile-name"
          className="ui-input"
          value={value.name}
          maxLength={24}
          autoComplete="nickname"
          placeholder={t("player.namePlaceholder")}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          onBlur={() => user && value.name.trim() && updateAccount({ name: value.name })}
        />
      </div>

      {compact && (
        <button type="button" className="btn-ghost w-full" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "▴" : "▾"} {t("profile.customize")}
        </button>
      )}

      {open && (
        <>
          <div>
            <span className="ui-label">{t("profile.photo")}</span>
            {user ? (
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                <button type="button" className="btn-ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  📷 {uploading ? t("profile.uploading") : user.avatarUrl ? t("profile.changePhoto") : t("profile.uploadPhoto")}
                </button>
                {user.avatarUrl && (
                  <button type="button" className="btn-ghost" onClick={async () => showError(await updateAccount({ removePhoto: true }))}>
                    {t("profile.removePhoto")}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/50">{t("profile.photoNeedsLogin")}</p>
            )}
          </div>

          {!user?.avatarUrl && (
            <div>
              <span className="ui-label">{t("profile.emoji")}</span>
              <div className="grid grid-cols-8 gap-1.5">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onChange({ ...value, avatar: a })}
                    className={`aspect-square rounded-md text-2xl transition ${
                      a === value.avatar ? "bg-white/15 ring-2 ring-white" : "bg-white/5 hover:bg-white/10"
                    }`}
                    aria-pressed={a === value.avatar}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Picker
            label={t("profile.nameFont")}
            options={NAME_FONTS}
            value={value.style.font}
            onChange={(font) => setStyle({ font })}
            render={(f) => (
              <span className="flex flex-col items-center">
                <StyledName p={{ name: "Ma Sói", style: { ...value.style, font: f, effect: "none" } }} className="text-lg" />
                <span className="text-[10px] text-white/50">{t(`profile.font.${f}`)}</span>
              </span>
            )}
          />
          <Picker
            label={t("profile.nameEffect")}
            options={NAME_EFFECTS}
            value={value.style.effect}
            onChange={(effect) => setStyle({ effect })}
            render={(e) => (
              <span className="flex flex-col items-center">
                <StyledName p={{ name: "Ma Sói", style: { ...value.style, effect: e } }} className="text-lg font-bold" />
                <span className="text-[10px] text-white/50">{t(`profile.effect.${e}`)}</span>
              </span>
            )}
          />
          <Picker
            label={t("profile.avatarFrame")}
            options={AVATAR_FRAMES}
            value={value.style.frame}
            onChange={(frame) => setStyle({ frame })}
            render={(f) => (
              <>
                <Avatar p={{ ...preview, style: { ...value.style, frame: f } }} size="sm" />
                <span className="text-xs">{t(`profile.frame.${f}`)}</span>
              </>
            )}
          />
        </>
      )}

      <div className="rounded-lg border border-white/10 p-4">
        <span className="ui-label">{t("profile.account")}</span>
        {user ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">{t("profile.signedInAs", { name: user.name })}</span>
            <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => signOut().then(() => toast(t("profile.signOut"), "info"))}>
              {t("profile.signOut")}
            </button>
          </div>
        ) : GOOGLE_CLIENT_ID ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-white/60">{t("profile.signInHint")}</p>
            <GoogleButton />
          </div>
        ) : (
          <p className="text-sm text-white/50">{t("profile.authUnavailable")}</p>
        )}
      </div>
    </div>
  );
}
