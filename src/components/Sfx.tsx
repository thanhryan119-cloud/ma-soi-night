"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { play, setSfxEnabled, unlockSfx, useSfxEnabled, type SfxName } from "@/lib/sfx";

const CLICKABLE = 'button, a[href], [role="button"], [role="tab"], select, summary, input[type="checkbox"], input[type="radio"]';

/**
 * Mounted once in the layout: unlocks audio on the first tap and gives every
 * button a click. An element (or an ancestor) can pick another sound with
 * `data-sfx="vote"`, or none with `data-sfx="none"`.
 */
export function SfxHost() {
  useEffect(() => {
    const unlock = () => unlockSfx();
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(CLICKABLE);
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
      const name = el.closest("[data-sfx]")?.getAttribute("data-sfx");
      if (name === "none") return;
      play((name as SfxName) || "click");
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("click", onClick, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock, opts);
      window.removeEventListener("keydown", unlock, opts);
      window.removeEventListener("click", onClick, opts);
    };
  }, []);
  return null;
}

/** 🔔 / 🔕 button that mutes or unmutes the game's sound effects on this device. */
export function SfxToggle({ className = "btn-ghost btn-sm px-2", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const t = useT();
  const on = useSfxEnabled();
  const label = on ? t("sfx.mute") : t("sfx.unmute");
  return (
    <button
      type="button"
      data-sfx="none"
      className={className}
      onClick={() => setSfxEnabled(!on)}
      aria-pressed={on}
      title={label}
      aria-label={label}
    >
      {on ? "🔔" : "🔕"}
      {withLabel && <span> {t("sfx.label")}</span>}
    </button>
  );
}
