"use client";

// What a role does, in a small card beside it: shown on hover or focus, and
// toggled by a tap on phones. Used by the roles bar and the role collection.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ROLES } from "@shared/roles";
import type { RoleId } from "@shared/types";
import { useT } from "@/lib/i18n";
import { RoleArt } from "@/components/art/Tarot";

const TIP_W = 272;

interface Tip {
  role: RoleId;
  left: number;
  top: number;
  above: boolean;
}

/**
 * `bind(role)` gives the handlers to spread on the element a role sits in,
 * `active(role)` tells whether its card is open, and `tip` is the card itself
 * (render it anywhere: it goes to the page body).
 * `extra(role)` adds a note at the top right of the card, like "×2".
 */
export function useRoleTip(extra?: (role: RoleId) => React.ReactNode) {
  const t = useT();
  const [tip, setTip] = useState<Tip | null>(null);

  // A tapped role's card goes away on scroll or resize.
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

  const show = (role: RoleId, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const half = Math.min(TIP_W, vw - 16) / 2;
    const above = r.bottom + 240 > window.innerHeight && r.top > 260;
    setTip({
      role,
      left: Math.max(half + 8, Math.min(vw - half - 8, r.left + r.width / 2)),
      top: above ? r.top - 8 : r.bottom + 8,
      above,
    });
  };
  const hide = (role: RoleId) => setTip((cur) => (cur?.role === role ? null : cur));

  const bind = (role: RoleId) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(role, e.currentTarget),
    onMouseLeave: () => hide(role),
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(role, e.currentTarget),
    onBlur: () => hide(role),
    onClick: (e: React.MouseEvent<HTMLElement>) => (tip?.role === role ? setTip(null) : show(role, e.currentTarget)),
  });

  const node =
    tip &&
    typeof document !== "undefined" &&
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
        <div className="flex gap-3">
          <RoleArt role={tip.role} className="h-24 w-auto shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-xl font-black text-moon">{t(`roles.${tip.role}.name`)}</span>
              {extra && <span className="ml-auto font-mono text-sm text-gold">{extra(tip.role)}</span>}
            </div>
            <span className="text-[11px] font-semibold tracking-[0.18em] text-gold uppercase">{t(`teams.${ROLES[tip.role].team}`)}</span>
          </div>
        </div>
        <p className="text-sm leading-snug text-white/80">{t(`roles.${tip.role}.desc`)}</p>
      </div>,
      document.body,
    );

  return { bind, active: (role: RoleId) => tip?.role === role, close: () => setTip(null), tip: node };
}
