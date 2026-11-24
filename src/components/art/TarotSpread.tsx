"use client";

// Landing-page hero: a handful of role cards floating in the dark. Which roles
// show is random; every few seconds one card turns over into another role, so
// the whole deck shows up over time. Cards light up when hovered.

import { useEffect, useRef, useState } from "react";
import { ROLE_IDS } from "@shared/roles";
import type { RoleId } from "@shared/types";
import { CardBack, RoleArt } from "./Tarot";

/**
 * Where each card floats: x (% of the width, card centre), y (px down from the
 * top, scaled on phones), tilt, size, and its own bob timing. The first five
 * are the ones phones show.
 */
const SLOTS = [
  { x: 50, y: 0, rot: -3, scale: 1.18, dur: 6.4, z: 10 },
  { x: 30, y: 34, rot: -13, scale: 1, dur: 7.2, z: 8 },
  { x: 70, y: 30, rot: 12, scale: 1, dur: 6.8, z: 8 },
  { x: 12, y: 80, rot: -20, scale: 0.86, dur: 7.8, z: 6 },
  { x: 88, y: 76, rot: 19, scale: 0.86, dur: 7.5, z: 6 },
  { x: 41, y: 128, rot: 9, scale: 0.72, dur: 8.2, z: 4 },
  { x: 60, y: 132, rot: -10, scale: 0.72, dur: 8.6, z: 4 },
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

export function TarotSpread({ className = "" }: { className?: string }) {
  // The server renders card backs; the faces are dealt at random once on the client.
  const [faces, setFaces] = useState<(RoleId | null)[]>(() => SLOTS.map(() => null));
  const last = useRef(-1);

  useEffect(() => {
    setFaces(shuffle(ROLE_IDS).slice(0, SLOTS.length));
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setFaces((cur) => {
        const unseen = ROLE_IDS.filter((r) => !cur.includes(r));
        if (!unseen.length) return cur;
        // Never the same slot twice in a row, so the change is easy to notice.
        let slot = Math.floor(Math.random() * cur.length);
        if (slot === last.current) slot = (slot + 1) % cur.length;
        last.current = slot;
        const next = [...cur];
        next[slot] = unseen[Math.floor(Math.random() * unseen.length)];
        return next;
      });
    }, SWAP_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`tarot-float relative mx-auto h-[230px] w-full max-w-4xl sm:h-[330px] ${className}`}>
      {SLOTS.map((s, i) => {
        const role = faces[i];
        return (
          <div
            key={i}
            className={`tarot-float-slot absolute top-0 ${i >= 5 ? "hidden sm:block" : ""}`}
            style={
              {
                left: `${s.x}%`,
                "--y": `${s.y}px`,
                "--rot": `${s.rot}deg`,
                "--scale": s.scale,
                zIndex: s.z,
                animationDelay: `${i * 90}ms`,
              } as React.CSSProperties
            }
          >
            <div className="tarot-float-bob" style={{ animationDuration: `${s.dur}s`, animationDelay: `${-i * 1.3}s` }}>
              <div key={role ?? "back"} className="tarot-float-card w-[78px] sm:w-[118px]">
                {role ? <RoleArt role={role} className="w-full" /> : <CardBack className="w-full" />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
