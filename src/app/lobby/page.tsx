"use client";

// Online lobby. The open rooms are the main part, with who is online right
// under them (add a friend, ask to join their room, or make a room and invite
// them). Beside them (below on a phone) your name and making a room.

import { SfxToggle } from "@/components/Sfx";
import Link from "next/link";
import { CollectionLink } from "@/components/RoleCollection";
import { DonateLink } from "@/components/Donate";
import { QuestsLink } from "@/components/Quests";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RoomSummary } from "@shared/multiplayer";
import { PASSWORD_MAX } from "@shared/multiplayer";
import type { OnlineUser } from "@shared/social";
import type { Locale } from "@shared/types";
import { ProfileEditor } from "@/components/ProfileEditor";
import { ProfileLink } from "@/components/Profile";
import { PasswordField } from "@/components/PasswordField";
import { Avatar, CardBackdrop, ConnectionDot, LangSwitch, Spinner, StyledName, toast, useErrorToast } from "@/components/ui";
import { shuffle } from "@shared/engine";
import { getAuth, loadLocalProfile, saveLocalProfile, type LocalProfile } from "@/lib/account";
import { ExistingRoomDialog, SignInToCreate, useEnterRoom, useNeedsSignInToCreate, useOtherRoom } from "@/components/CreateRoomGate";
import { useLocale, useT } from "@/lib/i18n";
import { useLobby } from "@/lib/lobby";
import { RoomsCard } from "@/components/RoomList";
import { GlobalChat, useGlobalChat } from "@/components/GlobalChat";
import { SignInGate } from "@/components/AuthPanel";
import { WhereChip, sortByPresence } from "@/components/Friends";
import { Mailbox } from "@/components/Mailbox";
import { rememberRoomPassword } from "@/components/ShareRoom";
import { emitAck, getDeviceId, playerKey, storage, watchPasswordKey } from "@/lib/socket";

type Chat = ReturnType<typeof useGlobalChat>;
type Creator = ReturnType<typeof useCreateRoom>;

export default function LobbyPage() {
  // One server-chat connection for the corner panel and the online list here.
  // Play now and the lobby need an account (Google or a quick one) first.
  return (
    <SignInGate>
      <GlobalChat render={(chat) => <Lobby chat={chat} />} />
    </SignInGate>
  );
}

function Lobby({ chat }: { chat: Chat }) {
  const t = useT();
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  useEffect(() => setProfile(loadLocalProfile()), []);
  const { state, connected } = useLobby(profile);
  const creator = useCreateRoom(profile, chat);
  const router = useRouter();
  const { locale } = useLocale();
  const showError = useErrorToast();
  // "Quick join" from the home page: join a random open room once the lobby loads.
  const [quickPending, setQuickPending] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const quickOther = useOtherRoom();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("quick")) {
      setQuickPending(true);
      window.history.replaceState(null, "", "/lobby");
    }
  }, []);

  const change = (p: LocalProfile) => {
    setProfile(p);
    saveLocalProfile(p);
  };

  /** `leaveOther`: leave the game this person is still in elsewhere (asked first). */
  async function quickJoin(leaveOther = false) {
    if (!profile?.name.trim()) return showError({ ok: false, error: "err.nameRequired" });
    const open = (state?.rooms ?? []).filter((r) => r.status === "waiting" && r.players < r.max && !r.locked);
    // Rooms in your language first, then the fullest (people gather in one room instead
    // of waiting alone in several), ties in random order.
    const people = (r: RoomSummary) => r.players - r.bots;
    const picks = shuffle(open).sort(
      (a, b) => Number(b.locale === locale) - Number(a.locale === locale) || people(b) - people(a),
    );
    setQuickBusy(true);
    if (!picks.length) return quickCreate(leaveOther);
    for (const room of picks) {
      const res = await emitAck<{ playerId: string; token: string }>("player:join", {
        code: room.code,
        name: profile.name,
        avatar: profile.avatar,
        style: profile.style,
        authToken: getAuth()?.token,
        deviceId: getDeviceId(),
        leaveOther,
        locale,
        password: "",
      });
      if (quickOther.caught(res, () => quickJoin(true))) return setQuickBusy(false);
      if (res.ok && res.playerId && res.token) {
        storage.set(playerKey(room.code), { playerId: res.playerId, token: res.token });
        router.push(`/join/${room.code}`);
        return;
      }
    }
    // Every room filled up or started meanwhile.
    return quickCreate(leaveOther);
  }

  /**
   * No open room: make one in the room list and go in, so the next person who
   * taps "Play" lands with you (the game starts by itself once enough are here).
   */
  async function quickCreate(leaveOther: boolean) {
    if (!profile) return setQuickBusy(false);
    const res = await emitAck<{ code: string; playerId?: string; token?: string }>("lobby:createRoom", {
      machine: true,
      locale,
      profile: { name: profile.name, avatar: profile.avatar, style: profile.style },
      authToken: getAuth()?.token,
      deviceId: getDeviceId(),
      leaveOther,
    });
    if (quickOther.caught(res, () => quickJoin(true))) return setQuickBusy(false);
    // This account already runs a room: back to it.
    if (!res.ok && res.error === "err.oneRoom" && res.params?.code) return router.push(`/join/${res.params.code}`);
    if (!res.ok || !res.code || !res.playerId || !res.token) {
      setQuickBusy(false);
      return showError(res);
    }
    storage.set(playerKey(res.code), { playerId: res.playerId, token: res.token });
    toast(t("lobby.quickMade"), "info");
    router.push(`/join/${res.code}`);
  }

  useEffect(() => {
    if (!quickPending || !state || !profile) return;
    setQuickPending(false);
    void quickJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickPending, state, profile]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 pt-16 pb-10">
      <LangSwitch />
      <div className="fixed top-3 right-3 z-50 flex gap-2">
        <SfxToggle />
        <Mailbox />
        <QuestsLink />
        <CollectionLink />
        <DonateLink />
        <Link href="/profile" className="btn-ghost btn-sm" title={t("profile.open")}>
          👤 <span className="sr-only">{t("profile.open")}</span>
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="btn-ghost btn-sm" title={t("common.back")}>
          ←<span className="sr-only">{t("common.back")}</span>
        </Link>
        <h1 className="font-display text-3xl font-black text-moon">🌐 {t("lobby.title")}</h1>
        {!connected && <ConnectionDot connected={false} />}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <RoomsCard rooms={state?.rooms ?? null} profile={profile} onQuick={() => quickJoin()} quickBusy={quickBusy} />
          <OnlineCard chat={chat} creator={creator} />
        </div>
        {quickOther.dialog}
        <div className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-lg font-bold">{t("lobby.you")}</h2>
            {profile ? <ProfileEditor value={profile} onChange={change} compact /> : <Spinner />}
          </section>
          <CreateRoomCard profile={profile} creator={creator} />
        </div>
      </div>
      {creator.dialogs}
    </main>
  );
}

