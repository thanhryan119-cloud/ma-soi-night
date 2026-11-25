"use client";

// Making a room needs a Google account, and each account runs one room at a
// time (joining a room needs neither). Each person also sits in one room at a
// time. These are the pieces the home page, the online lobby and the join page
// share: the sign-in prompt, and the dialogs shown when the account already
// has a room open or the person is still playing in another room.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleButton } from "@/components/ProfileEditor";
import { useErrorToast } from "@/components/ui";
import { GOOGLE_CLIENT_ID, getAuth, useAccount } from "@/lib/account";
import { useT } from "@/lib/i18n";
import { emitAck, hostKey, playerKey, storage } from "@/lib/socket";

/** What creating (or getting back) a room answers with. */
export interface RoomEntry {
  code?: string;
  hostToken?: string;
  playerId?: string;
  token?: string;
}

/** True when this browser must sign in before it can make a room. */
export function useNeedsSignInToCreate() {
  const account = useAccount();
  return !!GOOGLE_CLIENT_ID && !account;
}

/** Saves the room's credentials and opens it (host view or player seat). */
export function useEnterRoom() {
  const router = useRouter();
  return (res: RoomEntry) => {
    if (!res.code) return;
    if (res.playerId && res.token) {
      storage.set(playerKey(res.code), { playerId: res.playerId, token: res.token });
      router.push(`/join/${res.code}`);
    } else if (res.hostToken) {
      storage.set(hostKey(res.code), res.hostToken);
      router.push(`/host/${res.code}`);
    }
  };
}

/** "Sign in with Google to make a room", shown in place of the create button. */
export function SignInToCreate() {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gold/40 bg-gold/5 p-3">
      <p className="text-sm text-gold">🔐 {t("home.signInToCreate")}</p>
      <GoogleButton />
    </div>
  );
}

/** The dark backdrop and card the dialogs below sit in. */
function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="page-enter fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="rise card w-full max-w-md text-left" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/**
 * The person is still playing in room `code` (a running game): go back to
 * it, or leave it (a bot plays on, a loss for them) and continue here.
 * `caught(res, retry)` shows it when a join answered "err.inOtherRoom";
 * `retry` is called again with leaveOther set.
 */
export function useOtherRoom() {
  const t = useT();
  const router = useRouter();
  const [ask, setAsk] = useState<{ code: string; retry: () => void } | null>(null);
  const caught = (res: { ok: boolean; error?: string; params?: Record<string, unknown> }, retry: () => void) => {
    if (res.ok || res.error !== "err.inOtherRoom" || !res.params?.code) return false;
    setAsk({ code: String(res.params.code), retry });
    return true;
  };
  const close = () => setAsk(null);
  const dialog = ask && (
    <Modal label={t("player.otherRoomTitle", { code: ask.code })} onClose={close}>
      <h2 className="font-display text-2xl font-black text-moon">🚪 {t("player.otherRoomTitle", { code: ask.code })}</h2>
      <p className="mt-2 text-white/80">{t("player.otherRoomDesc")}</p>
      <div className="mt-4 flex flex-col gap-2">
        <button className="btn-primary py-3" onClick={() => router.push(`/join/${ask.code}`)}>
          {t("player.otherRoomBack", { code: ask.code })}
        </button>
        <button
          className="btn-ghost border-blood/50 py-2.5 text-blood-light hover:bg-blood/10"
          onClick={() => {
            close();
            ask.retry();
          }}
        >
          {t("player.otherRoomLeave", { code: ask.code })}
        </button>
        <button className="btn-ghost btn-sm self-center" onClick={close}>
          {t("common.cancel")}
        </button>
      </div>
    </Modal>
  );
  return { caught, dialog };
}

/**
 * The account already runs room `code`: go back to it, or leave it (the next
 * player takes it over) and make the new one.
 */
export function ExistingRoomDialog({
  code,
  busy,
  onReplace,
  onClose,
}: {
  code: string;
  busy: boolean;
  onReplace: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const showError = useErrorToast();
  const enter = useEnterRoom();
  const [going, setGoing] = useState(false);

  async function goBack() {
    setGoing(true);
    const res = await emitAck<RoomEntry>("room:reclaim", { authToken: getAuth()?.token });
    setGoing(false);
    if (showError(res)) enter(res);
  }

  return (
    <Modal label={t("home.oneRoomTitle")} onClose={onClose}>
        <h2 className="font-display text-2xl font-black text-moon">🏠 {t("home.oneRoomTitle")}</h2>
        <p className="mt-2 text-white/80">{t("home.oneRoomDesc", { code })}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button className="btn-primary py-3" onClick={goBack} disabled={going || busy}>
            {t("home.oneRoomBack", { code })}
          </button>
          <button className="btn-ghost border-blood/50 py-2.5 text-blood-light hover:bg-blood/10" onClick={onReplace} disabled={going || busy}>
            {busy ? t("home.creating") : t("home.oneRoomReplace", { code })}
          </button>
          <button className="btn-ghost btn-sm self-center" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
    </Modal>
  );
}
