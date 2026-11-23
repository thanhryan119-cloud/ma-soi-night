"use client";

// Landing-page hero: every role card dealt out into a fan, the sun card
// back in the middle. Cards sit dimmed in the dark and light up when hovered.

import type { RoleId } from "@shared/types";
import { CardBack, RoleArt } from "./Tarot";

type Slot = RoleId | "back";
const SPREAD: Slot[] = [
  "villager",
  "seer",
  "witch",
  "bodyguard",
  "hunter",
  "werewolf",
  "back",
  "cursedWolf",
  "wolfSeer",
  "cupid",
  "elder",
  "idiot",
];

export function TarotSpread({ className = "" }: { className?: string }) {
  const mid = (SPREAD.length - 1) / 2;
  return (
    <div className={`relative mx-auto h-[170px] w-full max-w-4xl sm:h-[300px] ${className}`}>
      {SPREAD.map((slot, i) => {
        const off = i - mid;
        return (
          <div
            key={slot}
            className="tarot-spread-card absolute bottom-0 left-1/2 w-[56px] sm:w-[120px]"
            style={
              {
                "--off": off,
                zIndex: Math.round(20 - 2 * Math.abs(off)),
                animationDelay: `${i * 60}ms`,
              } as React.CSSProperties
            }
          >
            {slot === "back" ? (
              <CardBack className="w-full" />
            ) : (
              <RoleArt role={slot} className="w-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}
