"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/** Chrome's install event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "installPrompt.dismissedAt";
/** After "Not now", ask again a week later. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/**
 * Asks to install the game as an app when the home page opens.
 * Android / desktop Chrome: a button that opens the browser's install dialog.
 * iPhone / iPad (no install event): the steps for "Add to Home Screen".
 * Hidden once installed, and for a week after "Not now".
 */
export function InstallPrompt() {
  const t = useT();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"none" | "button" | "ios">("none");

  useEffect(() => {
    if (standalone() || snoozed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setMode("button");
    };
    const onInstalled = () => setMode("none");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    let timer: number | undefined;
    if (isIos()) timer = window.setTimeout(() => setMode("ios"), 1200);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (mode === "none") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && later();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (mode === "none") return null;

  function later() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setMode("none");
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    setEvt(null);
    if (outcome === "accepted") setMode("none");
    else later();
  }

  return (
    <div
      className="page-enter fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={later}
      role="dialog"
      aria-modal="true"
      aria-label={t("install.title")}
    >
      <div className="rise card w-full max-w-md text-left" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={72} height={72} className="h-18 w-18 shrink-0 rounded-2xl border border-white/15" />
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-black text-moon">{t("install.title")}</h2>
            <p className="mt-1 text-sm text-white/70">{t("install.desc")}</p>
          </div>
        </div>
        {mode === "ios" && (
          <ol className="mt-4 flex flex-col gap-2 rounded-xl bg-white/5 p-3 text-sm text-white/80">
            <li>1. {t("install.ios1")}</li>
            <li>2. {t("install.ios2")}</li>
            <li>3. {t("install.ios3")}</li>
          </ol>
        )}
        <div className="mt-5 flex gap-2">
          <button className="btn-ghost flex-1 py-3" onClick={later}>
            {t("install.later")}
          </button>
          {mode === "button" ? (
            <button className="btn-gold flex-1 py-3" onClick={install}>
              📲 {t("install.install")}
            </button>
          ) : (
            <button className="btn-gold flex-1 py-3" onClick={later}>
              {t("install.gotIt")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
