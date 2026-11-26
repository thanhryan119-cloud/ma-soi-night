"use client";

// Invite link for a room: share it to a group chat (Zalo, Messenger, …) with
// the phone's share sheet, or copy it. Whoever opens it only types a name to
// join; no account needed. A password room's link carries the password in the
// #hash (never sent to the server in the URL), so friends don't type it either.

import { useT } from "@/lib/i18n";
import { storage } from "@/lib/socket";
import { useJoinUrl } from "./host/HostLobby";
import { toast } from "./ui";

const pwKey = (code: string) => `msn:roomPw:${code.toUpperCase()}`;

/** Remembers a room's password on this device so its invite link can carry it. */
export function rememberRoomPassword(code: string, password: string) {
  if (password.trim()) storage.set(pwKey(code), password);
}

/** The password carried by an invite link (#pw=…), if any. */
export function passwordFromLink(): string {
  if (typeof window === "undefined") return "";
  const m = window.location.hash.match(/(?:^#|&)pw=([^&]*)/);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return "";
  }
}

/** The room's invite link (with the password when this device knows it). */
export function useInviteUrl(code: string) {
  const { url } = useJoinUrl(code);
  if (!url) return "";
  const pw = storage.get<string>(pwKey(code));
  return pw ? `${url}#pw=${encodeURIComponent(pw)}` : url;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Old browsers / no permission: fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function ShareRoom({ code, className = "" }: { code: string; className?: string }) {
  const t = useT();
  const url = useInviteUrl(code);
  const text = t("share.text", { code });

  async function onCopy() {
    if (await copy(`${text}\n${url}`)) toast(t("share.copied"), "info");
    else window.prompt(t("share.copyManual"), url);
  }

  async function onShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: t("app.name"), text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    await onCopy();
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex gap-2">
        <button type="button" className="btn-primary btn-sm flex-1" disabled={!url} onClick={onShare}>
          📤 {t("share.button")}
        </button>
        <button type="button" className="btn-ghost btn-sm flex-1" disabled={!url} onClick={onCopy} title={t("share.copy")}>
          📋<span className="sr-only">{t("share.copy")}</span>
        </button>
      </div>
      <p className="text-center text-xs text-white/55">{t("share.hint")}</p>
    </div>
  );
}
