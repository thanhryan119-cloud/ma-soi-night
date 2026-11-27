"use client";

// The open rooms: one row per room with join (or watch, once it has started),
// and a password box for locked rooms. Used by the lobby and the home page.

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RoomSummary } from "@shared/multiplayer";
import { PASSWORD_MAX } from "@shared/multiplayer";
import { Spinner, useErrorToast } from "@/components/ui";
import { getAuth, type LocalProfile } from "@/lib/account";
import { useOtherRoom } from "@/components/CreateRoomGate";
import { useLocale, useT } from "@/lib/i18n";
import { emitAck, getDeviceId, playerKey, storage, watchPasswordKey } from "@/lib/socket";

export function RoomsCard({
  rooms,
  profile,
  onQuick,
  quickBusy,
}: {
  rooms: RoomSummary[] | null;
  profile: LocalProfile | null;
  /** The quick join button (left out on the home page, which has its own). */
  onQuick?: () => void;
  quickBusy?: boolean;
}) {
  const t = useT();
  return (
    <section className="card flex min-h-64 flex-col gap-3 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-2xl font-black text-moon">🚪 {t("lobby.rooms")}</h2>
        {rooms && <span className="chip">{rooms.length}</span>}
        {onQuick && (
          <button className="btn-gold btn-sm ml-auto" onClick={onQuick} disabled={!rooms || !profile || quickBusy}>
            ⚡ {quickBusy ? t("lobby.quickJoining") : t("lobby.quickButton")}
          </button>
        )}
      </div>
      {!rooms ? (
        <Spinner />
      ) : !rooms.length ? (
        <p className="py-6 text-center text-white/50">{t("lobby.noRooms")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((r) => (
            <RoomRow key={r.code} room={r} profile={profile} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomRow({ room, profile }: { room: RoomSummary; profile: LocalProfile | null }) {
  const t = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const showError = useErrorToast();
  // What the password box is for: taking a seat, or watching the game.
  const [asking, setAsking] = useState<"join" | "watch" | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const other = useOtherRoom();
  const full = room.players >= room.max;
  const canJoin = room.status === "waiting" && !full;
  const canWatch = room.status === "playing";

  function watch() {
    if (room.locked && asking !== "watch") return setAsking("watch");
    storage.set(watchPasswordKey(room.code), password);
    router.push(`/watch/${room.code}`);
  }

  async function join(leaveOther = false) {
    // A guest, or nobody named yet (the home page): the invite page asks for a name.
    if (!getAuth() || !profile?.name.trim()) return router.push(`/join/${room.code}`);
    if (room.locked && asking !== "join") return setAsking("join");
    setBusy(true);
    const res = await emitAck<{ playerId: string; token: string }>("player:join", {
      code: room.code,
      name: profile.name,
      avatar: profile.avatar,
      style: profile.style,
      authToken: getAuth()?.token,
      deviceId: getDeviceId(),
      leaveOther,
      locale,
      password,
    });
    setBusy(false);
    if (other.caught(res, () => join(true))) return;
    if (!showError(res) || !res.playerId || !res.token) return;
    storage.set(playerKey(room.code), { playerId: res.playerId, token: res.token });
    router.push(`/join/${room.code}`);
  }

  const status = room.status === "waiting" ? (full ? t("lobby.full") : t("lobby.waiting")) : room.status === "playing" ? t("lobby.playing") : t("lobby.over");
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-white/5 p-3">
      {other.dialog}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-semibold">
            {room.locked && <span title={t("lobby.locked")}>🔒</span>}
            <span className="truncate">{t("lobby.roomOf", { name: room.title })}</span>
            <span className="font-mono text-xs text-white/40">{room.code}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-white/60">
            <span className="chip py-0">{room.machineHost ? `🤖 ${t("lobby.machineHost")}` : `🎙️ ${t("lobby.humanHost")}`}</span>
            <span className="chip py-0">
              👥 {room.players}/{room.max}
              {room.bots > 0 && ` · 🤖 ${room.bots}`}
            </span>
            <span className="chip py-0">{room.locale.toUpperCase()}</span>
            <span className={`chip py-0 ${room.status === "waiting" && !full ? "text-emerald-300" : "text-white/50"}`}>{status}</span>
          </div>
        </div>
        {canWatch ? (
          <button className="btn-ghost btn-sm shrink-0 border-sky-300/40 text-sky-200" onClick={watch} title={t("lobby.watchHint")}>
            👁️ {t("lobby.watch")}
          </button>
        ) : (
          <button className="btn-gold btn-sm shrink-0" disabled={!canJoin || busy} onClick={() => join()}>
            {t("lobby.join")}
          </button>
        )}
      </div>
      {((asking === "join" && canJoin) || (asking === "watch" && canWatch)) && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (asking === "watch") watch();
            else void join();
          }}
        >
          <input
            className="ui-input min-w-0 flex-1"
            type="text"
            autoComplete="off"
            autoFocus
            maxLength={PASSWORD_MAX}
            placeholder={t("lobby.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label={t("lobby.password")}
          />
          <button className="btn-primary btn-sm" disabled={busy || !password.trim()}>
            {t("lobby.enter")}
          </button>
        </form>
      )}
    </li>
  );
}

