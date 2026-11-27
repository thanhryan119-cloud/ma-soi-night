"use client";

import { useEffect, useRef, useState } from "react";
import { ROLES } from "@shared/roles";
import { CHAT_COLORS, type CardBg, type ChatDeco } from "@shared/cosmetics";
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
  const frame = p.style?.frame && p.style.frame !== "none" ? `af af-${p.style.frame}` : "";
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
/** The decorated box behind a player's avatar and name (profile card, editor preview). */
export function ProfileCard({
  bg = "plain",
  className = "",
  children,
}: {
  bg?: CardBg;
  className?: string;
  children?: React.ReactNode;
}) {
  return <div className={`profile-card pc-${bg} rounded-lg ${className}`}>{children}</div>;
}

/**
 * A player's profile card background laid behind a list row (online list,
 * leaderboard). The row needs `relative isolate`; nothing is drawn for the
 * plain card. It sits behind the row instead of wrapping it, so avatar frames
 * that reach past the row are not clipped.
 */
export function CardBackdrop({ card, className = "", style }: { card?: CardBg | null; className?: string; style?: React.CSSProperties }) {
  if (!card || card === "plain") return null;
  return <span aria-hidden className={`profile-card card-backdrop pc-${card} ${className}`} style={style} />;
}

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
  // data-text feeds the glitch effect, which redraws the name in slices.
  return (
    <span className={`${font} ${effect} ${className}`} data-text={p.name}>
      {p.name}
    </span>
  );
}

/** True on a computer-sized screen (1024 px and wider), where the game gets its desktop layout. */
export function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * Glides the element in whenever `key` changes (a new game phase), without
 * remounting it, so nothing inside loses its state. Skipped for people who
 * asked their device for reduced motion.
 */
export function usePhaseEnter<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { opacity: 0, transform: "translateY(12px) scale(0.985)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [key]);
  return ref;
}

/** A block that glides in when the game moves to a new phase (see usePhaseEnter). */
export function PhaseIn({ phaseKey, className = "", children }: { phaseKey: string; className?: string; children: React.ReactNode }) {
  const ref = usePhaseEnter<HTMLDivElement>(phaseKey);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** The key that changes with each new phase of the game. */
export const phaseKeyOf = (phase: { kind: string; night: number; day: number }) => `${phase.kind}-${phase.night}-${phase.day}`;

/**
 * A chat bubble in the writer's own colour (unique in the room) with their
 * chat decoration, if they bought one, laid over it.
 */
export function ChatBubble({
  color,
  deco = "plain",
  className = "",
  children,
}: {
  color: number;
  deco?: ChatDeco;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`chat-bubble cb-${deco} inline-block rounded-lg px-2 py-1 text-sm leading-snug break-words text-white ${className}`}
      style={{ "--cb": CHAT_COLORS[color % CHAT_COLORS.length] } as React.CSSProperties}
    >
      {children}
    </div>
  );
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
