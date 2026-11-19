"use client";

// Landing-page hero: the role cards fanned out like a tarot spread.

import type { RoleId } from "@shared/types";
import { CardBack, RoleArt } from "./Tarot";

const SPREAD: RoleId[] = ["villager", "seer", "witch", "werewolf", "hunter", "bodyguard", "cupid"];

export function TarotSpread({ className = "" }: { className?: string }) {
  const mid = (SPREAD.length - 1) / 2;
  return (
    <div className={`tarot-spread relative mx-auto h-[190px] w-full max-w-3xl sm:h-[290px] ${className}`}>
      {/* A face-down deck peeking behind the fan */}
      <div className="absolute bottom-0 left-1/2 w-[86px] -translate-x-1/2 translate-y-[-14px] sm:w-[130px]" style={{ zIndex: 0 }}>
        <CardBack className="w-full opacity-70 drop-shadow-[0_8px_18px_rgba(0,0,0,0.7)]" />
      </div>
      {SPREAD.map((role, i) => {
        const off = i - mid;
        return (
          <div
            key={role}
            className="tarot-spread-card absolute bottom-0 left-1/2 w-[86px] sm:w-[130px]"
            style={
              {
                "--rot": `${off * 9}deg`,
                "--dx": `${off * 46}%`,
                "--dy": `${Math.abs(off) * Math.abs(off) * 3}px`,
                zIndex: 10 - Math.abs(Math.round(off)),
                animationDelay: `${i * 90}ms`,
              } as React.CSSProperties
            }
          >
            <RoleArt role={role} className="w-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.75)]" />
          </div>
        );
      })}
    </div>
  );
}
