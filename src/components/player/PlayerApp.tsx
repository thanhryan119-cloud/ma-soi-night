"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Locale } from "@shared/types";
import { LangSwitch, Spinner, toast, useErrorToast } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { getAuth, loadLocalProfile, saveLocalProfile, type LocalProfile } from "@/lib/account";
import { ProfileEditor } from "@/components/ProfileEditor";
import { emitAck, getSocket, playerKey, storage, type PlayerSession } from "@/lib/socket";
import { useRoomState } from "@/lib/useRoom";
import { PlayerGame } from "./PlayerGame";

type Status = "checking" | "form" | "rejoin" | "in" | "kicked" | "closed" | "notFound";
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
    }
    const info = await emitAck<{ ok: boolean; locale?: Locale; phase?: string; rejoinable?: Seat[] }>("room:check", { code });
    if (!info.ok) {
      setStatus(info.error === "err.disconnected" ? "checking" : "notFound");
      return;
    }
    if (info.locale) suggestLocale(info.locale);
    // A game is running: offer the offline seats instead of a new-player form.
    if (info.phase && info.phase !== "lobby") {
      setSeats(info.rejoinable ?? []);
      setStatus("rejoin");
      return;
    }
    setStatus("form");
  }, [code, suggestLocale]);

  const { state, connected, offset } = useRoomState(enter);

  useEffect(() => {
    const s = getSocket();
    const kicked = () => {
      storage.remove(playerKey(code));
      setStatus("kicked");
    };
    const closed = () => {
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
  else if (status === "notFound" || status === "kicked" || status === "closed")
    body = (
      <div className="card mx-auto mt-20 max-w-sm text-center">
        <div className="text-5xl">{status === "kicked" ? "🚪" : "🌫️"}</div>
        <p className="mt-4 text-lg">
          {status === "kicked" ? t("player.kicked") : status === "closed" ? t("player.roomClosed") : t("err.roomNotFound")}
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
      <LangSwitch onChange={onLocale} />
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
  onJoined,
  showError,
}: {
  code: string;
  onJoined: (s: PlayerSession) => void;
  showError: ReturnType<typeof useErrorToast>;
}) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setProfile(loadLocalProfile()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    const res = await emitAck<{ ok: boolean; playerId: string; token: string }>("player:join", {
      code,
      name: profile.name,
      avatar: profile.avatar,
      style: profile.style,
      authToken: getAuth()?.token,
      locale,
    });
    setBusy(false);
    if (!showError(res) || !res.playerId || !res.token) return;
    saveLocalProfile(profile);
    onJoined({ playerId: res.playerId, token: res.token });
  }

  return (
    <main className="fixed inset-0 mx-auto flex max-w-md flex-col px-4 pt-14 pb-4">
      <h1 className="shrink-0 text-center font-display text-2xl font-black text-moon">{t("player.joinTitle", { code })}</h1>
      <form onSubmit={submit} className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {profile && <ProfileEditor value={profile} onChange={setProfile} compact />}
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
        <button className="btn-primary shrink-0 py-4 text-xl" disabled={busy || !profile?.name.trim()}>
          {busy ? t("player.joining") : t("player.join")}
        </button>
      </form>
    </main>
  );
}
