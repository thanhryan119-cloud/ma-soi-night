"use client";

// Shown inside an app's own browser (Messenger, Zalo, Facebook, …).
// Android: only if the automatic hand-over to the default browser was blocked.
// iPhone: right away, since iOS needs a tap to leave the app. Buttons open
// Safari or Chrome, and the text says how to do it from the app's menu.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { iosBrowserLinks, isInAppBrowser, isIos } from "@/lib/inAppBrowser";
import { toast } from "./ui";

const DISMISS_KEY = "msn:inAppBarDismissed";

export function OpenInBrowser() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (!isInAppBrowser()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {}
    const onIos = isIos(navigator.userAgent);
    setIos(onIos);
    // Android: give the automatic hand-over a moment first.
    const timer = window.setTimeout(() => setShow(true), onIos ? 0 : 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;

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

  const links = ios ? iosBrowserLinks(window.location.href) : null;

  return (
    <div className="fixed inset-x-0 top-0 z-[95] p-2" role="alert">
      <div className="card mx-auto flex max-w-md flex-col gap-2 !p-3 text-left text-sm shadow-2xl">
        <p className="font-bold text-moon">🌐 {t("inApp.title")}</p>
        {links && (
          <div className="flex gap-2">
            <a className="btn-gold btn-sm flex-1 text-center" href={links.safari}>
              🧭 {t("inApp.openSafari")}
            </a>
            <a className="btn-ghost btn-sm flex-1 text-center" href={links.chrome}>
              🌐 {t("inApp.openChrome")}
            </a>
          </div>
        )}
        <p className="text-white/75">{t(ios ? "inApp.stepsIos" : "inApp.stepsAndroid")}</p>
        <div className="flex gap-2">
          <button type="button" className={`${ios ? "btn-ghost" : "btn-gold"} btn-sm flex-1`} onClick={copy}>
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
