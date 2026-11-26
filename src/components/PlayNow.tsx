"use client";

// "Play now": one tap makes a room the machine runs, fills the empty seats with
// bots, deals the suggested setup from the basic roles and starts the game.

import { useState } from "react";
import { ExistingRoomDialog, useEnterRoom, useNeedsSignInToCreate, useOtherRoom } from "@/components/CreateRoomGate";
import { toast, useErrorToast } from "@/components/ui";
import { getAuth, loadLocalProfile } from "@/lib/account";
import { useLocale, useT } from "@/lib/i18n";
import { emitAck, getDeviceId } from "@/lib/socket";

export function PlayNowButton({ className = "" }: { className?: string }) {
  const t = useT();
  const { locale } = useLocale();
  const showError = useErrorToast();
  const enter = useEnterRoom();
  const other = useOtherRoom();
  const needsSignIn = useNeedsSignInToCreate();
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<string | null>(null);

  async function play(replace = false, leaveOther = false) {
    if (needsSignIn) return toast(t("home.signInToCreate"), "info");
    setBusy(true);
    const profile = loadLocalProfile();
    const res = await emitAck<{ code: string; playerId?: string; token?: string }>("lobby:createRoom", {
      machine: true,
      locale,
      withPassword: false,
      password: "",
      profile: { name: profile.name, avatar: profile.avatar, style: profile.style },
      authToken: getAuth()?.token,
      replace,
      deviceId: getDeviceId(),
      leaveOther,
    });
    if (other.caught(res, () => play(replace, true))) return setBusy(false);
    if (!res.ok && res.error === "err.oneRoom" && res.params?.code) {
      setBusy(false);
      return setExisting(String(res.params.code));
    }
    if (!showError(res) || !res.code) return setBusy(false);
    setExisting(null);
    // This socket now sits in the room as its owner: bots, basic roles, start.
    showError(await emitAck("owner:action", { type: "playNow" }));
    enter(res);
  }

  return (
    <>
      <button type="button" className={`btn-primary ${className}`} disabled={busy} onClick={() => play()} title={t("home.playNowDesc")}>
        ▶ {busy ? t("home.playNowBusy") : t("home.playNow")}
      </button>
      {existing && <ExistingRoomDialog code={existing} busy={busy} onReplace={() => play(true)} onClose={() => setExisting(null)} />}
      {other.dialog}
    </>
  );
}
