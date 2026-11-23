"use client";

// Landing-page hero: every role card dealt out into a fan. Cards sit dimmed
// in the dark and light up when hovered.

import { ROLE_IDS } from "@shared/roles";
import type { RoleId } from "@shared/types";
import { CardBack, RoleArt } from "./Tarot";

type Slot = RoleId | "back";

/** Left to right, with the Werewolf in the middle. */
const ORDER: RoleId[] = ["villager", "seer", "witch", "bodyguard", "hunter", "werewolf", "cursedWolf", "wolfSeer", "cupid", "elder", "idiot"];

/**
 * Every role (a new one not in ORDER joins at the end). With an odd count one
 * card sits in the middle; with an even count the sun card back goes in the
 * middle so the fan stays balanced.
 */
const ROLES_IN_FAN: RoleId[] = [...ORDER.filter((r) => ROLE_IDS.includes(r)), ...ROLE_IDS.filter((r) => !ORDER.includes(r))];
const SPREAD: Slot[] =
  ROLES_IN_FAN.length % 2
    ? ROLES_IN_FAN
    : [...ROLES_IN_FAN.slice(0, ROLES_IN_FAN.length / 2), "back", ...ROLES_IN_FAN.slice(ROLES_IN_FAN.length / 2)];

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
