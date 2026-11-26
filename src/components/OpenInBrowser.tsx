"use client";

// Fallback for when the in-app browser (Messenger, Zalo, Facebook, …) would
// not hand the link over to the phone's real browser: a bar that says how to
// open it there by hand, with a button to copy the link.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { isInAppBrowser } from "@/lib/inAppBrowser";
import { toast } from "./ui";

const DISMISS_KEY = "msn:inAppBarDismissed";

export function OpenInBrowser() {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isInAppBrowser()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {}
    // Give the automatic hand-over a moment first.
    const timer = window.setTimeout(() => setShow(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;

  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  function close() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setShow(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast(t("inApp.copied"), "info");
    } catch {
      window.prompt(t("share.copyManual"), window.location.href);
    }
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[95] p-2" role="alert">
      <div className="card mx-auto flex max-w-md flex-col gap-2 !p-3 text-left text-sm shadow-2xl">
        <p className="font-bold text-moon">🌐 {t("inApp.title")}</p>
        <p className="text-white/75">{t(ios ? "inApp.stepsIos" : "inApp.stepsAndroid")}</p>
        <div className="flex gap-2">
          <button type="button" className="btn-gold btn-sm flex-1" onClick={copy}>
            📋 {t("inApp.copy")}
          </button>
          <button type="button" className="btn-ghost btn-sm shrink-0 px-3" onClick={close}>
            {t("inApp.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
