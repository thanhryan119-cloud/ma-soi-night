"use client";

// Profile (or sign-in), donations and collection from inside a room. They open in a
// window over the game, so the player never leaves the room; the window closes
// by itself when the game starts, or when the game moves on while you are alive.

import { useEffect, useRef, useState } from "react";
import type { ClientState } from "@shared/views";
import { GoogleButton } from "@/components/ProfileEditor";
import { GOOGLE_CLIENT_ID, useAccount } from "@/lib/account";
import { useT } from "@/lib/i18n";

type Win = "profile" | "donate" | "collection" | "signIn";
const PAGES: Record<Exclude<Win, "signIn">, string> = { profile: "/profile", donate: "/donate", collection: "/collection" };

export function RoomWindows({ state }: { state: ClientState }) {
  const t = useT();
  const account = useAccount();
  const [open, setOpen] = useState<Win | null>(null);

  // Close the window when the game starts, and when the game moves on while you are alive (you may have to act).
  const kind = state.phase.kind;
  const alive = !!state.me?.alive;
  const last = useRef(kind);
  useEffect(() => {
    const before = last.current;
    last.current = kind;
    if (before === kind) return;
    if (before === "lobby" || alive) setOpen(null);
  }, [kind, alive]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  // Signed in from the sign-in window: nothing more to show there.
  useEffect(() => {
    if (account && open === "signIn") setOpen(null);
  }, [account, open]);

  const button = (win: Win, icon: string, label: string, extra = "") => (
    <button type="button" className={`btn-ghost btn-sm px-2 ${extra}`} title={label} aria-label={label} onClick={() => setOpen(win)}>
      {icon}
    </button>
  );
  const titles: Record<Win, string> = {
    profile: t("profile.open"),
    donate: t("donate.open"),
    collection: t("collection.open"),
    signIn: t("room.signIn"),
  };

  return (
    <>
      {account ? button("profile", "👤", titles.profile) : button("signIn", "🔐", titles.signIn, "border-gold/50 text-gold")}
      {button("donate", "💝", titles.donate, "border-gold/50 text-gold")}
      {button("collection", "🃏", titles.collection)}
      {open && (
        <div
          className="page-enter fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
          aria-label={titles[open]}
        >
          <div
            className={`rise relative flex w-full flex-col overflow-hidden rounded-t-2xl border border-gold/40 bg-night-950 shadow-2xl sm:rounded-2xl ${open === "signIn" ? "max-w-sm" : "h-[88dvh] max-w-4xl"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
              <h2 className="min-w-0 flex-1 truncate font-bold">{titles[open]}</h2>
              <span className="hidden text-xs text-white/40 sm:inline">{t("room.windowHint")}</span>
              <button type="button" className="btn-ghost btn-sm px-2" onClick={() => setOpen(null)} title={t("common.close")} aria-label={t("common.close")}>
                ✕
              </button>
            </div>
            {open === "signIn" ? (
              <div className="flex flex-col gap-3 p-4">
                <p className="text-sm text-white/80">{t("room.signInDesc")}</p>
                {GOOGLE_CLIENT_ID ? <GoogleButton /> : <p className="text-xs text-white/50">{t("profile.authUnavailable")}</p>}
              </div>
            ) : (
              <iframe src={PAGES[open]} title={titles[open]} className="min-h-0 w-full flex-1 border-0 bg-night-950" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
