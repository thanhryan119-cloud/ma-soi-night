"use client";

// Player screen, designed to fit a phone in ONE frame: the page itself never
// scrolls. Grids shrink to fit any player count; long content (vote details,
// end-of-game timeline) lives in a panel that scrolls on its own.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NIGHT_STEP_ROLE, ROLES } from "@shared/roles";
import type { ClientState, MeView, PlayerView } from "@shared/views";
import { Avatar, ConnectionDot, RoleBadge, StyledName, TimerDisplay, phaseKeyOf, toast, useErrorToast, usePhaseEnter, useWide } from "@/components/ui";
import { CHAT_COLORS } from "@shared/cosmetics";
import { ProfileLink } from "../Profile";
import { RolesGrid, Timeline, WinnerBanner } from "@/components/GameOver";
import { VoteBreakdown, nominationOutcomeLine } from "@/components/VoteBreakdown";
import { scriptLines } from "@/components/host/common";
import { SocialPanel } from "@/components/SocialPanel";
import { RolesInPlay } from "@/components/RolesInPlay";
import { useSocial } from "@/lib/social";
import { ShareRoom } from "@/components/ShareRoom";
import { SceneArt } from "@/components/art/Woodcut";
import { CardBack, RoleCardFull } from "@/components/art/Tarot";
import { useLocale, useT } from "@/lib/i18n";
import { emitAck, playerKey, storage } from "@/lib/socket";
import { loadLocalProfile, saveLocalProfile, useAccount } from "@/lib/account";
import { RoomWindows } from "./RoomWindows";
import { useMyStats } from "@/lib/stats";
import { roleTier } from "@shared/achievements";
import { useRouter } from "next/navigation";
import { speak, stopSpeaking, ttsHeard, unlockTts, useTtsSupported } from "@/lib/tts";
import { LobbySetup, OwnerBar, OwnerSettings } from "./OwnerPanel";

type Props = { state: ClientState; offset: number; connected: boolean };
type Ctx = { state: ClientState; me: MeView; players: Map<string, PlayerView> };

/**
 * Desktop layout (1024 px and wider): players on the left, the phase in the
 * middle, the chat always open on the right, all in one screen. Phases that
 * carry their own chat on a phone leave it out here.
 */
const WideCtx = createContext(false);
const useWideLayout = () => useContext(WideCtx);

function usePlayerAction() {
  const showError = useErrorToast();
  return async (action: Record<string, unknown>) => showError(await emitAck("player:action", action));
}

const byId = (state: ClientState) => new Map(state.players.map((p) => [p.id, p]));

export function phaseLabel(t: ReturnType<typeof useT>, state: ClientState) {
  const k = state.phase.kind;
  if (k === "night") return t("phase.night", { n: state.phase.night });
  if (k === "dawn") return t("phase.dawn", { n: state.phase.day });
  return t(`phase.${k}`);
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export function PlayerGame({ state, offset, connected }: Props) {
  const t = useT();
  const me = state.me!;
  const players = byId(state);
  const self = players.get(me.id)!;
  const kind = state.phase.kind;
  const [sheet, setSheet] = useState<null | "role" | "roles" | "timeline" | "owner">(null);
  const mainRef = usePhaseEnter<HTMLElement>(phaseKeyOf(state.phase));
  const wide = useWide();

  // Vibrate when it becomes my turn to do something.
  const myTurn = !!(me.turn && !me.turn.done) || me.canVote || !!me.hunter?.canShoot;
  const prevTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !prevTurn.current) navigator.vibrate?.([120, 60, 120]);
    prevTurn.current = myTurn;
  }, [myTurn]);

  const canSeeRoles = !me.alive && kind !== "gameOver" && state.players.some((p) => p.id !== me.id && p.roleId);
  const showRoleButton = !!me.roleId && kind !== "gameOver" && kind !== "roleReveal";

  return (
    <WideCtx.Provider value={wide}>
    <div className={`fixed inset-0 flex flex-col overflow-hidden transition-colors duration-700`}>
      <header className={`flex shrink-0 items-center gap-2.5 border-b border-white/5 px-3 py-2 pr-28 ${wide ? "lg:px-6" : ""}`}>
        <ProfileLink playerId={self.id}>
          <Avatar p={self} size="sm" />
        </ProfileLink>
        <div className="min-w-0 flex-1 leading-tight">
          <RenameMe self={self} />
          <div className="truncate text-xs text-white/50">{phaseLabel(t, state)}</div>
        </div>
        {!connected && <ConnectionDot connected={false} />}
        {!wide && !INLINE_CHAT.has(kind) && <PhoneChatButton state={state} viewer={me.id} />}
        <RoomWindows state={state} />
        <LeaveButton state={state} />
      </header>

      {self.standIn && kind !== "gameOver" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-gold/30 bg-gold/10 px-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1">🤖 {t("player.standInYou")}</span>
          <button className="btn-primary btn-sm shrink-0" onClick={() => emitAck("player:action", { type: "back" })}>
            {t("player.standInBack")}
          </button>
        </div>
      )}

      {kind !== "lobby" && kind !== "gameOver" && (
        <div className={`mx-auto w-full shrink-0 px-3 pt-2 ${wide ? "max-w-[1600px] lg:px-4" : "max-w-md"}`}>
          <RolesInPlay state={state} />
        </div>
      )}

      {!me.alive && kind !== "gameOver" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-blood/30 bg-blood/10 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">💀 {t("player.spectator")}</span>
          {state.log && (
            <button className="btn-ghost btn-sm shrink-0" onClick={() => setSheet("timeline")}>
              📜 {t("screen.timeline")}
            </button>
          )}
          {canSeeRoles && (
            <button className="btn-ghost btn-sm shrink-0" onClick={() => setSheet("roles")}>
              {t("player.allRoles")}
            </button>
          )}
        </div>
      )}

      {wide ? (
        <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-[260px_minmax(0,1fr)_360px] gap-4 p-4 xl:grid-cols-[300px_minmax(0,1fr)_420px]">
          <PlayersPanel state={state} me={me} onRole={showRoleButton ? () => setSheet("role") : null} />
          <div className="flex min-h-0 flex-col gap-3">
            <NarrationBanner state={state} />
            <main ref={mainRef} className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg border border-white/10 bg-night-900/50 p-5">
              <PhaseBody
                state={state}
                me={me}
                offset={offset}
                players={players}
                onTimeline={() => setSheet("timeline")}
                onOwnerSettings={() => setSheet("owner")}
              />
            </main>
          </div>
          <SocialPanel state={state} viewer={me.id} className="min-h-0" />
        </div>
      ) : (
        <>
          <NarrationBanner state={state} />

          <main ref={mainRef} className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-3 py-3">
            <PhaseBody
              state={state}
              me={me}
              offset={offset}
              players={players}
              onTimeline={() => setSheet("timeline")}
              onOwnerSettings={() => setSheet("owner")}
            />
          </main>
        </>
      )}

      {showRoleButton && !wide && (
        <footer className="mx-auto w-full max-w-md shrink-0 border-t border-white/10 px-3 py-2">
          <button className="btn-ghost w-full" onClick={() => setSheet("role")}>
            🂠 {t("player.showRole")}
          </button>
        </footer>
      )}

      {sheet === "role" && (
        <Sheet onClose={() => setSheet(null)}>
          <RoleSheet state={state} me={me} players={players} />
        </Sheet>
      )}
      {sheet === "roles" && (
        <Sheet title={t("player.allRoles")} onClose={() => setSheet(null)}>
          <RolesGrid state={state} compact />
        </Sheet>
      )}
      {sheet === "owner" && state.machineHost && state.ownerId === me.id && kind === "lobby" && (
        <Sheet title={t("owner.settings")} onClose={() => setSheet(null)}>
          <OwnerSettings state={state} />
        </Sheet>
      )}
      {sheet === "timeline" && state.log && (
        <Sheet title={t("screen.timeline")} onClose={() => setSheet(null)}>
          <Timeline log={state.log} t={t} />
        </Sheet>
      )}
    </div>
    </WideCtx.Provider>
  );
}

