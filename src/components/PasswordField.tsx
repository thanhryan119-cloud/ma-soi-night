"use client";

import { useEffect, useState } from "react";
import { PASSWORD_MAX } from "@shared/multiplayer";
import { toast, useErrorToast } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { emitAck } from "@/lib/socket";

/** Ticking the box shows the password field; otherwise the room is open. */
export function PasswordField({
  enabled,
  onEnabled,
  value,
  onChange,
}: {
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[var(--color-gold)]" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        🔒 {t("lobby.usePassword")}
      </label>
      {enabled && (
        <input
          className="ui-input"
          type="text"
          autoComplete="off"
          maxLength={PASSWORD_MAX}
          placeholder={t("lobby.passwordPlaceholder")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("lobby.password")}
        />
      )}
    </div>
  );
}

/** Set, change or remove the room password (the host, or the owner of a machine-host room). */
export function PasswordCard({ locked }: { locked: boolean }) {
  const t = useT();
  const showError = useErrorToast();
  const [enabled, setEnabled] = useState(locked);
  const [password, setPassword] = useState("");
  useEffect(() => setEnabled(locked), [locked]);
  const dirty = enabled !== locked || (enabled && !!password.trim());

  async function save() {
    const res = await emitAck("room:setPassword", { withPassword: enabled, password });
    if (!showError(res)) return;
    setPassword("");
    toast(enabled ? t("owner.passwordSet") : t("owner.passwordRemoved"), "info");
  }

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-lg font-bold">🔒 {t("lobby.password")}</h2>
      {locked && <p className="text-xs text-white/50">{t("owner.passwordOn")}</p>}
      <PasswordField enabled={enabled} onEnabled={setEnabled} value={password} onChange={setPassword} />
      <button className="btn-gold btn-sm" disabled={!dirty || (enabled && !locked && !password.trim())} onClick={save}>
        {t("owner.savePassword")}
      </button>
    </section>
  );
}
