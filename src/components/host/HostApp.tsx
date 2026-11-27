"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionDot, LangSwitch, Spinner, toast } from "@/components/ui";
import { Ambient } from "@/lib/ambient";
import { SfxToggle } from "@/components/Sfx";
import { useLocale, useT } from "@/lib/i18n";
import { hasVoiceFor, speak, stopSpeaking, useTtsSupported, whenVoicesReady } from "@/lib/tts";
import { scriptLines } from "./common";
import { emitAck, getSocket, hostKey, storage } from "@/lib/socket";
import { getAuth, useAccount } from "@/lib/account";
import { useLobbyPresence, useRoomState } from "@/lib/useRoom";
import { HostGame } from "./HostGame";
import { HostLobby } from "./HostLobby";

export default function HostApp({ code }: { code: string }) {
  const t = useT();
  /** Why this page can't run the room (a message key), or false. */
  const [denied, setDenied] = useState<string | false>(false);
  const [hideRoles, setHideRoles] = useState(false);
  const [sound, setSound] = useState(false);
  const ambient = useRef<Ambient | null>(null);

  const resume = useCallback(async () => {
    const hostToken = storage.get<string>(hostKey(code));
    if (!hostToken) return setDenied("host.notHost");
    const res = await emitAck("host:resume", { code, hostToken, authToken: getAuth()?.token });
    if (!res.ok && res.error !== "err.disconnected") setDenied(res.error === "err.hostHandedOver" ? "host.handedOver" : "host.notHost");
  }, [code]);

  // The host was gone too long (or left for a new room): the next player took the room over.
  useEffect(() => {
    const s = getSocket();
    const ours = (e?: { code?: string }) => !e?.code || e.code === code;
    const replaced = (e?: { code?: string }) => ours(e) && setDenied("host.handedOver");
    const closed = (e?: { code?: string }) => ours(e) && setDenied("host.roomClosed");
    s.on("hostReplaced", replaced);
    s.on("roomClosed", closed);
    return () => {
      s.off("hostReplaced", replaced);
      s.off("roomClosed", closed);
    };
  }, [code]);

  const { state, connected, offset } = useRoomState(resume);
  // In the lobby: tell the server the host is still here; players may ask for bots.
  useLobbyPresence(state?.phase.kind === "lobby", (name) => toast(t("lobbyHelp.nudged", { name }), "info"));

  // Signing in or out on this page reconnects with the new account right away.
  const authToken = useAccount()?.token;
  const firstAuth = useRef(true);
  useEffect(() => {
    if (firstAuth.current) {
      firstAuth.current = false;
      return;
    }
    resume();
  }, [authToken, resume]);

  useEffect(() => {
    setHideRoles(storage.get<boolean>("msn:hideRoles") ?? false);
  }, []);

  // Music follows the phase (night = darker drone) and chimes on phase change.
  const phaseKey = state ? `${state.phase.kind}-${state.phase.night}-${state.phase.stepIndex}` : "";
  const isNight = state?.phase.kind === "night";
  useEffect(() => {
    if (!sound || !ambient.current) return;
    ambient.current.setMood(isNight ? "night" : "day");
    ambient.current.chime();
  }, [phaseKey, isNight, sound]);

  useEffect(() => () => ambient.current?.stop(), []);

  // Voice-over: read the narration aloud whenever it changes.
  const { locale } = useLocale();
  const canSpeakTts = useTtsSupported();
  const [voiceOver, setVoiceOver] = useState(false);
  useEffect(() => setVoiceOver(storage.get<boolean>("msn:voiceOver") ?? false), []);
  // How fast the narrator reads (also shortens the pauses and the silent reading time).
  const [voiceRate, setVoiceRate] = useState(1.25);
  useEffect(() => setVoiceRate(storage.get<number>("msn:voiceRate") ?? 1.25), []);

  // Remember the host's rules so the next room starts with the same settings.
  const settingsJson = state && state.viewer === "host" ? JSON.stringify(state.settings) : "";
  useEffect(() => {
    if (settingsJson) storage.set("msn:hostSettings", JSON.parse(settingsJson));
  }, [settingsJson]);
  // Never say out loud that a role has nobody left alive: that would tell the table who died.
  const silent = t("script.stepNobody");
  const lines = state && state.viewer === "host" ? scriptLines(state, t).filter((l) => l !== silent) : [];
  const linesKey = lines.join("|");
  const stepKey = state?.stepKey ?? "";
  useEffect(() => {
    if (!stepKey) return;
    // Tell the server when this step's narration is done, so the auto
    // narrator only moves on after it. Without voice-over, wait about as long
    // as reading it would take, so the timing is the same either way.
    let cancelled = false;
    const report = (done: boolean) => !cancelled && emitAck("host:narration", { key: stepKey, done });
    report(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (voiceOver && linesKey) speak(lines, locale, voiceRate, () => report(true));
    else {
      const words = linesKey.split(/\s+/).filter(Boolean).length;
      timer = setTimeout(() => report(true), linesKey ? (1500 + words * 350) / voiceRate : 0);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [linesKey, stepKey, voiceOver, locale, voiceRate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), []);

  async function toggleVoiceOver() {
    const next = !voiceOver;
    storage.set("msn:voiceOver", next);
    setVoiceOver(next);
    if (!next) return stopSpeaking();
    await whenVoicesReady();
    if (!hasVoiceFor(locale)) toast(t("host.noVoice", { lang: t(`lang.${locale}`) }), "info");
  }

  function toggleSound() {
    if (sound) {
      ambient.current?.stop();
      ambient.current = null;
      setSound(false);
    } else {
      ambient.current = new Ambient();
      ambient.current.start(isNight ? "night" : "day");
      setSound(true);
    }
  }

  function toggleHide() {
    setHideRoles((h) => {
      storage.set("msn:hideRoles", !h);
      return !h;
    });
  }

  if (denied)
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <LangSwitch />
        <div className="card max-w-md text-center">
          <div className="text-5xl">🔒</div>
          <p className="mt-4">{t(denied)}</p>
          <Link href="/" className="btn-gold mt-6">
            {t("host.goHome")}
          </Link>
        </div>
      </main>
    );

  return (
    <div className="min-h-dvh xl:flex xl:h-dvh xl:flex-col xl:overflow-hidden">
      <header className="sticky top-0 z-40 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-night-950/90 px-4 py-2 backdrop-blur">
        {(!state || state.phase.kind === "lobby") && <LangSwitch className="relative" />}
        <Link href="/" className="font-display text-xl font-black text-moon">
          {t("app.name")}
        </Link>
        <span className="rounded-lg bg-white/10 px-3 py-1 font-mono text-lg font-bold tracking-widest text-gold">{code}</span>
        <ConnectionDot connected={connected} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a className="btn-ghost btn-sm" href={`/screen/${code}`} target="_blank" rel="noreferrer">
            📽️ {t("host.openScreen")}
          </a>
          {state && (
            <button className="btn-ghost btn-sm" onClick={toggleHide} aria-pressed={hideRoles}>
              {hideRoles ? `🙈 ${t("host.showRoles")}` : `👁️ ${t("host.hideRoles")}`}
            </button>
          )}
          {canSpeakTts && (
            <button
              className={`btn-sm btn ${voiceOver ? "bg-gold text-night-950" : "btn-ghost"}`}
              onClick={toggleVoiceOver}
              aria-pressed={voiceOver}
              title={t("host.voiceOverAuto")}
            >
              🗣️ {t("host.voiceOver")}
            </button>
          )}
          <label className="flex items-center gap-1 text-xs text-white/70" title={t("host.voiceSpeed")}>
            ⏩
            <select
              className="ui-select w-auto py-1 text-xs"
              value={voiceRate}
              onChange={(e) => {
                const r = Number(e.target.value);
                storage.set("msn:voiceRate", r);
                setVoiceRate(r);
              }}
              aria-label={t("host.voiceSpeed")}
            >
              {[1, 1.25, 1.5, 1.75, 2].map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <SfxToggle className="btn-ghost btn-sm" withLabel />
          <button className={`btn-sm btn ${sound ? "bg-gold text-night-950" : "btn-ghost"}`} onClick={toggleSound} aria-pressed={sound}>
            {sound ? "🔊" : "🔈"} {t("host.sound")}
          </button>
        </div>
      </header>
      <div className="xl:min-h-0 xl:flex-1">
      {!state || state.viewer !== "host" ? (
        <Spinner label={t("common.loading")} />
      ) : state.phase.kind === "lobby" ? (
        <HostLobby state={state} hideRoles={hideRoles} />
      ) : (
        <>
          <RejoinRequests requests={state.rejoinRequests} />
          <HostGame state={state} offset={offset} hideRoles={hideRoles} />
        </>
      )}
      </div>
    </div>
  );
}

/** "X wants to rejoin" — the host lets a player back in from a new phone. */
function RejoinRequests({ requests }: { requests: { playerId: string; name: string }[] }) {
  const t = useT();
  if (!requests.length) return null;
  return (
    <div className="mb-3 flex flex-col gap-2">
      {requests.map((r) => (
        <div key={r.playerId} className="pulse-ring flex flex-wrap items-center gap-2 rounded-lg border border-gold/60 bg-night-900/90 px-3 py-2">
          <span className="flex-1 font-semibold">🔄 {t("host.rejoinAsk", { name: r.name })}</span>
          <button className="btn-primary btn-sm" onClick={() => emitAck("host:rejoin", { playerId: r.playerId, allow: true })}>
            {t("host.rejoinAllow")}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => emitAck("host:rejoin", { playerId: r.playerId, allow: false })}>
            {t("host.rejoinDeny")}
          </button>
        </div>
      ))}
    </div>
  );
}
