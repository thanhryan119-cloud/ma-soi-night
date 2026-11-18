"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionDot, LangSwitch, Spinner } from "@/components/ui";
import { Ambient } from "@/lib/ambient";
import { useT } from "@/lib/i18n";
import { emitAck, hostKey, storage } from "@/lib/socket";
import { useRoomState } from "@/lib/useRoom";
import { HostGame } from "./HostGame";
import { HostLobby } from "./HostLobby";

export default function HostApp({ code }: { code: string }) {
  const t = useT();
  const [denied, setDenied] = useState(false);
  const [hideRoles, setHideRoles] = useState(false);
  const [sound, setSound] = useState(false);
  const ambient = useRef<Ambient | null>(null);

  const resume = useCallback(async () => {
    const hostToken = storage.get<string>(hostKey(code));
    if (!hostToken) return setDenied(true);
    const res = await emitAck("host:resume", { code, hostToken });
    if (!res.ok && res.error !== "err.disconnected") setDenied(true);
  }, [code]);

  const { state, connected, offset } = useRoomState(resume);

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
          <p className="mt-4">{t("host.notHost")}</p>
          <Link href="/" className="btn-gold mt-6">
            {t("host.goHome")}
          </Link>
        </div>
      </main>
    );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-night-950/90 px-4 py-2 backdrop-blur">
        <Link href="/" className="font-display text-xl font-black text-moon">
          {t("app.name")}
        </Link>
        <span className="rounded-lg bg-white/10 px-3 py-1 font-mono text-lg font-bold tracking-widest text-gold">{code}</span>
        <ConnectionDot connected={connected} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a className="btn-ghost btn-sm" href={`/screen/${code}`} target="_blank" rel="noreferrer">
            📽️ {t("host.openScreen")}
          </a>
          {state && state.phase.kind !== "lobby" && (
            <button className="btn-ghost btn-sm" onClick={toggleHide} aria-pressed={hideRoles}>
              {hideRoles ? `🙈 ${t("host.showRoles")}` : `👁️ ${t("host.hideRoles")}`}
            </button>
          )}
          <button className={`btn-sm btn ${sound ? "bg-gold text-night-950" : "btn-ghost"}`} onClick={toggleSound} aria-pressed={sound}>
            {sound ? "🔊" : "🔈"} {t("host.sound")}
          </button>
          <LangSwitch className="relative" />
        </div>
      </header>
      {!state || state.viewer !== "host" ? (
        <Spinner label={t("common.loading")} />
      ) : state.phase.kind === "lobby" ? (
        <HostLobby state={state} />
      ) : (
        <HostGame state={state} offset={offset} hideRoles={hideRoles} />
      )}
    </div>
  );
}
