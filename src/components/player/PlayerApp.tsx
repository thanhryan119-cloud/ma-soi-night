"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Locale } from "@shared/types";
import { LangSwitch, Spinner, toast, useErrorToast } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { getAuth, loadLocalProfile, saveLocalProfile, type LocalProfile } from "@/lib/account";
import { ProfileEditor } from "@/components/ProfileEditor";
import { emitAck, getSocket, playerKey, storage, type PlayerSession, getDeviceId } from "@/lib/socket";
import { useOtherRoom } from "@/components/CreateRoomGate";
import { useLobbyPresence, useRoomState } from "@/lib/useRoom";
import { PlayerGame } from "./PlayerGame";
import { passwordFromLink, rememberRoomPassword } from "@/components/ShareRoom";
import { PASSWORD_MAX } from "@shared/multiplayer";

type Status = "checking" | "form" | "rejoin" | "in" | "kicked" | "closed" | "notFound" | "abandoned";
interface Seat {
  id: string;
  name: string;
  avatar?: string;
}

export default function PlayerApp({ code }: { code: string }) {
  const t = useT();
  const { locale, suggestLocale, explicit } = useLocale();
  const showError = useErrorToast();
  const [status, setStatus] = useState<Status>("checking");
  const [seats, setSeats] = useState<Seat[]>([]);
  const [locked, setLocked] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const explicitRef = useRef(explicit);
  explicitRef.current = explicit;

  const enter = useCallback(async () => {
    if (statusRef.current === "kicked" || statusRef.current === "closed") return;
    const sess = storage.get<PlayerSession>(playerKey(code));
    if (sess) {
      const res = await emitAck<{ ok: boolean; locale?: Locale }>("player:resume", { code, ...sess });
      if (res.ok) {
        setStatus("in");
        // Keep the server in sync with this phone's language.
        if (explicitRef.current) emitAck("player:action", { type: "setLocale", locale: localeRef.current });
        else if (res.locale) suggestLocale(res.locale);
        return;
      }
      storage.remove(playerKey(code));
      // Out of this game for good (left, or away too long): a bot plays the seat now.
      if (res.error === "err.abandoned") return setStatus("abandoned");
    }
    const info = await emitAck<{ ok: boolean; locale?: Locale; phase?: string; rejoinable?: Seat[]; locked?: boolean }>("room:check", { code });
    if (!info.ok) {
      setStatus(info.error === "err.disconnected" ? "checking" : "notFound");
      return;
    }
    if (info.locale) suggestLocale(info.locale);
    setLocked(!!info.locked);
    // A game is running: offer the offline seats instead of a new-player form.
    if (info.phase && info.phase !== "lobby") {
      setSeats(info.rejoinable ?? []);
      setStatus("rejoin");
      return;
    }
    setStatus("form");
  }, [code, suggestLocale]);

  const { state, connected, offset } = useRoomState(enter);
  // In the lobby: tell the server I'm still here (the owner's idle check); the owner gets "add bots" nudges.
  useLobbyPresence(status === "in" && state?.phase.kind === "lobby", (name) => toast(t("lobbyHelp.nudged", { name }), "info"));

  useEffect(() => {
    const s = getSocket();
    // Events name their room: one from a room this browser just left is not about this one.
    const ours = (e?: { code?: string }) => !e?.code || e.code === code;
    const kicked = (e?: { code?: string }) => {
      if (!ours(e)) return;
      storage.remove(playerKey(code));
      setStatus("kicked");
    };
    const closed = (e?: { code?: string }) => {
      if (!ours(e)) return;
      storage.remove(playerKey(code));
      setStatus("closed");
    };
    s.on("kicked", kicked);
    s.on("roomClosed", closed);
    return () => {
      s.off("kicked", kicked);
      s.off("roomClosed", closed);
    };
  }, [code]);

  const onLocale = (l: Locale) => {
    if (statusRef.current === "in") emitAck("player:action", { type: "setLocale", locale: l });
  };

  let body: React.ReactNode;
  if (status === "checking") body = <Spinner label={t("player.checkingRoom")} />;
  else if (status === "notFound" || status === "kicked" || status === "closed" || status === "abandoned")
    body = (
      <div className="card mx-auto mt-20 max-w-sm text-center">
        <div className="text-5xl">{status === "kicked" || status === "abandoned" ? "🚪" : "🌫️"}</div>
        <p className="mt-4 text-lg">
          {status === "kicked"
            ? t("player.kicked")
            : status === "abandoned"
              ? t("player.abandoned")
              : status === "closed"
                ? t("player.roomClosed")
                : t("err.roomNotFound")}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {status === "kicked" && (
            <button className="btn-gold" onClick={() => setStatus("form")}>
              {t("player.rejoin")}
            </button>
          )}
          <Link href="/" className="btn-ghost">
            {t("host.goHome")}
          </Link>
        </div>
      </div>
    );
  else if (status === "rejoin")
    body = (
      <RejoinPicker
        code={code}
        seats={seats}
        onJoined={(s) => {
          storage.set(playerKey(code), s);
          setStatus("in");
          void enter();
        }}
        showError={showError}
      />
    );
  else if (status === "form")
    body = (
      <JoinForm
        code={code}
        locked={locked}
        onJoined={(s) => {
          storage.set(playerKey(code), s);
          setStatus("in");
        }}
        showError={showError}
      />
    );
  else if (!state || state.viewer !== "player" || !state.me) body = <Spinner label={t("common.loading")} />;
  else body = <PlayerGame state={state} offset={offset} connected={connected} />;

  return (
    <>
      {/* Language is picked before joining; it stays out of the way once in the game. */}
      {status !== "in" && <LangSwitch onChange={onLocale} />}
      {body}
    </>
  );
}