const lookOf = (u: OnlineUser) => ({ name: u.name, avatar: "👤", avatarUrl: u.avatarUrl, style: u.style ?? undefined, alive: true });
const actBtn = "btn-ghost btn-sm shrink-0 gap-1 px-2.5 text-xs";

/** Everyone signed in who is online, busiest first, each with what you can do with them. */
function OnlineCard({ chat, creator }: { chat: Chat; creator: Creator }) {
  const t = useT();
  const { online, me } = chat;
  const needsSignIn = useNeedsSignInToCreate();
  const rows = sortByPresence(online.users.map((u) => ({ ...u, online: true })));
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <h2 className="text-lg font-bold">{t("lobby.online")}</h2>
        <span className="chip">{online.users.length + online.guests}</span>
      </div>
      {!rows.length ? (
        <p className="text-sm text-white/50">{t("globalChat.onlineEmpty")}</p>
      ) : (
        <ul className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto">
          {rows.map((u) => (
            <li key={u.id} className="relative isolate flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg bg-white/5 px-2 py-1.5">
              <CardBackdrop card={u.style?.card} />
              <ProfileLink userId={u.id} className="min-w-0 flex-1 basis-44 gap-2">
                <Avatar p={lookOf(u)} size="sm" />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="flex max-w-full items-center gap-1">
                    <StyledName p={lookOf(u)} className="truncate font-semibold" />
                    {u.id === me?.id && <span className="shrink-0 text-[10px] text-white/40">({t("globalChat.you")})</span>}
                  </span>
                  <WhereChip where={u.where} link={false} />
                </span>
              </ProfileLink>
              {me && u.id !== me.id && <PersonButtons chat={chat} creator={creator} u={u} />}
            </li>
          ))}
        </ul>
      )}
      {online.guests > 0 && <p className="text-center text-xs text-white/40">{t("people.guests", { n: online.guests })}</p>}
      {!me && (needsSignIn ? <SignInToCreate /> : <p className="text-xs text-white/50">{t("lobby.signInForPeople")}</p>)}
    </section>
  );
}