/** Phones: the phases whose screen already shows the room chat. */
const INLINE_CHAT = new Set<string>(["lobby", "discussion", "defense", "verdict"]);

/**
 * Phones: on desktop the room chat is always in the right column; on a phone
 * the other phases get this button, with the unread count, opening it full screen.
 */
function PhoneChatButton({ state, viewer }: { state: ClientState; viewer: string }) {
  const t = useT();
  const { chat } = useSocial(state.code);
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState(() => Date.now());
  useEffect(() => {
    if (open) setSince(Date.now());
  }, [open, chat.length]);
  const unread = open ? 0 : chat.filter((m) => m.t > since && m.from !== viewer).length;
  return (
    <>
      <button
        type="button"
        className="btn-ghost btn-sm relative shrink-0 gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={t("social.title")}
        title={t("social.title")}
      >
        💬
        {unread > 0 && <span className="rounded-full bg-blood px-1.5 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <Sheet title={`💬 ${t("social.title")}`} onClose={() => setOpen(false)}>
          <SocialPanel state={state} viewer={viewer} className="min-h-0 flex-1" />
        </Sheet>
      )}
    </>
  );
}

/** Desktop: everyone in the room, with their chat colour, status and any role you may see. */
function PlayersPanel({ state, me, onRole }: { state: ClientState; me: MeView; onRole: (() => void) | null }) {
  const t = useT();
  const alive = state.players.filter((p) => p.alive).length;
  return (
    <aside className="tarot-frame flex min-h-0 flex-col overflow-hidden rounded-lg border border-gold/40 bg-night-900/85">
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-gold/25 px-2 py-1.5">
        <span className="text-gold/60">✦</span>
        <h3 className="font-display text-lg leading-none text-gold">{t("player.playersPanel")}</h3>
        <span className="text-sm text-white/60">{state.phase.kind === "lobby" ? state.players.length : `${alive}/${state.players.length}`}</span>
        <span className="text-gold/60">✦</span>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {state.players.map((p) => (
          <li key={p.id} className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${p.id === me.id ? "bg-white/10" : ""} ${p.alive ? "" : "opacity-50"}`}>
            <ProfileLink playerId={p.id} className="shrink-0">
              <Avatar p={p} size="sm" />
            </ProfileLink>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHAT_COLORS[p.chatColor % CHAT_COLORS.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">
              <ProfileLink playerId={p.id} className="max-w-full">
                <StyledName p={p} className="truncate" />
              </ProfileLink>
            </span>
            {/* Only roles the whole table knows: never your own or your pack mates, which someone could read off the screen. */}
            {p.roleId && p.id !== me.id && (!p.alive || p.noVote || state.phase.kind === "gameOver") && <RoleBadge roleId={p.roleId} />}
            <span className="shrink-0 text-xs">{!p.alive ? "💀" : p.isBot ? "🤖" : p.standIn ? <span title={t("player.standInBadge")}>🤖</span> : !p.connected ? <span className="text-white/40">⏸</span> : null}</span>
          </li>
        ))}
      </ul>
      {onRole && (
        <div className="shrink-0 border-t border-white/10 p-2">
          <button className="btn-ghost w-full" onClick={onRole}>
            🂠 {t("player.showRole")}
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * Leave the room. During a game it is for good: a bot takes the seat and it
 * counts as a loss, so it asks first.
 */
/** My name in the header, with a pencil to change it at any time (everyone is told). */
function RenameMe({ self }: { self: PlayerView }) {
  const t = useT();
  const showError = useErrorToast();
  const signedIn = !!useAccount()?.user;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(self.name);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === self.name) return setEditing(false);
    setBusy(true);
    const res = await emitAck("player:action", { type: "updateProfile", name: next });
    setBusy(false);
    if (!showError(res)) return;
    // The next room starts with this name too.
    const profile = loadLocalProfile();
    saveLocalProfile({ ...profile, name: next });
    setEditing(false);
  }

  if (editing)
    return (
      <form onSubmit={save} className="flex items-center gap-1">
        <input
          className="ui-input min-w-0 flex-1 px-2 py-1 text-sm"
          value={name}
          maxLength={24}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          aria-label={t("player.rename")}
        />
        <button className="btn-gold btn-sm shrink-0 px-2" disabled={busy || !name.trim()} aria-label={t("common.save")}>
          ✓
        </button>
        <button type="button" className="btn-ghost btn-sm shrink-0 px-2" onClick={() => setEditing(false)} aria-label={t("common.cancel")}>
          ✕
        </button>
      </form>
    );
  return (
    <div className="flex min-w-0 items-center gap-1 text-sm font-bold">
      <ProfileLink playerId={self.id} className="min-w-0">
        <StyledName p={self} className="truncate" />
      </ProfileLink>
      <button
        type="button"
        className="shrink-0 rounded px-1 text-xs text-white/50 hover:text-gold"
        onClick={() => {
          // Guests keep the name they joined with: changing it needs an account.
          if (!signedIn) return toast(t("err.signInToRename"), "info");
          setName(self.name);
          setEditing(true);
        }}
        title={signedIn ? t("player.rename") : t("err.signInToRename")}
        aria-label={t("player.rename")}
      >
        ✏️
      </button>
    </div>
  );
}

function LeaveButton({ state }: { state: ClientState }) {
  const t = useT();
  const router = useRouter();
  const showError = useErrorToast();
  const running = state.phase.kind !== "lobby" && state.phase.kind !== "gameOver";
  async function leave() {
    const dead = running && state.players.some((p) => p.id === state.me?.id && !p.alive);
    const ask = dead ? "player.leaveConfirmDead" : running ? "player.leaveConfirmGame" : "player.leaveConfirm";
    if (!confirm(t(ask))) return;
    const res = await emitAck("player:leave");
    if (!showError(res)) return;
    storage.remove(playerKey(state.code));
    router.push(state.machineHost ? "/lobby" : "/");
  }
  return (
    <button type="button" className="btn-ghost btn-sm shrink-0" onClick={leave} title={running ? t("player.leaveGame") : t("player.leave")}>
      🚪 {running ? t("player.leaveGame") : t("player.leave")}
    </button>
  );
}

/**
 * The narrator's words for the current step, as subtitles on every phone
 * (never the line saying a role has nobody left alive), with a speaker button
 * to hear them read aloud on this phone (on by default when the room has no shared screen).
 */
function NarrationBanner({ state }: { state: ClientState }) {
  const t = useT();
  const { locale } = useLocale();
  const canTts = useTtsSupported();
  // With no shared screen (machine-host rooms too) the phones are the only narrator,
  // so they speak unless this player turned it off; with a screen it stays quiet to avoid an echo.
  const noScreen = !!state.settings.noScreen;
  const [voice, setVoice] = useState(false);
  useEffect(() => setVoice(storage.get<boolean>("msn:phoneVoice") ?? noScreen), [noScreen]);
  // How fast this phone reads the narration (same choice and default as the host screen).
  const [rate, setRate] = useState(1.25);
  useEffect(() => setRate(storage.get<number>("msn:voiceRate") ?? 1.25), []);
  const silent = t("script.stepNobody");
  const lobby = state.phase.kind === "lobby";
  const off = lobby || state.phase.kind === "gameOver";
  const lines = off ? [] : scriptLines(state, t).filter((l) => l !== silent);
  const linesKey = lines.join("|");
  // Voice on without a tap yet: the phone may only speak after one, so the first tap
  // anywhere unlocks it and reads the current line again if nothing could be heard so far.
  const latest = useRef({ linesKey, locale, rate });
  latest.current = { linesKey, locale, rate };
  useEffect(() => {
    if (!voice) return;
    const once = () => {
      unlockTts();
      const l = latest.current;
      if (!ttsHeard() && l.linesKey) speak(l.linesKey.split("|"), l.locale, l.rate);
    };
    document.addEventListener("pointerdown", once, { once: true });
    return () => document.removeEventListener("pointerdown", once);
  }, [voice]);
  // Each phone can read the narration aloud for its player.
  useEffect(() => {
    if (!voice || !linesKey) return;
    speak(linesKey.split("|"), locale, rate);
    return () => stopSpeaking();
  }, [voice, linesKey, locale, rate]);
  // Before the game: just the speaker, so it can be turned on in advance.
  if (!lines.length && !(lobby && canTts)) return null;
  const toggle = () => {
    const next = !voice;
    storage.set("msn:phoneVoice", next);
    if (next) {
      // Start speaking inside this tap, or phones keep the voice muted.
      unlockTts();
      if (linesKey) speak(linesKey.split("|"), locale, rate);
    } else stopSpeaking();
    setVoice(next);
  };
  return (
    <div className="mx-auto w-full max-w-md shrink-0 px-3 pt-2">
      <div className="max-h-28 overflow-y-auto rounded-lg border border-gold/40 bg-night-900/80 px-3 py-2 text-sm leading-snug">
        {canTts && (
          <button
            type="button"
            onClick={toggle}
            className="float-right ml-2 rounded px-1.5 text-base"
            title={voice ? t("owner.voiceOff") : t("owner.voiceOn")}
            aria-pressed={voice}
          >
            {voice ? "🔊" : "🔇"}
          </button>
        )}
        {canTts && voice && (
          <select
            className="ui-select float-right ml-1 w-auto px-1 py-0 text-xs"
            value={rate}
            onChange={(e) => {
              const r = Number(e.target.value);
              storage.set("msn:voiceRate", r);
              setRate(r);
            }}
            aria-label={t("host.voiceSpeed")}
            title={t("host.voiceSpeed")}
          >
            {[1, 1.25, 1.5, 1.75, 2].map((r) => (
              <option key={r} value={r}>
                ⏩ {r}×
              </option>
            ))}
          </select>
        )}
        <span className="mr-1 font-bold text-gold">📜 {t("player.narration")}:</span>
        {lines.length ? lines.join(" ") : <span className="text-white/50">{t("player.narrationSoon")}</span>}
      </div>
    </div>
  );
}

/** Full-screen overlay; only its body scrolls. */
function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="rise absolute inset-0 z-50 flex flex-col bg-night-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <h3 className="min-w-0 flex-1 truncate font-bold">{title}</h3>
        <button className="btn-ghost btn-sm" onClick={onClose} aria-label={t("common.close")} title={t("common.close")}>
          ✕
        </button>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">{children}</div>
    </div>
  );
}

/** A full-height column that fills the free space (`scroll`: scrolls when its content is taller). */
const Fill = ({ children, center = false, scroll = false }: { children: React.ReactNode; center?: boolean; scroll?: boolean }) => (
  <section
    className={`flex min-h-0 flex-1 flex-col gap-3 ${center ? "items-center justify-center text-center" : ""} ${scroll ? "-mx-1 overflow-y-auto px-1" : ""}`}
  >
    {children}
  </section>
);

function PhaseBody({
  state,
  me,
  offset,
  players,
  onTimeline,
  onOwnerSettings,
}: Ctx & { offset: number; onTimeline: () => void; onOwnerSettings: () => void }) {
  const t = useT();
  const wide = useWideLayout();
  const ctx = { state, me, players };
  switch (state.phase.kind) {
    case "lobby":
      return <Lobby state={state} onOwnerSettings={onOwnerSettings} />;
    case "roleReveal":
      return (
        <Fill>
          <h2 className="shrink-0 text-center font-display text-2xl font-bold text-moon">{t("player.yourRole")}</h2>
          <HoldCard {...ctx} />
        </Fill>
      );
    case "night":
      return <Night {...ctx} />;
    case "dawn":
      return <Dawn {...ctx} />;
    case "hunter":
      return <Hunter {...ctx} />;
    case "discussion":
      return wide ? (
        <Fill center>
          <h2 className="font-display text-4xl font-bold text-moon">🗣️ {t("player.discussion")}</h2>
          <TimerDisplay timer={state.timer} offset={offset} className="text-6xl" />
          <SceneArt scene="discussion" className="w-full max-w-xl" />
          <p className="text-white/60">{t("player.chatOnRight")}</p>
        </Fill>
      ) : (
        <Fill>
          <div className="flex shrink-0 items-center gap-3">
            <h2 className="shrink-0 text-lg font-bold">🗣️ {t("player.discussion")}</h2>
            <div className="min-w-0 flex-1">
              <TimerDisplay timer={state.timer} offset={offset} className="text-3xl" />
            </div>
          </div>
          <SocialPanel state={state} viewer={me.id} className="flex-1" />
        </Fill>
      );
    case "nominate":
      return <Nominate {...ctx} />;
    case "nominateResult":
      return <NominateResult state={state} />;
    case "defense":
      return <Defense {...ctx} offset={offset} />;
    case "verdict":
      return <Verdict {...ctx} />;
    case "verdictResult":
      return <VerdictResult state={state} players={players} />;
    case "gameOver":
      return (
        <Fill>
          <div className="shrink-0">
            <WinnerBanner state={state} t={t} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 p-2">
            <RolesGrid state={state} compact />
          </div>
          <OwnerBar state={state} onSettings={onOwnerSettings} />
          <div className="flex shrink-0 gap-2">
            {state.log && (
              <button className="btn-ghost flex-1" onClick={onTimeline}>
                📜 {t("screen.timeline")}
              </button>
            )}
          </div>
          {!state.machineHost && <p className="shrink-0 text-center text-xs text-white/50">{t("player.wait")}</p>}
        </Fill>
      );
  }
}

/** The defense: everyone reads the chat, only the players on the stand can write — and end it early. */
function Defense({ state, me, players, offset }: Ctx & { offset: number }) {
  const t = useT();
  const wide = useWideLayout();
  const act = usePlayerAction();
  const done = !!me.defenseDone;
  return (
    <Fill>
      <div className="flex shrink-0 items-center gap-3">
        <h2 className="shrink-0 text-lg font-bold">⚖️ {t("player.defenseTitle")}</h2>
        <div className="min-w-0 flex-1">
          <TimerDisplay timer={state.timer} offset={offset} className="text-3xl" />
        </div>
      </div>
      <div className="shrink-0">
        <Nominees state={state} players={players} />
      </div>
      {me.onStand && <p className="shrink-0 rounded-lg bg-gold/20 px-3 py-1.5 text-center text-sm font-bold text-gold">{t("player.onStandYou")}</p>}
      {wide ? <div className="flex-1" /> : <SocialPanel state={state} viewer={me.id} className="min-h-0 flex-1" />}
      {me.onStand && me.alive && (
        <button className="btn-primary shrink-0 py-3" disabled={done} onClick={() => act({ type: "endDefense" })}>
          {done ? t("player.defenseEnded") : t("player.endDefense")}
        </button>
      )}
    </Fill>
  );
}

// ---------------------------------------------------------------------------
// Lobby & role card
// ---------------------------------------------------------------------------

function Lobby({ state, onOwnerSettings }: { state: ClientState; onOwnerSettings: () => void }) {
  const t = useT();
  const wide = useWideLayout();
  const iOwn = state.machineHost && state.ownerId === state.me?.id;
  // Phones: the bots and roles fold away so the chat always has room (the owner sees them open).
  const [setupOpen, setSetupOpen] = useState(!!iOwn);
  return (
    <Fill scroll={!wide}>
      <div className="flex shrink-0 items-center gap-3">
        <SceneArt scene="night" className="h-12 w-auto shrink-0" />
        <div className="min-w-0">
          <h2 className="truncate font-bold">{iOwn ? t("owner.setUp") : state.machineHost ? t("owner.waitingOwner") : t("player.waitingHost")}</h2>
          <p className="text-xs text-white/60">{t("player.inLobby", { count: state.players.length })}</p>
        </div>
      </div>
      <OwnerBar state={state} onSettings={onOwnerSettings} />
      {wide ? (
        <>
          <ShareRoom code={state.code} className="shrink-0" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LobbySetup state={state} />
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn-ghost btn-sm shrink-0 justify-between"
            onClick={() => setSetupOpen((o) => !o)}
            aria-expanded={setupOpen}
          >
            <span>🃏 {t("lobbySetup.toggle")}</span>
            <span aria-hidden>{setupOpen ? "▴" : "▾"}</span>
          </button>
          {setupOpen && (
            <>
              <ShareRoom code={state.code} className="shrink-0" />
              <div className="max-h-[38dvh] shrink-0 overflow-y-auto">
                <LobbySetup state={state} />
              </div>
            </>
          )}
          <AliveStrip state={state} />
          {state.me && <SocialPanel state={state} viewer={state.me.id} className="min-h-[50dvh] flex-1" />}
        </>
      )}
    </Fill>
  );
}

function AliveStrip({ state }: { state: ClientState }) {
  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1">
      {state.players.map((p) => (
        <ProfileLink key={p.id} playerId={p.id} className="shrink-0">
          <Avatar p={p} size="sm" />
        </ProfileLink>
      ))}
    </div>
  );
}

/**
 * Hold to reveal, release to hide — protects against peeking. The card back
 * shrinks to the free height; while it is held, the role card opens over the
 * whole screen (big enough to read at arm's length on a phone).
 */
function HoldCard({ me, players }: Ctx) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [tips, setTips] = useState(false);
  const role = me.roleId ? ROLES[me.roleId] : null;
  // Wins with this role (signed-in players) tint the card bronze, silver, gold or rainbow.
  const account = useAccount();
  const myStats = useMyStats(account?.user.id, true);
  const tier = role ? roleTier(myStats, role.id) : null;
  const show = (e?: React.PointerEvent<HTMLButtonElement>) => {
    // Keep the finger on this button even though the full-screen card now covers it.
    try {
      if (e) e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; releasing it still hides the card.
    }
    setOpen(true);
    navigator.vibrate?.(20);
  };
  const hide = () => setOpen(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-2">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <button
          type="button"
          className="no-select relative h-full max-h-[560px] max-w-full touch-none rounded-[14px]"
          style={{ aspectRatio: "3 / 5" }}
          onPointerDown={show}
          onPointerUp={hide}
          onPointerCancel={hide}
          onLostPointerCapture={hide}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && show()}
          onKeyUp={hide}
          onBlur={hide}
          aria-label={t("player.holdToReveal")}
        >
          <CardBack className="absolute inset-0 h-full w-full" />
          <span className="absolute inset-x-0 bottom-[14%] mx-auto w-fit rounded bg-night-950/80 px-3 py-1 text-sm font-bold text-gold">
            {t("player.holdToReveal")}
          </span>
        </button>
      </div>
      <p className="shrink-0 text-sm text-white/50">{open ? t("player.releaseToHide") : t("player.holdToReveal")}</p>
      {role && (
        <div className="w-full max-w-md shrink-0">
          <button
            type="button"
            className="mx-auto block rounded-full border border-gold/40 px-3 py-1 text-xs font-semibold text-gold"
            onClick={() => setTips((v) => !v)}
            aria-expanded={tips}
          >
            {tips ? t("player.tipsHide") : t("player.tipsShow")}
          </button>
          {tips && (
            <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto rounded-lg bg-white/5 py-2 pr-3 pl-7 text-left text-sm leading-snug text-white/80">
              {t(`roles.${role.id}.tips`)
                .split("\n")
                .map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
            </ul>
          )}
        </div>
      )}
      {role &&
        open &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black p-3">
            <div className="role-flip-in" style={{ aspectRatio: "3 / 5", height: "min(calc(100dvh - 24px), calc((100vw - 24px) * 5 / 3))" }}>
              <RoleCardFull role={role.id} tier={tier} className="h-full w-full">
                <div className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">{t(`teams.${role.team}`)}</div>
                <p className="mt-1 text-base leading-snug text-white">{t(`roles.${role.id}.desc`)}</p>
                {role.team === "wolves" && (
                  <div className="mt-1.5 text-sm">
                    <div className="font-bold text-blood-light">{t(role.id === "minion" ? "player.minionPack" : "player.teammates")}</div>
                    {me.teammates.length ? me.teammates.map((id) => players.get(id)?.name).join(", ") : t("player.noTeammates")}
                  </div>
                )}
                {role.id === "sister" && me.teammates.length > 0 && (
                  <div className="mt-1.5 text-sm">
                    <div className="font-bold text-pink-300">{t("player.sisters")}</div>
                    {me.teammates.map((id) => players.get(id)?.name).join(", ")}
                  </div>
                )}
                {me.wildModelId && !me.wildTurned && (
                  <div className="mt-1.5 text-sm text-lime-300">{t("player.wildModel", { name: players.get(me.wildModelId)?.name ?? "?" })}</div>
                )}
                {me.wildTurned && me.wildModelId && (
                  <div className="mt-1.5 text-sm text-blood-light">{t("player.wildTurnedDesc", { name: players.get(me.wildModelId)?.name ?? "?" })}</div>
                )}
                {me.loverId && (
                  <div className="mt-1.5 text-sm text-pink-300">{t("player.yourLover", { name: players.get(me.loverId)?.name ?? "?" })}</div>
                )}
              </RoleCardFull>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function RoleSheet(ctx: Ctx) {
  const t = useT();
  const { me, players } = ctx;
  return (
    <>
      <div className="flex h-[min(60dvh,480px)] shrink-0 flex-col">
        <HoldCard {...ctx} />
      </div>
      {me.seerResults.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-bold">
            {me.roleId === "medium" ? `🕯️ ${t("player.mediumHistory")}` : `${me.roleId === "wolfSeer" ? "👁️" : "🔮"} ${t("player.seerHistory")}`}
          </h4>
          <ul className="space-y-1 text-sm">
            {me.seerResults.map((r, i) => (
              <li key={i} className={r.isWolf ? "text-blood-light" : "text-emerald-300"}>
                {t("phase.night", { n: r.night })}:{" "}
                {r.roleId
                  ? t("player.wolfSeerSaw", { name: players.get(r.targetId)?.name ?? "?", role: t(`roles.${r.roleId}.name`) })
                  : t(r.isWolf ? "player.seerIsWolf" : "player.seerNotWolf", { name: players.get(r.targetId)?.name ?? "?" })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Target grid — always fits the free height, whatever the player count.
// ---------------------------------------------------------------------------

function TargetGrid({
  players,
  ids,
  selected,
  onPick,
  marks,
  disabled,
}: {
  players: Map<string, PlayerView>;
  ids: string[];
  selected: string[];
  onPick: (id: string) => void;
  marks?: Record<string, React.ReactNode>;
  disabled?: boolean;
}) {
  const n = ids.length;
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(n / cols));
  const dense = n > 9;
  return (
    <div
      className="grid min-h-0 flex-1 content-start gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, ${dense ? 84 : 104}px))`,
      }}
    >
      {ids.map((id) => {
        const p = players.get(id);
        if (!p) return null;
        const sel = selected.includes(id);
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(id)}
            className={`relative flex min-h-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border px-1 text-center transition active:scale-95 ${
              sel ? "border-gold bg-gold/15" : "border-white/10 bg-white/5 hover:bg-white/10"
            } disabled:opacity-60`}
            aria-pressed={sel}
          >
            <Avatar p={p} size={dense ? "sm" : "md"} />
            <span className={`line-clamp-1 w-full leading-tight font-semibold ${dense ? "text-[11px]" : "text-xs"}`}>
              <StyledName p={p} />
            </span>
            {marks?.[id] && <span className="absolute top-0.5 right-0.5 text-[10px]">{marks[id]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Bottom action row (one or two buttons side by side). */
const Actions = ({ children }: { children: React.ReactNode }) => <div className="flex shrink-0 gap-2">{children}</div>;

// ---------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------

/**
 * "Please close your eyes" filling the phone screen. Shown the moment a player
 * confirms their night action (and to everyone else at night), so every
 * phone looks the same from across the table.
 */
function CloseEyes({ children }: { children?: React.ReactNode }) {
  const t = useT();
  const words = t("player.closeEyesNow").split(" ");
  return (
    <Fill center>
      {children}
      <div className="rise flex min-h-0 w-full flex-1 flex-col items-center justify-center text-center">
        <span aria-hidden className="mb-3 text-[14vw] leading-none sm:text-6xl">🌙</span>
        <h2 className="font-display text-[19vw] leading-[0.95] font-bold text-moon sm:text-8xl">
          {words.map((w, i) => (
            <span key={i} className="block">
              {w}
            </span>
          ))}
        </h2>
      </div>
    </Fill>
  );
}

function Night(ctx: Ctx) {
  const { state, me } = ctx;
  const stepKey = `${state.phase.night}-${state.phase.stepIndex}`;
  if (me.turn) return <NightTurn key={stepKey} {...ctx} />;
  if (me.decoy) return <Decoy key={stepKey} {...ctx} />;
  return <CloseEyes />;
}

function NightTitle({ night }: { night: number }) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center justify-center gap-2">
      <div className="moon h-6 w-6 rounded-full opacity-80" aria-hidden />
      <h2 className="font-display text-xl font-bold text-moon">{t("phase.night", { n: night })}</h2>
    </div>
  );
}

function Decoy({ state, me, players }: Ctx) {
  const t = useT();
  const [sel, setSel] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const ids = state.players.filter((p) => p.alive && p.id !== me.id).map((p) => p.id);
  if (done) return <CloseEyes />;
  return (
    <Fill>
      <NightTitle night={state.phase.night} />
      <p className="shrink-0 text-center text-sm font-semibold">{done ? t("player.decoyDone") : t("player.decoyTitle")}</p>
      <TargetGrid players={players} ids={ids} selected={sel} onPick={(id) => setSel([id])} disabled={done} />
      <Actions>
        <button className="btn-primary flex-1 py-3" disabled={!sel.length || done} onClick={() => setDone(true)}>
          {t("player.confirm")}
        </button>
      </Actions>
      <p className="shrink-0 text-center text-[11px] text-white/40">{t("player.decoyHint")}</p>
    </Fill>
  );
}

/** The wolves always see who their pack is when they wake (and whom each one is going for). */
function PackStrip({ me, players, pack }: { me: MeView; players: Map<string, PlayerView>; pack: Record<string, string> }) {
  const t = useT();
  const mates = me.teammates.map((id) => players.get(id)).filter((p): p is PlayerView => !!p);
  const alive = mates.filter((p) => p.alive);
  return (
    <div className="shrink-0 rounded-lg border border-blood/40 bg-blood/10 px-2 py-1.5">
      <div className="mb-1 text-[11px] font-bold tracking-wide text-blood-light uppercase">
        🐺 {t("player.pack")} {!alive.length && <span className="font-normal normal-case text-white/60">· {t("player.lastWolf")}</span>}
      </div>
      {mates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mates.map((p) => {
            const target = pack[p.id] ? players.get(pack[p.id]) : null;
            return (
              <span key={p.id} className={`flex min-w-0 items-center gap-1.5 rounded-full bg-night-900/70 py-0.5 pr-2 pl-0.5 text-xs ${p.alive ? "" : "opacity-50"}`}>
                <Avatar p={p} size="sm" />
                <span className="truncate font-semibold">
                  <StyledName p={p} />
                </span>
                {target && p.alive && <span className="shrink-0 text-white/60">→ {target.name}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TurnBanner({ roleId, extra }: { roleId: NonNullable<MeView["roleId"]>; extra?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="pulse-ring shrink-0 rounded-lg border border-blood/50 bg-blood/10 px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-2 text-xs font-bold text-blood-light">
        {t("player.yourTurn")} <RoleBadge roleId={roleId} />
      </div>
      <p className="mt-1 text-base font-semibold leading-snug">{t(`roles.${roleId}.action`)}</p>
      {extra}
    </div>
  );
}

function NightTurn({ state, me, players }: Ctx) {
  const t = useT();
  const act = usePlayerAction();
  const turn = me.turn!;
  const [sel, setSel] = useState<string[]>(turn.selected);
  const [poison, setPoison] = useState<string | null>(null);
  const [save, setSave] = useState(false);
  const roleId = me.roleId!;

  if (turn.done) {
    const last = turn.step === "seer" || turn.step === "wolfSeer" || turn.step === "medium" ? me.seerResults[me.seerResults.length - 1] : null;
    return (
      <CloseEyes>
        {last && last.night === state.phase.night && (
          <div
            className={`rise shrink-0 rounded-lg border p-4 text-lg font-bold ${
              last.isWolf ? "border-blood bg-blood/20 text-blood-light" : "border-emerald-500 bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {last.roleId
              ? t("player.wolfSeerSaw", { name: players.get(last.targetId)?.name ?? "?", role: t(`roles.${last.roleId}.name`) })
              : t(last.isWolf ? "player.seerIsWolf" : "player.seerNotWolf", { name: players.get(last.targetId)?.name ?? "?" })}
          </div>
        )}
        {turn.step === "werewolf" && <div className="shrink-0 text-base font-bold text-emerald-300">✓ {t("player.packAgree")}</div>}
        {turn.step === "werewolf" && <PackStrip me={me} players={players} pack={turn.packVotes ?? {}} />}
      </CloseEyes>
    );
  }

  if (turn.kind === "curse" && turn.curse) {
    const c = turn.curse;
    const victim = c.victimId ? players.get(c.victimId) : null;
    const can = c.available && !!victim;
    return (
      <Fill>
        <TurnBanner roleId={NIGHT_STEP_ROLE[turn.step]} />
        <div className="flex shrink-0 flex-col items-center gap-2 rounded-lg border border-blood/40 bg-blood/10 p-3 text-center">
          {victim ? (
            <>
              <Avatar p={victim} size="lg" />
              <p className="text-base font-semibold">{t("player.curseVictim", { name: victim.name })}</p>
            </>
          ) : (
            <p className="text-sm">{t("player.curseNoVictim")}</p>
          )}
          {!c.available && <p className="text-sm text-white/60">{t("player.curseSpent")}</p>}
        </div>
        <div className="flex-1" />
        <Actions>
          <button className="btn-ghost flex-1 py-3" onClick={() => act({ type: "night", curse: false })}>
            {t("player.curseNo")}
          </button>
          {can && (
            <button className="btn flex-1 bg-blood py-3 font-bold text-white" onClick={() => act({ type: "night", curse: true })}>
              {t("player.curseYes")}
            </button>
          )}
        </Actions>
      </Fill>
    );
  }

  if (turn.kind === "arson" && turn.arson) {
    const a = turn.arson;
    const marks: Record<string, React.ReactNode> = {};
    for (const id of a.doused) marks[id] = <span className="rounded bg-orange-600/90 px-1 py-0.5">🛢️</span>;
    return (
      <Fill>
        <TurnBanner
          roleId="arsonist"
          extra={<p className="mt-0.5 text-[11px] text-white/70">{t("player.dousedCount", { count: a.doused.length })}</p>}
        />
        <TargetGrid players={players} ids={turn.targets} selected={sel} marks={marks} onPick={(id) => setSel(sel[0] === id ? [] : [id])} />
        <Actions>
          <button className="btn-ghost flex-1" onClick={() => act({ type: "night", targets: [] })}>
            {t("player.pass")}
          </button>
          {a.doused.length > 0 && (
            <button className="btn flex-1 bg-orange-600 font-bold text-white" onClick={() => act({ type: "night", ignite: true })}>
              🔥 {t("player.ignite")}
            </button>
          )}
          <button className="btn-primary flex-1 py-3" disabled={sel.length !== 1} onClick={() => act({ type: "night", targets: sel })}>
            🛢️ {t("player.douse")}
          </button>
        </Actions>
      </Fill>
    );
  }

  if (turn.kind === "witch" && turn.witch) {
    const w = turn.witch;
    const victim = w.victimId ? players.get(w.victimId) : null;
    const canSave = w.heal && !!victim && (w.canSelfSave || w.victimId !== me.id);
    return (
      <Fill>
        <TurnBanner roleId={roleId} />
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 p-2">
          {victim ? (
            <>
              <Avatar p={victim} size="md" />
              <p className="min-w-0 flex-1 text-sm leading-snug">{t("player.witchVictim", { name: victim.name })}</p>
              <button
                className={`btn btn-sm shrink-0 ${save ? "bg-emerald-500 text-night-950" : "btn-ghost"}`}
                disabled={!canSave}
                onClick={() => {
                  setSave(!save);
                  if (!save && !w.bothAllowed) setPoison(null);
                }}
              >
                💚 {w.heal ? `${save ? "✓ " : ""}${t("player.heal")}` : t("player.potionUsed")}
              </button>
            </>
          ) : (
            <p className="text-sm">{t("player.witchNoVictim")}</p>
          )}
        </div>
        <p className="shrink-0 text-sm font-semibold">
          ☠️ {t("player.witchPoison")} {!w.poison && <span className="font-normal text-white/50">{t("player.potionUsed")}</span>}
        </p>
        {w.poison ? (
          <TargetGrid
            players={players}
            ids={turn.targets}
            selected={poison ? [poison] : []}
            onPick={(id) => {
              setPoison(poison === id ? null : id);
              if (!w.bothAllowed) setSave(false);
            }}
          />
        ) : (
          <div className="flex-1" />
        )}
        <Actions>
          {w.poison && (
            <button className="btn-ghost flex-1" onClick={() => setPoison(null)}>
              {t("player.witchNoPoison")}
            </button>
          )}
          <button className="btn-primary flex-1 py-3" onClick={() => act({ type: "night", save, poisonId: poison })}>
            {t("player.confirm")}
          </button>
        </Actions>
      </Fill>
    );
  }

  if (turn.step === "werewolf") {
    const pack = turn.packVotes ?? {};
    const byTarget: Record<string, string[]> = {};
    for (const [wolfId, target] of Object.entries(pack)) (byTarget[target] ??= []).push(wolfId);
    const marks: Record<string, React.ReactNode> = {};
    for (const [target, wolves] of Object.entries(byTarget))
      marks[target] = <span className="rounded bg-blood/90 px-1 py-0.5">🐺{wolves.length}</span>;
    const agreed = Object.keys(pack).length > 0 && new Set(Object.values(pack)).size === 1;
    return (
      <Fill>
        <TurnBanner
          roleId="werewolf"
          extra={
            <p className="mt-0.5 text-[11px] text-white/70">
              {Object.keys(pack).length > 0 && !agreed
                ? t("player.packDisagree")
                : state.settings.wolvesMustBite !== false
                  ? t("player.mustBite")
                  : t("player.packPicks")}
            </p>
          }
        />
        <PackStrip me={me} players={players} pack={pack} />
        <TargetGrid players={players} ids={turn.targets} selected={turn.selected} marks={marks} onPick={(id) => act({ type: "night", targets: [id] })} />
      </Fill>
    );
  }

  const max = turn.picks;
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : max === 1 ? [id] : [...s, id].slice(-max)));
  return (
    <Fill>
      <TurnBanner roleId={NIGHT_STEP_ROLE[turn.step] ?? roleId} extra={max > 1 ? <p className="text-[11px] text-white/70">{t("player.pickTwo")}</p> : null} />
      {turn.targets.length ? (
        <TargetGrid players={players} ids={turn.targets} selected={sel} onPick={toggle} />
      ) : (
        <p className="flex-1 text-center text-sm text-white/60">{t("player.noTargets")}</p>
      )}
      <Actions>
        {turn.optional && (
          <button className="btn-ghost flex-1" onClick={() => act({ type: "night", targets: [] })}>
            {t("player.pass")}
          </button>
        )}
        {turn.targets.length > 0 && (
          <button className="btn-primary flex-1 py-3" disabled={sel.length !== max} onClick={() => act({ type: "night", targets: sel })}>
            {t("player.confirm")}
          </button>
        )}
      </Actions>
    </Fill>
  );
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

function Dawn({ state, me, players }: Ctx) {
  const t = useT();
  const deaths = state.lastDeaths;
  const iDied = deaths.some((d) => d.playerId === me.id);
  return (
    <Fill center>
      <SceneArt scene="dawn" className="w-full max-w-[260px]" />
      <h2 className="font-display text-3xl font-bold text-moon">{t("player.dawn")}</h2>
      {iDied && <p className="rounded-lg bg-blood/25 px-4 py-2 text-xl font-bold text-blood-light">{t("player.youDied")}</p>}
      {state.players.filter((p) => p.silenced).map((p) => (
        <p key={p.id} className="rise rounded-lg border border-rose-400/50 bg-rose-500/15 px-4 py-2 text-center text-sm font-semibold text-rose-200">
          🤐 {p.id === me.id ? t("player.youSilenced") : t("player.silencedToday", { name: p.name })}
        </p>
      ))}
      {me.wildTurned && state.phase.day === me.wildTurned.day + 1 && (
        <div className="rise max-w-sm rounded-lg border border-blood bg-blood/20 px-4 py-3 text-center">
          <p className="text-xl font-bold text-blood-light">{t("player.wildTurnedTitle")}</p>
          <p className="mt-1 text-sm leading-snug">{t("player.wildTurnedDesc", { name: players.get(me.wildModelId ?? "")?.name ?? "?" })}</p>
        </div>
      )}
      {me.cursedNight !== null && me.cursedNight === state.phase.day && (
        <div className="rise max-w-sm rounded-lg border border-blood bg-blood/20 px-4 py-3 text-center">
          <p className="text-xl font-bold text-blood-light">{t("player.cursedTitle")}</p>
          <p className="mt-1 text-sm leading-snug">{t("player.cursedDesc")}</p>
        </div>
      )}
      {deaths.length ? (
        <>
          <p className="text-white/70">{t("player.diedLastNight")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {deaths.map((d) => {
              const p = players.get(d.playerId);
              return p ? (
                <div key={d.playerId} className="flex flex-col items-center gap-1">
                  <ProfileLink playerId={p.id}>
                    <Avatar p={p} size="lg" />
                  </ProfileLink>
                  <ProfileLink playerId={p.id} className="font-semibold">
                    <StyledName p={p} />
                  </ProfileLink>
                  {p.roleId && <RoleBadge roleId={p.roleId} />}
                </div>
              ) : null;
            })}
          </div>
        </>
      ) : (
        <p className="text-xl text-emerald-300">{t("player.peacefulNight")}</p>
      )}
      <p className="text-sm text-white/40">{t("player.lookUp")}</p>
    </Fill>
  );
}

function Hunter({ state, me, players }: Ctx) {
  const t = useT();
  const act = usePlayerAction();
  const [sel, setSel] = useState<string | null>(null);
  if (me.hunter?.canShoot)
    return (
      <Fill>
        <div className="pulse-ring shrink-0 rounded-lg border border-blood/50 bg-blood/10 p-3 text-center">
          <p className="font-bold">🏹 {t("player.hunterYou")}</p>
        </div>
        <TargetGrid players={players} ids={me.hunter.targets} selected={sel ? [sel] : []} onPick={setSel} />
        <Actions>
          <button className="btn-ghost flex-1" onClick={() => act({ type: "hunterShot", targetId: null })}>
            {t("player.hunterNoShot")}
          </button>
          <button className="btn-primary flex-1 py-3" disabled={!sel} onClick={() => act({ type: "hunterShot", targetId: sel })}>
            {t("player.confirm")}
          </button>
        </Actions>
      </Fill>
    );
  const shotName = state.hunterShot ? players.get(state.hunterShot)?.name : null;
  return (
    <Fill center>
      <SceneArt scene="hunter" className="w-full max-w-xs" />
      <p className="text-xl font-bold">
        {state.hunterShot === null
          ? t("player.hunterWaiting")
          : shotName
            ? t("script.hunterShot", { name: shotName })
            : t("script.hunterMissed")}
      </p>
    </Fill>
  );
}

function VoteProgress({ state }: { state: ClientState }) {
  const t = useT();
  const v = state.vote;
  if (!v) return null;
  const pct = v.eligible ? (v.voted / v.eligible) * 100 : 0;
  return (
    <div className="w-full shrink-0">
      <div className="mb-1 text-center text-xs text-white/60">{t("player.voteProgress", { voted: v.voted, eligible: v.eligible })}</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gold transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Nominate({ state, me, players }: Ctx) {
  const t = useT();
  const act = usePlayerAction();
  const [sel, setSel] = useState<string | null>(null);
  const v = state.vote;
  const ids = useMemo(
    () => (v?.candidates ?? state.players.filter((p) => p.alive).map((p) => p.id)).filter((id) => id !== me.id),
    [v?.candidates, state.players, me.id],
  );
  const title = v?.candidates ? t("player.revoteTitle") : t("player.nominateTitle");
  if (me.myVote || !me.canVote)
    return (
      <Fill center>
        <div className="text-5xl">🗳️</div>
        <p className="text-xl font-bold">
          {!me.myVote
            ? title
            : me.myVote === "skip"
              ? t("player.votedSkip")
              : t("player.votedFor", { name: players.get(me.myVote)?.name ?? "?" })}
        </p>
        {me.lostVote && <p className="text-sm text-teal-300">{t("player.lostVote")}</p>}
        <VoteProgress state={state} />
      </Fill>
    );
  return (
    <Fill>
      <div className="shrink-0 text-center">
        <h2 className="text-xl font-bold">{title}</h2>
        {state.settings.mandatoryVote && <p className="text-xs text-blood-light">{t("player.mustVote")}</p>}
      </div>
      <TargetGrid players={players} ids={ids} selected={sel ? [sel] : []} onPick={setSel} />
      <Actions>
        {!state.settings.mandatoryVote && (
          <button className="btn-ghost flex-1" onClick={() => act({ type: "vote", choice: "skip" })}>
            {t("player.skip")}
          </button>
        )}
        <button className="btn-primary flex-1 py-3" disabled={!sel} onClick={() => sel && act({ type: "vote", choice: sel })}>
          {t("player.confirm")}
        </button>
      </Actions>
      <VoteProgress state={state} />
    </Fill>
  );
}

function Nominees({ state, players }: { state: ClientState; players: Map<string, PlayerView> }) {
  const t = useT();
  if (!state.nominees.length) return <p className="text-white/60">{t("player.noNominees")}</p>;
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {state.nominees.map((id) => {
        const p = players.get(id);
        return p ? (
          <div key={id} className="flex flex-col items-center gap-1">
            <ProfileLink playerId={p.id}>
              <Avatar p={p} size="lg" />
            </ProfileLink>
            <ProfileLink playerId={p.id} className="font-bold">
              <StyledName p={p} />
            </ProfileLink>
            {state.nomination && <span className="text-xs text-white/50">{state.nomination.counts[id] ?? 0} 🗳️</span>}
          </div>
        ) : null;
      })}
    </div>
  );
}

function Verdict({ state, me, players }: Ctx) {
  const t = useT();
  const act = usePlayerAction();
  const nominee = state.vote?.nomineeId ? players.get(state.vote.nomineeId) : null;
  // Online rooms: the defender can still plead in the chat while everyone votes
  // (on a desktop the chat is already open on the right).
  const wide = useWideLayout();
  const chat = !wide;
  return (
    <Fill>
      {nominee && (
        <div className={`flex shrink-0 items-center gap-2 text-center ${chat ? "justify-center" : "flex-col"}`}>
          <Avatar p={nominee} size={chat ? "lg" : "xl"} />
          <h2 className="text-xl font-bold">{t("player.verdictTitle", { name: nominee.name })}</h2>
        </div>
      )}
      {me.onStand ? (
        <div className={`flex items-center justify-center ${chat ? "shrink-0" : "flex-1"}`}>
          <p className="rounded-lg bg-gold/20 px-4 py-3 text-center font-bold text-gold">{t("player.onStandNoVote")}</p>
        </div>
      ) : me.myVote ? (
        <div className={`flex items-center justify-center ${chat ? "shrink-0" : "flex-1"}`}>
          <p className="text-xl font-bold">{me.myVote === "execute" ? t("player.votedExecute") : t("player.votedSpare")}</p>
        </div>
      ) : me.canVote ? (
        <div className={`grid min-h-0 grid-cols-2 gap-3 ${chat ? "shrink-0" : "flex-1"}`} style={{ maxHeight: chat ? 120 : 220, height: chat ? 120 : undefined }}>
          <button className="btn h-full flex-col bg-blood text-2xl font-black text-white" onClick={() => act({ type: "vote", choice: "execute" })}>
            <span className="text-4xl">🪢</span>
            {t("player.execute")}
          </button>
          <button className="btn h-full flex-col bg-emerald-500 text-2xl font-black text-night-950" onClick={() => act({ type: "vote", choice: "spare" })}>
            <span className="text-4xl">🕊️</span>
            {t("player.spare")}
          </button>
        </div>
      ) : me.lostVote ? (
        <div className={`flex items-center justify-center ${chat ? "shrink-0" : "flex-1"}`}>
          <p className="rounded-lg bg-teal-500/15 px-4 py-3 text-center font-bold text-teal-300">{t("player.lostVote")}</p>
        </div>
      ) : (
        !chat && <div className="flex-1" />
      )}
      <VoteProgress state={state} />
      {chat && <SocialPanel state={state} viewer={me.id} className="min-h-0 flex-1" />}
    </Fill>
  );
}

function VerdictResult({ state, players }: { state: ClientState; players: Map<string, PlayerView> }) {
  const t = useT();
  const r = state.verdicts[state.verdicts.length - 1];
  if (!r) return null;
  const p = players.get(r.nomineeId);
  return (
    <Fill>
      <div className="flex shrink-0 items-center gap-3">
        {p && <Avatar p={p} size="lg" />}
        <div className="min-w-0 flex-1">
          <h2 className={`font-display text-2xl font-black ${r.idiotRevealed ? "text-teal-300" : r.executed ? "text-blood-light" : "text-emerald-300"}`}>
            {r.idiotRevealed ? t("player.idiotRevealed") : r.executed ? t("screen.executed") : t("screen.spared")}
          </h2>
          <p className="text-sm leading-snug">
            {r.idiotRevealed
              ? t("player.idiotRevealedDesc", { name: p?.name ?? "?" })
              : t(r.executed ? "script.verdictExecuted" : "script.verdictSpared", { name: p?.name ?? "?", execute: r.execute, spare: r.spare })}
          </p>
          {r.deaths
            .filter((d) => d.playerId !== r.nomineeId)
            .map((d) => (
              <p key={d.playerId} className="text-sm text-pink-300">
                💔 {players.get(d.playerId)?.name}
              </p>
            ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <VoteBreakdown state={state} t={t} />
      </div>
    </Fill>
  );
}

function NominateResult({ state }: { state: ClientState }) {
  const t = useT();
  const outcome = nominationOutcomeLine(state);
  return (
    <Fill>
      <div className="shrink-0 text-center">
        <h2 className="text-xl font-bold">🗳️ {t("phase.nominateResult")}</h2>
        {outcome && <p className="text-sm font-semibold text-gold">{t(outcome.k, outcome.params)}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <VoteBreakdown state={state} t={t} />
      </div>
    </Fill>
  );
}
