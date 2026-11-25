"use client";

// The roles dealt in this game and how many of each, as a thin bar that can be
// folded away. Hovering (or tapping) a role shows what it does.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ROLES, ROLE_IDS } from "@shared/roles";
import type { RoleId } from "@shared/types";
import type { ClientState } from "@shared/views";
import { useT } from "@/lib/i18n";
import { storage } from "@/lib/socket";

const OPEN_KEY = "msn:rolesBarOpen";
const TIP_W = 272;

interface Tip {
  role: RoleId;
  left: number;
  top: number;
  above: boolean;
}

export function RolesInPlay({
  state,
  className = "",
}: {
  state: ClientState;
  className?: string;
}) {
  const t = useT();
  const counts = state.settings.roleCounts;
  const roles = ROLE_IDS.filter((r) => (counts[r] ?? 0) > 0);
  const total = roles.reduce((n, r) => n + counts[r], 0);
  const [open, setOpen] = useState(true);
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => setOpen(storage.get<boolean>(OPEN_KEY) ?? true), []);
  // A tapped role's info goes away on the next tap anywhere or on scroll.
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [tip]);

  if (!total) return null;

  const toggle = () => {
    setOpen((o) => {
      storage.set(OPEN_KEY, !o);
      return !o;
    });
    setTip(null);
  };

  const show = (role: RoleId, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const half = Math.min(TIP_W, vw - 16) / 2;
    const above = r.bottom + 180 > window.innerHeight && r.top > 200;
    setTip({
      role,
      left: Math.max(half + 8, Math.min(vw - half - 8, r.left + r.width / 2)),
      top: above ? r.top - 8 : r.bottom + 8,
      above,
    });
  };
  const hide = (role: RoleId) =>
    setTip((cur) => (cur?.role === role ? null : cur));

  return (
    <section
      className={`rounded-lg border border-white/10 bg-night-900/60 ${className}`}
      aria-label={t("rolesBar.title")}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="font-bold text-moon">🃏 {t("rolesBar.title")}</span>
        <span className="text-white/50">
          {t("rolesBar.count", { count: total })}
        </span>
        <span className="ml-auto text-white/50">
          {open ? `▴ ${t("rolesBar.hide")}` : `▾ ${t("rolesBar.show")}`}
        </span>
      </button>
      {open && (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-2">
          {roles.map((r) => (
            <li key={r}>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white/90 transition-colors ${
                  tip?.role === r
                    ? "border-gold/60 bg-gold/10"
                    : "border-white/15 bg-white/[0.03] hover:border-gold/40"
                }`}
                onMouseEnter={(e) => show(r, e.currentTarget)}
                onMouseLeave={() => hide(r)}
                onFocus={(e) => show(r, e.currentTarget)}
                onBlur={() => hide(r)}
                onClick={(e) =>
                  tip?.role === r ? setTip(null) : show(r, e.currentTarget)
                }
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: ROLES[r].color }}
                  aria-hidden
                />
                <span aria-hidden>{ROLES[r].emoji}</span>
                {t(`roles.${r}.name`)}
                <b className="font-mono text-gold">×{counts[r]}</b>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tip &&
        createPortal(
          <div
            role="tooltip"
            className="tarot-tip pointer-events-none fixed z-[95] flex flex-col gap-1.5 rounded-lg border bg-night-800 p-3.5 text-left"
            style={{
              left: tip.left,
              top: tip.top,
              width: TIP_W,
              maxWidth: "calc(100vw - 16px)",
              borderColor: `${ROLES[tip.role].color}99`,
              translate: tip.above ? "0 -100%" : undefined,
            }}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xl leading-none">
                {ROLES[tip.role].emoji}
              </span>
              <span className="font-display text-xl font-black text-moon">
                {t(`roles.${tip.role}.name`)}
              </span>
              <span className="ml-auto font-mono text-sm text-gold">
                ×{counts[tip.role]}
              </span>
            </div>
            <span className="text-[11px] font-semibold tracking-[0.18em] text-gold uppercase">
              {t(`teams.${ROLES[tip.role].team}`)}
            </span>
            <p className="text-sm leading-snug text-white/80">
              {t(`roles.${tip.role}.desc`)}
            </p>
          </div>,
          document.body,
        )}
    </section>
  );
}
