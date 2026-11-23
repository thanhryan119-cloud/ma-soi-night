"use client";

import { useEffect, useRef, useState } from "react";
import { AVATARS } from "@shared/engine";
import {
  AVATAR_FRAMES,
  CHAT_DECOS,
  DEFAULT_STYLE,
  ITEM_PRICE_VND,
  NAME_EFFECTS,
  NAME_FONTS,
  equip,
  isFreeItem,
  itemId,
  limitStyle,
  sameStyle,
  type ItemId,
  type ItemKind,
  type PlayerStyle,
} from "@shared/cosmetics";
import {
  GOOGLE_CLIENT_ID,
  fetchShop,
  type ShopInfo,
  signInWithGoogle,
  signOut,
  updateAccount,
  uploadAvatar,
  useAccount,
  type LocalProfile,
} from "@/lib/account";
import { useLocale, useT } from "@/lib/i18n";
import { Avatar, ChatBubble, StyledName, toast, useErrorToast } from "./ui";
import { CheckoutPanel, usePrice } from "./Checkout";

export { usePrice };
import { AvatarArt } from "./art/Woodcut";

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

export function GoogleButton() {
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
  trying,
  locked,
  price,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  /** A paid option being previewed (not bought yet). */
  trying: T | null;
  locked: (v: T) => boolean;
  price: string;
  onChange: (v: T) => void;
  render: (v: T) => React.ReactNode;
}) {
  const t = useT();
  return (
    <div>
      <span className="ui-label">{label}</span>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {options.map((o) => {
          const isLocked = locked(o);
          const selected = trying ? o === trying : o === value;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              aria-pressed={selected}
              title={isLocked ? t("shop.lockedItem", { price }) : undefined}
              className={`relative flex min-h-12 items-center justify-center gap-2 rounded-md border px-2 pt-3.5 pb-2 text-sm transition ${
                selected
                  ? isLocked
                    ? "border-dashed border-gold bg-gold/10"
                    : "border-gold bg-gold/10"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              {render(o)}
              {isLocked && (
                <span className="absolute top-0.5 right-1 rounded bg-black/60 px-1 text-[9px] leading-4 text-gold">
                  🔒 {price}
                </span>
              )}
            </button>
          );
        })}
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
  const owned = user?.owned ?? [];
  const [open, setOpen] = useState(!compact);
  const [trying, setTrying] = useState<ItemId | null>(null);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const price = usePrice();
  useEffect(() => {
    fetchShop().then(setShop);
  }, []);

  // When the player signs in, adopt the account's name and style once; after
  // that, follow the account whenever its style changes (a purchase equips the
  // item, another device). Paid items the player does not own are taken off.
  const adopted = useRef<string | null>(null);
  const accountStyle = useRef<PlayerStyle | null>(null);
  useEffect(() => {
    const own = user?.owned ?? [];
    const local = limitStyle(value.style, own);
    const lastSeen = accountStyle.current;
    accountStyle.current = user?.style ?? null;
    if (user && adopted.current === user.id && lastSeen && !sameStyle(lastSeen, user.style)) {
      if (!sameStyle(user.style, value.style)) onChange({ ...value, style: user.style });
    } else if (user && adopted.current !== user.id) {
      adopted.current = user.id;
      const accountIsDefault = sameStyle(user.style, DEFAULT_STYLE);
      if (accountIsDefault && !sameStyle(local, DEFAULT_STYLE)) {
        // First sign-in: keep what the player picked as a guest and save it to the account.
        updateAccount({ style: local });
        onChange({ ...value, name: value.name || user.name, style: local });
      } else onChange({ ...value, name: value.name || user.name, style: user.style });
    } else if (!sameStyle(local, value.style)) onChange({ ...value, style: local });
    if (trying && own.includes(trying)) setTrying(null);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLocked = (kind: ItemKind, v: string) => {
    const id = itemId(kind, v);
    return !isFreeItem(id) && !owned.includes(id);
  };

  /** Owned or free: wear it. Paid: preview it with a buy button. */
  const pick = (kind: ItemKind, v: string) => {
    if (isLocked(kind, v)) {
      setTrying(itemId(kind, v));
      return;
    }
    setTrying(null);
    const style = { ...value.style, [kind]: v } as PlayerStyle;
    onChange({ ...value, style });
    if (user) updateAccount({ style });
  };
  const [tryKind, tryValue] = trying ? (trying.split(":") as [ItemKind, string]) : [null, null];
  const shown = trying ? equip(value.style, trying) : value.style;
  const priceLabel = price(shop?.price ?? ITEM_PRICE_VND);

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
    style: shown,
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

      {trying && (
        <CheckoutPanel
          itemId={trying}
          title={t("shop.trying", { item: t(`profile.${tryKind}.${tryValue}`) })}
          itemName={t(`profile.${tryKind}.${tryValue}`)}
          onCancel={() => setTrying(null)}
        />
      )}

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
                    className={`aspect-square overflow-hidden rounded-full p-0.5 transition ${
                      a === value.avatar ? "bg-white/15 ring-2 ring-white" : "bg-white/5 hover:bg-white/10"
                    }`}
                    aria-pressed={a === value.avatar}
                  >
                    <AvatarArt emoji={a} className="h-full w-full" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <Picker
            label={t("profile.nameFont")}
            options={NAME_FONTS}
            value={value.style.font}
            trying={tryKind === "font" ? (tryValue as PlayerStyle["font"]) : null}
            locked={(v) => isLocked("font", v)}
            price={priceLabel}
            onChange={(font) => pick("font", font)}
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
            trying={tryKind === "effect" ? (tryValue as PlayerStyle["effect"]) : null}
            locked={(v) => isLocked("effect", v)}
            price={priceLabel}
            onChange={(effect) => pick("effect", effect)}
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
            trying={tryKind === "frame" ? (tryValue as PlayerStyle["frame"]) : null}
            locked={(v) => isLocked("frame", v)}
            price={priceLabel}
            onChange={(frame) => pick("frame", frame)}
            render={(f) => (
              <>
                <Avatar p={{ ...preview, style: { ...value.style, frame: f } }} size="sm" />
                <span className="text-xs">{t(`profile.frame.${f}`)}</span>
              </>
            )}
          />
          <Picker
            label={t("profile.chatDeco")}
            options={CHAT_DECOS}
            value={value.style.chat}
            trying={tryKind === "chat" ? (tryValue as PlayerStyle["chat"]) : null}
            locked={(v) => isLocked("chat", v)}
            price={priceLabel}
            onChange={(chat) => pick("chat", chat)}
            render={(c) => (
              <span className="flex flex-col items-center gap-1">
                <ChatBubble color={1} deco={c}>
                  {t("profile.chatSample")}
                </ChatBubble>
                <span className="text-[10px] text-white/50">{t(`profile.chat.${c}`)}</span>
              </span>
            )}
          />
          <p className="-mt-2 text-xs text-white/50">{t("profile.chatColorHint")}</p>
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