/** Add as a friend, ask into their room (or watch their game), make a room and invite them. */
function PersonButtons({ chat, creator, u }: { chat: Chat; creator: Creator; u: OnlineUser }) {
  const t = useT();
  const rel = chat.relation(u.id);
  const where = u.where;
  return (
    <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
      {rel === "none" ? (
        <button type="button" className={`${actBtn} border-gold/40 text-gold`} onClick={() => chat.addFriend(u)}>
          🤝 {t("friends.add")}
        </button>
      ) : rel === "received" ? (
        <button type="button" className="btn-primary btn-sm shrink-0 px-2.5 text-xs" onClick={() => chat.answerFriend(u, true)}>
          ✔️ {t("friends.accept")}
        </button>
      ) : rel === "sent" ? (
        <span className="px-1 text-[11px] text-white/40" title={t("friends.pending")}>
          ⏳ {t("friends.outgoing")}
        </span>
      ) : (
        <span className="px-1 text-xs text-emerald-300" title={t("friends.isFriend")}>
          👥 {t("friends.isFriend")}
        </span>
      )}
      {where?.status === "waiting" && (
        <button
          type="button"
          className={`${actBtn} border-emerald-300/40 text-emerald-200`}
          onClick={() => chat.askToJoin(u)}
          title={t("lobby.askJoinHint", { name: u.name })}
        >
          🙋 {t("lobby.askJoin")}
        </button>
      )}
      {where?.status === "playing" && where.code && (
        <Link href={`/watch/${where.code}`} className={`${actBtn} border-sky-300/40 text-sky-200`} title={t("lobby.watchHint")}>
          👁️ {t("lobby.watch")}
        </Link>
      )}
      <button
        type="button"
        className="btn-gold btn-sm shrink-0 gap-1 px-2.5 text-xs"
        disabled={creator.busy}
        onClick={() => creator.createFor(u)}
        title={t("lobby.playWithHint", { name: u.name })}
      >
        ➕ {t("lobby.playWith")}
      </button>
    </span>
  );
}

/**
 * Making a room: the options, and the call itself. `createFor` makes one and
 * invites someone from the online list into it before going in.
 */
function useCreateRoom(profile: LocalProfile | null, chat: Chat) {
  const enter = useEnterRoom();
  /** The room this account already runs, when it tried to make another. */
  const [existing, setExisting] = useState<string | null>(null);
  const other = useOtherRoom();
  const { locale } = useLocale();
  const showError = useErrorToast();
  const [machine, setMachine] = useState(true);
  const [roomLocale, setRoomLocale] = useState<Locale>(locale);
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  /** Who to invite once the room is made (kept across the "you already have a room" question). */
  const invitee = useRef<OnlineUser | null>(null);
  useEffect(() => setRoomLocale(locale), [locale]);

  async function create(replace = false, leaveOther = false) {
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
      // Online rooms start from the online defaults; a human host keeps their usual rules.
      settings: machine ? undefined : (saved ?? undefined),
      replace,
      deviceId: getDeviceId(),
      leaveOther,
    });
    if (other.caught(res, () => create(replace, true))) return setBusy(false);
    if (!res.ok && res.error === "err.oneRoom" && res.params?.code) {
      setBusy(false);
      return setExisting(String(res.params.code));
    }
    if (!showError(res) || !res.code) return setBusy(false);
    setExisting(null);
    // So the room's invite link can carry the password (friends then only type a name).
    if (withPassword) rememberRoomPassword(res.code, password);
    const who = invitee.current;
    invitee.current = null;
    if (who) await chat.invite(who, res.code);
    setBusy(false);
    enter(res);
  }

  return {
    machine,
    setMachine,
    roomLocale,
    setRoomLocale,
    withPassword,
    setWithPassword,
    password,
    setPassword,
    busy,
    /** The Create button: a room for nobody in particular. */
    create: () => {
      invitee.current = null;
      void create();
    },
    createFor: (u: OnlineUser) => {
      invitee.current = u;
      void create();
    },
    dialogs: (
      <>
        {existing && (
          <ExistingRoomDialog
            code={existing}
            busy={busy}
            onReplace={() => create(true)}
            onClose={() => {
              invitee.current = null;
              setExisting(null);
            }}
          />
        )}
        {other.dialog}
      </>
    ),
  };
}

function CreateRoomCard({ profile, creator }: { profile: LocalProfile | null; creator: Creator }) {
  const t = useT();
  const needsSignIn = useNeedsSignInToCreate();
  const { machine, setMachine, roomLocale, setRoomLocale, withPassword, setWithPassword, password, setPassword, busy } = creator;
  /** Host, language and password stay folded away: the defaults suit most rooms. */
  const [showOptions, setShowOptions] = useState(false);

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
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold">➕ {t("lobby.createTitle")}</h2>
        <button
          type="button"
          className="btn-ghost btn-sm ml-auto"
          onClick={() => setShowOptions(!showOptions)}
          aria-expanded={showOptions}
        >
          {showOptions ? "▴" : "▾"} {t("lobby.options")}
        </button>
      </div>
      {!showOptions && (
        <div className="flex flex-wrap gap-1 text-[11px] text-white/60">
          <span className="chip py-0">{machine ? `🤖 ${t("lobby.machineHost")}` : `🎙️ ${t("lobby.humanHost")}`}</span>
          <span className="chip py-0">{roomLocale.toUpperCase()}</span>
          {withPassword && <span className="chip py-0">🔒 {t("lobby.usePassword")}</span>}
        </div>
      )}
      {showOptions && (
      <>
      <div>
        <span className="ui-label">{t("lobby.whoHosts")}</span>
        <div className="flex flex-col gap-2">
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
      </>
      )}
      {needsSignIn ? (
        <SignInToCreate />
      ) : (
        <button className="btn-primary py-3 text-lg" onClick={creator.create} disabled={busy || !profile}>
          {busy ? t("home.creating") : t("home.createButton")}
        </button>
      )}
    </section>
  );
}
