"use client";

// Online lobby: who is online, the open rooms, and making a room
// (the machine as host, or yourself), with an optional password.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { LobbyPerson, RoomSummary } from "@shared/multiplayer";
import { PASSWORD_MAX } from "@shared/multiplayer";
import type { Locale } from "@shared/types";
import { ProfileEditor } from "@/components/ProfileEditor";
import { ProfileLink } from "@/components/Profile";
import { PasswordField } from "@/components/PasswordField";
import { Avatar, ConnectionDot, LangSwitch, Spinner, useErrorToast } from "@/components/ui";
import { getAuth, loadLocalProfile, saveLocalProfile, type LocalProfile } from "@/lib/account";
import { useLocale, useT } from "@/lib/i18n";
import { useLobby } from "@/lib/lobby";
import { emitAck, hostKey, playerKey, storage } from "@/lib/socket";

export default function LobbyPage() {
  const t = useT();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  useEffect(() => setProfile(loadLocalProfile()), []);
  const { state, connected } = useLobby(profile);

  const change = (p: LocalProfile) => {
    setProfile(p);
    saveLocalProfile(p);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 pt-16 pb-10">
      <LangSwitch />
      <Link href="/profile" className="btn-ghost btn-sm fixed top-3 right-3 z-50">
        👤 {t("profile.open")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="btn-ghost btn-sm">
          ← {t("common.back")}
        </Link>
        <h1 className="font-display text-3xl font-black text-moon">🌐 {t("lobby.title")}</h1>
        {!connected && <ConnectionDot connected={false} />}
      </div>
      <p className="-mt-2 text-white/60">{t("lobby.desc")}</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-lg font-bold">{t("lobby.you")}</h2>
            {profile ? <ProfileEditor value={profile} onChange={change} compact /> : <Spinner />}
          </section>
          <OnlineCard online={state?.online ?? null} />
        </div>
        <div className="flex flex-col gap-4">
          <CreateRoomCard profile={profile} />
          <RoomsCard rooms={state?.rooms ?? null} profile={profile} />
        </div>
      </div>
    </main>
  );
}

function OnlineCard({ online }: { online: LobbyPerson[] | null }) {
  const t = useT();
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <h2 className="text-lg font-bold">{t("lobby.online")}</h2>
        {online && <span className="chip">{online.length}</span>}
      </div>
      {!online ? (
        <Spinner />
      ) : !online.length ? (
        <p className="text-sm text-white/50">{t("lobby.nobodyOnline")}</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {online.map((p) => {
            const look = { ...p, alive: true };
            const row = (
              <>
                <Avatar p={look} size="sm" />
                <span className="truncate font-semibold">{p.name}</span>
              </>
            );
            return (
              <li key={p.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                {p.userId ? (
                  <ProfileLink userId={p.userId} className="min-w-0 gap-2">
                    {row}
                  </ProfileLink>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">{row}</span>
                )}
                {p.userId && <span className="ml-auto shrink-0 text-xs text-gold">✓</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CreateRoomCard({ profile }: { profile: LocalProfile | null }) {
  const t = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const showError = useErrorToast();
  const [machine, setMachine] = useState(true);
  const [roomLocale, setRoomLocale] = useState<Locale>(locale);
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setRoomLocale(locale), [locale]);

  async function create() {
    if (!profile?.name.trim()) return showError({ ok: false, error: "err.nameRequired" });
    if (withPassword && !password.trim()) return showError({ ok: false, error: "err.passwordRequired" });
    setBusy(true);
    const saved = storage.get<Record<string, unknown>>("msn:hostSettings");
    const res = await emitAck<{ code: string; hostToken?: string; playerId?: string; token?: string }>("lobby:createRoom", {
      machine,
      locale: roomLocale,
      withPassword,
      password,
      profile: { name: profile.name, avatar: profile.avatar, style: profile.style },
      authToken: getAuth()?.token,
      settings: saved ?? undefined,
    });
    setBusy(false);
    if (!showError(res) || !res.code) return;
    if (res.playerId && res.token) {
      storage.set(playerKey(res.code), { playerId: res.playerId, token: res.token });
      router.push(`/join/${res.code}`);
    } else if (res.hostToken) {
      storage.set(hostKey(res.code), res.hostToken);
      router.push(`/host/${res.code}`);
    }
  }

  const choice = (on: boolean, icon: string, title: string, desc: string, pick: () => void) => (
    <button
      type="button"
      onClick={pick}
      aria-pressed={on}
      className={`flex flex-1 flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
        on ? "border-gold bg-gold/10" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <span className="font-bold">
        {icon} {title}
      </span>
      <span className="text-xs text-white/60">{desc}</span>
    </button>
  );

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="text-xl font-bold">➕ {t("lobby.createTitle")}</h2>
      <div>
        <span className="ui-label">{t("lobby.whoHosts")}</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          {choice(machine, "🤖", t("lobby.machineHost"), t("lobby.machineHostDesc"), () => setMachine(true))}
          {choice(!machine, "🎙️", t("lobby.humanHost"), t("lobby.humanHostDesc"), () => setMachine(false))}
        </div>
      </div>
      <div>
        <span className="ui-label">{t("home.roomLanguage")}</span>
        <div className="flex gap-2">
          {(["vi", "en"] as Locale[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setRoomLocale(l)}
              className={`btn flex-1 ${roomLocale === l ? "bg-gold text-night-950" : "btn-ghost"}`}
            >
              {t(`lang.${l}`)}
            </button>
          ))}
        </div>
      </div>
      <PasswordField enabled={withPassword} onEnabled={setWithPassword} value={password} onChange={setPassword} />
      <button className="btn-primary py-3 text-lg" onClick={create} disabled={busy || !profile}>
        {busy ? t("home.creating") : t("home.createButton")}
      </button>
    </section>
  );
}

function RoomsCard({ rooms, profile }: { rooms: RoomSummary[] | null; profile: LocalProfile | null }) {
  const t = useT();
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold">🚪 {t("lobby.rooms")}</h2>
        {rooms && <span className="chip">{rooms.length}</span>}
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
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const full = room.players >= room.max;
  const canJoin = room.status === "waiting" && !full;

  async function join() {
    if (!profile?.name.trim()) return showError({ ok: false, error: "err.nameRequired" });
    if (room.locked && !asking) return setAsking(true);
    setBusy(true);
    const res = await emitAck<{ playerId: string; token: string }>("player:join", {
      code: room.code,
      name: profile.name,
      avatar: profile.avatar,
      style: profile.style,
      authToken: getAuth()?.token,
      locale,
      password,
    });
    setBusy(false);
    if (!showError(res) || !res.playerId || !res.token) return;
    storage.set(playerKey(room.code), { playerId: res.playerId, token: res.token });
    router.push(`/join/${room.code}`);
  }

  const status = room.status === "waiting" ? (full ? t("lobby.full") : t("lobby.waiting")) : room.status === "playing" ? t("lobby.playing") : t("lobby.over");
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-white/5 p-3">
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
        <button className="btn-gold btn-sm shrink-0" disabled={!canJoin || busy} onClick={join}>
          {t("lobby.join")}
        </button>
      </div>
      {asking && canJoin && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
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

