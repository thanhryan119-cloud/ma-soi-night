"use client";

import { useEffect, useState } from "react";
import { ROLES } from "@shared/roles";
import type { Locale, RoleId, TimerState } from "@shared/types";
import type { PlayerView } from "@shared/views";
import { useLocale, useT } from "@/lib/i18n";
import { useNow } from "@/lib/useRoom";
import { resolveAvatarUrl } from "@/lib/account";
import { AvatarArt, hasAvatarArt } from "@/components/art/Woodcut";

// ---------------------------------------------------------------------------
// Language switch — always visible in a corner
// ---------------------------------------------------------------------------

export function LangSwitch({
  onChange,
  className = "fixed top-3 left-3 z-50",
}: {
  onChange?: (l: Locale) => void;
  className?: string;
}) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <div
      className={`${className} flex overflow-hidden rounded-md border border-white/15 bg-night-900 text-xs font-bold`}
      role="group"
      aria-label={t("lang.label")}
    >
      {(["vi", "en"] as Locale[]).map((l) => (
        <button
          key={l}
          type="button"
          title={t(`lang.${l}`)}
          onClick={() => {
            setLocale(l);
            onChange?.(l);
          }}
          className={`px-3 py-2 transition ${locale === l ? "bg-gold text-night-950" : "text-white/70 hover:text-white"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastMsg = { id: number; text: string; tone: "error" | "info" };
let pushToast: ((m: Omit<ToastMsg, "id">) => void) | null = null;

export function toast(text: string, tone: ToastMsg["tone"] = "error") {
  pushToast?.({ text, tone });
}

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    let id = 0;
    pushToast = (m) => {
      const item = { ...m, id: ++id };
      setItems((xs) => [...xs.slice(-2), item]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== item.id)), 3500);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((m) => (
        <div
          key={m.id}
          role="status"
          className={`rise max-w-md rounded-xl px-4 py-3 text-center text-sm font-semibold ${
            m.tone === "error" ? "bg-blood text-white" : "bg-gold text-night-950"
          }`}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}

/** Shows a translated error toast for a failed action result. */
export function useErrorToast() {
  const t = useT();
  return (res: { ok: boolean; error?: string; params?: Record<string, string | number> }) => {
    if (!res.ok && res.error) {
      let text = res.error;
      const params = { ...(res.params ?? {}) };
      // Role ids (e.g. "this role is locked") are shown by name.
      if (typeof params.role === "string") {
        try {
          params.role = t(`roles.${params.role}.name`);
        } catch {}
      }
      try {
        text = t(res.error, params);
      } catch {}
      toast(text);
    }
    return res.ok;
  };
}

// ---------------------------------------------------------------------------
// Players & roles
// ---------------------------------------------------------------------------

type AvatarLike = Pick<PlayerView, "avatar" | "alive"> & Partial<Pick<PlayerView, "avatarUrl" | "style">>;

/** Emoji or photo avatar with the player's chosen frame. */
export function Avatar({ p, size = "md" }: { p: AvatarLike; size?: "sm" | "md" | "lg" | "xl" }) {
  const cls = { sm: "h-7 w-7 text-base", md: "h-10 w-10 text-2xl", lg: "h-14 w-14 text-3xl", xl: "h-24 w-24 text-6xl" }[size];
  const photo = resolveAvatarUrl(p.avatarUrl);
  const frame = p.style?.frame && p.style.frame !== "none" ? `af-${p.style.frame}` : "";
  return (
    <span className={`${cls} ${frame} relative inline-flex shrink-0 items-center justify-center rounded-full bg-night-700`}>
      <span
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full ${
          p.alive ? "" : "grayscale opacity-50"
        }`}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" draggable={false} />
        ) : hasAvatarArt(p.avatar) ? (
          <AvatarArt emoji={p.avatar} className="h-full w-full" />
        ) : (
          p.avatar
        )}
      </span>
      {!p.alive && <span className="absolute -right-1 -bottom-1 z-[3] text-[0.6em]">💀</span>}
    </span>
  );
}

/** A player name rendered with their chosen font and effect. */
export function StyledName({
  p,
  className = "",
}: {
  p: Pick<PlayerView, "name"> & Partial<Pick<PlayerView, "style" | "alive">>;
  className?: string;
}) {
  const s = p.style;
  const font = s && s.font !== "default" ? `nf-${s.font}` : "";
  const effect = s && s.effect !== "none" && p.alive !== false ? `ne-${s.effect}` : "";
  return <span className={`${font} ${effect} ${className}`}>{p.name}</span>;
}

export function RoleBadge({ roleId, size = "sm" }: { roleId: RoleId; size?: "sm" | "md" }) {
  const t = useT();
  const def = ROLES[roleId];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/[0.03] font-semibold whitespace-nowrap text-white/90 ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: def.color }} aria-hidden />
      <span aria-hidden>{def.emoji}</span>
      {t(`roles.${roleId}.name`)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export function remainingMs(timer: TimerState, offset: number, now: number) {
  if (timer.running && timer.endsAt) return Math.max(0, timer.endsAt - (now + offset));
  return timer.remainingMs;
}

export function fmtClock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function TimerDisplay({
  timer,
  offset,
  className = "text-5xl",
}: {
  timer: TimerState;
  offset: number;
  className?: string;
}) {
  const now = useNow(250);
  if (!timer.durationMs) return null;
  const ms = remainingMs(timer, offset, now);
  const pct = timer.durationMs ? (ms / timer.durationMs) * 100 : 0;
  const low = ms <= 10_000;
  return (
    <div className="w-full">
      <div
        className={`${className} text-center font-display font-bold tabular-nums ${low ? "text-blood-light flicker" : "text-moon"}`}
        aria-live="off"
      >
        {fmtClock(ms)}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-[width] duration-300 ${low ? "bg-blood" : "bg-gold"}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function ConnectionDot({ connected }: { connected: boolean }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/60">
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "animate-pulse bg-blood-light"}`} />
      {connected ? t("common.connected") : t("common.reconnecting")}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-white/60">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-gold" />
      {label && <p>{label}</p>}
    </div>
  );
}
