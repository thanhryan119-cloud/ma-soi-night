"use client";

// Landing-page hero: the cards dealt out into a fan, the sun card back in the
// middle. Cards sit dimmed in the dark and light up when hovered.

import type { RoleId } from "@shared/types";
import { CardBack, NarratorCard, RoleArt } from "./Tarot";

type Slot = RoleId | "narrator" | "back";
const SPREAD: Slot[] = ["villager", "seer", "witch", "werewolf", "back", "hunter", "bodyguard", "cupid", "narrator"];

export function TarotSpread({ className = "" }: { className?: string }) {
  const mid = (SPREAD.length - 1) / 2;
  return (
    <div className={`relative mx-auto h-[170px] w-full max-w-3xl sm:h-[290px] ${className}`}>
      {SPREAD.map((slot, i) => {
        const off = i - mid;
        return (
          <div
            key={slot}
            className="tarot-spread-card absolute bottom-0 left-1/2 w-[70px] sm:w-[124px]"
            style={
              {
                "--rot": `${off * 8}deg`,
                "--dx": `${off * 42}%`,
                "--dy": `${off * off * 2.4}px`,
                zIndex: 10 - Math.abs(off),
                animationDelay: `${i * 80}ms`,
              } as React.CSSProperties
            }
          >
            {slot === "narrator" ? (
              <NarratorCard className="w-full" />
            ) : slot === "back" ? (
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
