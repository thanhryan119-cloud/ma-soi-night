"use client";

// The roles dealt in this game and how many of each, as a thin bar that can be
// folded away. Hovering (or tapping) a role shows what it does.

import { useEffect, useState } from "react";
import { ROLES, ROLE_IDS } from "@shared/roles";
import type { ClientState } from "@shared/views";
import { useT } from "@/lib/i18n";
import { storage } from "@/lib/socket";
import { useRoleTip } from "./RoleTip";

const OPEN_KEY = "msn:rolesBarOpen";

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
  const tips = useRoleTip((r) => `×${counts[r]}`);

  useEffect(() => setOpen(storage.get<boolean>(OPEN_KEY) ?? true), []);

  if (!total) return null;

  const toggle = () => {
    setOpen((o) => {
      storage.set(OPEN_KEY, !o);
      return !o;
    });
    tips.close();
  };

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
                  tips.active(r)
                    ? "border-gold/60 bg-gold/10"
                    : "border-white/15 bg-white/[0.03] hover:border-gold/40"
                }`}
                {...tips.bind(r)}
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
      {tips.tip}
    </section>
  );
}