/** Pick your seat to get back into a running game (same account: instant; otherwise the host approves). */
function RejoinPicker({
  code,
  seats,
  onJoined,
  showError,
}: {
  code: string;
  seats: Seat[];
  onJoined: (s: PlayerSession) => void;
  showError: ReturnType<typeof useErrorToast>;
}) {
  const t = useT();
  const [waiting, setWaiting] = useState<Seat | null>(null);

  useEffect(() => {
    const s = getSocket();
    const approved = (p: { playerId: string; token: string }) => onJoined({ playerId: p.playerId, token: p.token });
    const denied = () => {
      setWaiting(null);
      toast(t("player.rejoinDenied"), "error");
    };
    s.on("rejoin:approved", approved);
    s.on("rejoin:denied", denied);
    return () => {
      s.off("rejoin:approved", approved);
      s.off("rejoin:denied", denied);
    };
  }, [onJoined, t]);

  async function choose(seat: Seat) {
    const res = await emitAck<{ ok: boolean; pending?: boolean; playerId?: string; token?: string }>("player:rejoin", {
      code,
      playerId: seat.id,
      authToken: getAuth()?.token,
    });
    if (!showError(res)) return;
    if (res.token && res.playerId) onJoined({ playerId: res.playerId, token: res.token });
    else if (res.pending) setWaiting(seat);
  }

  return (
    <main className="fixed inset-0 mx-auto flex max-w-md flex-col px-4 pt-14 pb-4">
      <h1 className="shrink-0 text-center font-display text-2xl font-black text-moon">{t("player.rejoinTitle")}</h1>
      {waiting ? (
        <div className="card mt-8 text-center">
          <Spinner label={t("player.rejoinWaiting", { name: waiting.name })} />
        </div>
      ) : seats.length ? (
        <>
          <p className="mt-2 shrink-0 text-center text-sm text-white/60">{t("player.rejoinHint")}</p>
          <div className="mt-4 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto">
            {seats.map((s) => (
              <button key={s.id} type="button" className="btn-ghost flex items-center gap-2 py-3 text-left" onClick={() => choose(s)}>
                <span className="text-2xl">{s.avatar || "🙂"}</span>
                <span className="truncate font-semibold">{s.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="card mt-8 text-center">{t("player.rejoinNone")}</p>
      )}
    </main>
  );
}

function JoinForm({
  code,
  locked,
  onJoined,
  showError,
}: {
  code: string;
  locked: boolean;
  onJoined: (s: PlayerSession) => void;
  showError: ReturnType<typeof useErrorToast>;
}) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const other = useOtherRoom();

  useEffect(() => setProfile(loadLocalProfile()), []);
  // An invite link from a password room carries the password: nothing to type.
  useEffect(() => {
    const pw = passwordFromLink();
    if (pw) setPassword(pw);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void join(false);
  }

  /** `leaveOther`: leave the game this person is still in elsewhere (asked first). */
  async function join(leaveOther: boolean) {
    if (!profile) return;
    setBusy(true);
    const res = await emitAck<{ ok: boolean; playerId: string; token: string }>("player:join", {
      code,
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
    saveLocalProfile(profile);
    if (locked) rememberRoomPassword(code, password);
    onJoined({ playerId: res.playerId, token: res.token });
  }

  return (
    <main className="fixed inset-0 mx-auto flex max-w-md flex-col px-4 pt-14 pb-4">
      <h1 className="shrink-0 text-center font-display text-2xl font-black text-moon">{t("player.joinTitle", { code })}</h1>
      <p className="mt-1 shrink-0 text-center text-sm text-white/60">{t("player.joinNoLogin")}</p>
      {other.dialog}
      <form onSubmit={submit} className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {locked && (
          <label className="flex flex-col gap-1">
            <span className="ui-label">🔒 {t("lobby.password")}</span>
            <input
              className="ui-input"
              type="text"
              autoComplete="off"
              maxLength={PASSWORD_MAX}
              placeholder={t("lobby.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {profile && <ProfileEditor value={profile} onChange={setProfile} compact autoFocusName />}
        <div>
          <span className="ui-label">{t("lang.label")}</span>
          <div className="flex gap-2">
            {(["vi", "en"] as Locale[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                className={`btn flex-1 ${locale === l ? "bg-gold text-night-950" : "btn-ghost"}`}
              >
                {t(`lang.${l}`)}
              </button>
            ))}
          </div>
        </div>
        </div>
        <button className="btn-primary shrink-0 py-4 text-xl" disabled={busy || !profile?.name.trim() || (locked && !password.trim())}>
          {busy ? t("player.joining") : t("player.join")}
        </button>
      </form>
    </main>
  );
}
