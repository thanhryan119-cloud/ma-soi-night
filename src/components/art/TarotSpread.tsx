"use client";

// Landing-page hero: role cards floating in the dark. Which roles show is
// random; every few seconds one card turns over into another role, so the
// whole deck shows up over time. Hovering a card lights it up and shows what
// the role does; clicking it draws a different role in its place.

import { useEffect, useRef, useState } from "react";
import { ROLES, ROLE_IDS } from "@shared/roles";
import type { RoleId } from "@shared/types";
import { useT } from "@/lib/i18n";
import { CardBack, RoleArt } from "./Tarot";

/**
 * Where each card floats: x (% of the width, card centre), y (px down from the
 * top, scaled on phones), tilt, size, and its own bob timing. Phones show only
 * the slots marked `phone` (the outer ones would not fit).
 */
const SLOTS = [
  { x: 50, y: 0, rot: -3, scale: 1.18, dur: 6.4, z: 10, phone: true },
  { x: 33, y: 30, rot: -11, scale: 1, dur: 7.2, z: 8, phone: true },
  { x: 67, y: 28, rot: 11, scale: 1, dur: 6.8, z: 8, phone: true },
  { x: 17, y: 66, rot: -18, scale: 0.9, dur: 7.8, z: 7, phone: true },
  { x: 83, y: 62, rot: 17, scale: 0.9, dur: 7.5, z: 7, phone: true },
  { x: 4, y: 112, rot: -25, scale: 0.76, dur: 8.4, z: 5, phone: false },
  { x: 96, y: 108, rot: 24, scale: 0.76, dur: 8.1, z: 5, phone: false },
  { x: 41, y: 136, rot: 8, scale: 0.72, dur: 8.2, z: 4, phone: true },
  { x: 59, y: 142, rot: -9, scale: 0.72, dur: 8.6, z: 4, phone: true },
  { x: 25, y: 168, rot: -5, scale: 0.64, dur: 9.1, z: 3, phone: false },
  { x: 75, y: 164, rot: 6, scale: 0.64, dur: 8.9, z: 3, phone: false },
] as const;

/** How often one card turns over into another role. */
const SWAP_MS = 3200;

const shuffle = <T,>(xs: readonly T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** A role that is not on the table right now (or any role, if all are). */
const drawUnseen = (cur: readonly (RoleId | null)[], except?: RoleId | null) => {
  const unseen = ROLE_IDS.filter((r) => !cur.includes(r));
  const pool = unseen.length ? unseen : ROLE_IDS.filter((r) => r !== except);
  return pool[Math.floor(Math.random() * pool.length)];
};

/** Where the info panel sits, in px inside the spread. */
interface Tip {
  slot: number;
  left: number;
  top: number;
}

const TIP_W = 272;

export function TarotSpread({ className = "" }: { className?: string }) {
  const t = useT();
  // The server renders card backs; the faces are dealt at random once on the client.
  const [faces, setFaces] = useState<(RoleId | null)[]>(() => SLOTS.map(() => null));
  const [tip, setTip] = useState<Tip | null>(null);
  const last = useRef(-1);
  const hovered = useRef(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFaces(shuffle(ROLE_IDS).slice(0, SLOTS.length));
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setFaces((cur) => {
        // Never the same slot twice in a row, so the change is easy to notice,
        // and never the card someone is reading.
        let slot = Math.floor(Math.random() * cur.length);
        if (slot === last.current) slot = (slot + 1) % cur.length;
        if (slot === hovered.current) slot = (slot + 1) % cur.length;
        last.current = slot;
        const next = [...cur];
        next[slot] = drawUnseen(cur, cur[slot]);
        return next;
      });
    }, SWAP_MS);
    return () => clearInterval(timer);
  }, []);

  /** Shows the info panel under a card, kept inside the spread's width. */
  const show = (slot: number, el: HTMLElement) => {
    const outer = box.current?.getBoundingClientRect();
    if (!outer) return;
    const r = el.getBoundingClientRect();
    const half = Math.min(TIP_W, outer.width) / 2;
    const centre = r.left + r.width / 2 - outer.left;
    hovered.current = slot;
    setTip({
      slot,
      left: Math.max(half, Math.min(outer.width - half, centre)),
      top: r.bottom - outer.top + 8,
    });
  };
  const hide = (slot: number) => {
    if (hovered.current === slot) hovered.current = -1;
    setTip((cur) => (cur?.slot === slot ? null : cur));
  };

  /** Clicking a card draws another role in its place. */
  const redraw = (slot: number) =>
    setFaces((cur) => {
      const next = [...cur];
      next[slot] = drawUnseen(cur, cur[slot]);
      return next;
    });

  const tipRole = tip ? faces[tip.slot] : null;

  return (
    <div ref={box} className={`tarot-float relative mx-auto h-[250px] w-full max-w-4xl sm:h-[360px] ${className}`}>
      {SLOTS.map((s, i) => {
        const role = faces[i];
        return (
          <div
            key={i}
            className={`tarot-float-slot absolute top-0 ${s.phone ? "" : "hidden sm:block"}`}
            style={
              {
                left: `${s.x}%`,
                "--y": `${s.y}px`,
                "--rot": `${s.rot}deg`,
                "--scale": s.scale,
                zIndex: tip?.slot === i ? 30 : s.z,
                animationDelay: `${i * 90}ms`,
              } as React.CSSProperties
            }
          >
            <div className="tarot-float-bob" style={{ animationDuration: `${s.dur}s`, animationDelay: `${-i * 1.3}s` }}>
              <button
                type="button"
                className="tarot-float-hit block cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-gold"
                aria-label={role ? `${t(`roles.${role}.name`)}. ${t("home.cardRedraw")}` : undefined}
                disabled={!role}
                onMouseEnter={(e) => show(i, e.currentTarget)}
                onMouseLeave={() => hide(i)}
                onFocus={(e) => show(i, e.currentTarget)}
                onBlur={() => hide(i)}
                onClick={() => redraw(i)}
              >
                <div key={role ?? "back"} className="tarot-float-card w-[78px] sm:w-[118px]">
                  {role ? <RoleArt role={role} className="w-full" /> : <CardBack className="w-full" />}
                </div>
              </button>
            </div>
          </div>
        );
      })}

      {tip && tipRole && (
        <div
          role="tooltip"
          className="tarot-tip card pointer-events-none absolute z-40 flex flex-col gap-1.5 p-3.5 text-left"
          style={{ left: tip.left, top: tip.top, width: TIP_W, maxWidth: "100%", borderColor: `${ROLES[tipRole].color}99` }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-xl leading-none">{ROLES[tipRole].emoji}</span>
            <span className="font-display text-xl font-black text-moon">{t(`roles.${tipRole}.name`)}</span>
          </div>
          <span className="text-[11px] font-semibold tracking-[0.18em] text-gold uppercase">
            {t(`teams.${ROLES[tipRole].team}`)}
          </span>
          <p className="text-sm leading-snug text-white/80">{t(`roles.${tipRole}.desc`)}</p>
          <span className="mt-0.5 text-[11px] text-gold/70">✦ {t("home.cardRedraw")}</span>
        </div>
      )}
    </div>
  );
}
