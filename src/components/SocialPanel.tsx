"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BOARD_COLORS, BRUSH_SIZES, SOCIAL_PHASES, STROKE_MAX_POINTS, type Stroke } from "@shared/social";
import type { ClientState, PlayerView } from "@shared/views";
import { useT } from "@/lib/i18n";
import { useSocial } from "@/lib/social";
import { storage } from "@/lib/socket";
import { useVoice } from "@/lib/voice";
import { Avatar, ChatBubble, StyledName, useErrorToast } from "./ui";
import { ProfileLink } from "./Profile";

/** Who is using the panel: the host, or a player id. */
export function SocialPanel({ state, viewer, className = "" }: { state: ClientState; viewer: "host" | string; className?: string }) {
  const t = useT();
  const social = useSocial(state.code);
  const players = new Map(state.players.map((p) => [p.id, p]));
  const isHost = viewer === "host";
  const me = isHost ? null : players.get(viewer);
  // Online rooms: the players on the stand keep the chat during the verdict vote.
  const defenderChat = state.machineHost && state.phase.kind === "verdict";
  const phaseOpen = (SOCIAL_PHASES as readonly string[]).includes(state.phase.kind) || defenderChat;
  const dead = !!me && state.phase.kind !== "lobby" && !me.alive;
  const defenseLocked = (state.phase.kind === "defense" || defenderChat) && !state.me?.onStand;
  const canSpeak = isHost || (phaseOpen && !dead && !defenseLocked);
  const reason = !phaseOpen ? t("social.closed") : dead ? t("social.deadReadOnly") : defenseLocked ? t("social.onlyNominees") : null;
  // The board can be folded away so the chat gets the whole panel.
  const [boardOpen, setBoardOpen] = useState(true);
  useEffect(() => setBoardOpen(storage.get<boolean>("msn:boardOpen") ?? true), []);
  const toggleBoard = () => {
    storage.set("msn:boardOpen", !boardOpen);
    setBoardOpen(!boardOpen);
  };

  return (
    <div className={`tarot-frame flex min-h-0 flex-col overflow-hidden rounded-lg border border-gold/40 bg-night-900/85 ${className}`}>
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-gold/25 px-2 py-1.5">
        <span className="w-24 shrink-0" aria-hidden />
        <span className="ml-auto text-gold/60">✦</span>
        <h3 className="font-display text-lg leading-none text-gold">{t("social.title")}</h3>
        <span className="text-gold/60">✦</span>
        <button type="button" className="btn-ghost btn-sm ml-auto px-2 py-0.5 text-xs" onClick={toggleBoard} aria-expanded={boardOpen}>
          {boardOpen ? `▴ ${t("social.hideBoard")}` : `▾ ${t("social.showBoard")}`}
        </button>
      </div>
      {state.settings.voiceChat !== false && <VoiceBar state={state} players={players} enabled={phaseOpen} />}
      {boardOpen && (
        <div className="flex min-h-0 shrink-0 basis-[24%] flex-col border-b border-gold/25">
          <Board social={social} canDraw={canSpeak} isHost={isHost} reason={null} />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <Chat social={social} players={players} canSpeak={canSpeak} reason={isHost ? null : reason} viewer={viewer} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

function VoiceBar({ state, players, enabled }: { state: ClientState; players: Map<string, PlayerView>; enabled: boolean }) {
  const t = useT();
  const voice = useVoice();
  const showError = useErrorToast();
  const [busy, setBusy] = useState(false);
  const label = (from: string) => (from === "host" ? t("social.host") : players.get(from)?.name ?? "?");

  // The server ends the call when the phase changes; also leave locally.
  useEffect(() => {
    if (!enabled && voice.joined) voice.leave();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null;

  const people = voice.self ? [voice.self, ...voice.peers] : voice.peers;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2 py-1.5">
      {!voice.joined ? (
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            showError(await voice.join());
            setBusy(false);
          }}
        >
          🎙️ {t("voice.join")}
        </button>
      ) : (
        <>
          {voice.self?.listenOnly ? (
            <span className="chip text-white/60">🎧 {t("voice.listenOnly")}</span>
          ) : (
            <button
              type="button"
              className={`btn btn-sm ${voice.self?.muted ? "btn-ghost" : "bg-blood text-white"}`}
              onClick={() => voice.setMuted(!voice.self?.muted)}
            >
              {voice.self?.muted ? `🔇 ${t("voice.unmute")}` : `🎙️ ${t("voice.mute")}`}
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => voice.leave()}>
            {t("voice.leave")}
          </button>
        </>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden">
        {people.slice(0, 8).map((p) => {
          const pv = players.get(p.from);
          const talking = voice.speaking(p === voice.self ? "self" : p.socketId) && !p.muted;
          return (
            <span
              key={p.socketId}
              title={`${label(p.from)}${p.muted ? " 🔇" : ""}`}
              className={`relative rounded-full ${talking ? "ring-2 ring-emerald-400" : ""}`}
            >
              {pv ? <Avatar p={pv} size="sm" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-night-700">🎙️</span>}
              {p.muted && <span className="absolute -right-1 -bottom-1 text-[10px]">🔇</span>}
            </span>
          );
        })}
        {people.length > 0 && <span className="text-[11px] text-white/50">{t("voice.inCall", { count: people.length })}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function Chat({
  social,
  players,
  canSpeak,
  reason,
  viewer,
}: {
  social: ReturnType<typeof useSocial>;
  players: Map<string, PlayerView>;
  canSpeak: boolean;
  reason: string | null;
  viewer: string;
}) {
  const t = useT();
  const showError = useErrorToast();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // Only follow new messages when you are already at the bottom (or wrote it
  // yourself); if you scrolled up to read, stay put and show a "new messages" pill.
  const atBottom = useRef(true);
  const [unread, setUnread] = useState(0);
  const last = social.chat[social.chat.length - 1];
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottom.current || last?.from === viewer) {
      el.scrollTop = el.scrollHeight;
      setUnread(0);
    } else setUnread((n) => n + 1);
  }, [social.chat.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom.current) setUnread(0);
  };
  const jumpDown = () => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnread(0);
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const r = await social.sendChat(text);
    if (showError(r)) setText("");
  }

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 py-1.5">
        {!social.chat.length && <p className="py-6 text-center text-sm text-white/40">{t("social.empty")}</p>}
        {social.chat.map((m) => {
          const p = players.get(m.from);
          const mine = m.from === viewer;
          return (
            <div key={m.id} className={`flex items-start gap-1.5 ${mine ? "flex-row-reverse text-right" : ""}`}>
              {p ? (
                <ProfileLink playerId={p.id} className="shrink-0">
                  <Avatar p={p} size="sm" />
                </ProfileLink>
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blood text-xs">🎙️</span>
              )}
              <div className="min-w-0 max-w-[80%]">
                <div className="truncate text-[11px] leading-tight text-white/50">
                  {p ? (
                    <ProfileLink playerId={p.id} className="max-w-full">
                      <StyledName p={p} className="truncate" />
                    </ProfileLink>
                  ) : (
                    t("social.host")
                  )}
                </div>
                {p ? (
                  <ChatBubble color={p.chatColor} deco={p.style.chat}>
                    {m.text}
                  </ChatBubble>
                ) : (
                  <div className="inline-block rounded-lg bg-night-700 px-2 py-1 text-sm leading-snug break-words ring-1 ring-gold/50">{m.text}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {unread > 0 && (
        <button type="button" onClick={jumpDown} className="btn-primary btn-sm absolute bottom-2 left-1/2 -translate-x-1/2 shadow-lg">
          ↓ {t("social.newMessages", { n: unread })}
        </button>
      )}
      </div>
      {canSpeak ? (
        <form onSubmit={send} className="flex shrink-0 gap-1.5 border-t border-white/10 p-1.5">
          <input
            className="ui-input py-2 text-base"
            value={text}
            maxLength={200}
            placeholder={t("social.placeholder")}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="send"
          />
          <button className="btn-primary shrink-0 px-3" disabled={!text.trim()}>
            {t("social.send")}
          </button>
        </form>
      ) : (
        reason && <p className="shrink-0 border-t border-white/10 p-2 text-center text-xs text-white/50">{reason}</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Drawing board
// ---------------------------------------------------------------------------

function drawStroke(ctx: CanvasRenderingContext2D, s: Pick<Stroke, "color" | "size" | "points">, w: number, h: number) {
  const pts = s.points;
  if (pts.length < 2) return;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = (s.size * w) / 400;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.arc(pts[0] * w, pts[1] * h, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0] * w, pts[1] * h);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * w, pts[i + 1] * h);
  ctx.stroke();
}

function Board({
  social,
  canDraw,
  isHost,
  reason,
}: {
  social: ReturnType<typeof useSocial>;
  canDraw: boolean;
  isHost: boolean;
  reason: string | null;
}) {
  const t = useT();
  const showError = useErrorToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [color, setColor] = useState<string>(BOARD_COLORS[1]);
  const [brush, setBrush] = useState<number>(BRUSH_SIZES[1]);
  const current = useRef<number[] | null>(null);

  // Fit a 4:3 canvas into the free space.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(width, (height * 4) / 3));
      setSize({ w: Math.floor(w), h: Math.floor((w * 3) / 4) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const redraw = () => {
    const c = canvasRef.current;
    if (!c || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, size.w, size.h);
    for (const s of social.strokes) drawStroke(ctx, s, size.w, size.h);
    if (current.current) drawStroke(ctx, { color, size: brush, points: current.current }, size.w, size.h);
  };
  useEffect(redraw); // cheap enough: re-render on any change

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const finish = async () => {
    const pts = current.current;
    current.current = null;
    if (!pts) return;
    showError(await social.sendStroke({ color, size: brush, points: pts }));
    redraw();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
      <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center">
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          className={`rounded-md border border-white/10 ${canDraw ? "cursor-crosshair touch-none" : ""}`}
          onPointerDown={(e) => {
            if (!canDraw) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            current.current = point(e);
            redraw();
          }}
          onPointerMove={(e) => {
            const pts = current.current;
            if (!pts) return;
            const [x, y] = point(e);
            const lx = pts[pts.length - 2];
            const ly = pts[pts.length - 1];
            if (Math.hypot(x - lx, y - ly) < 0.004) return;
            pts.push(x, y);
            if (pts.length >= STROKE_MAX_POINTS * 2) {
              finish();
              current.current = [x, y];
            }
            redraw();
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
      </div>
      {canDraw ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {BOARD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 shrink-0 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-white/15" />
          {BRUSH_SIZES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrush(b)}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${brush === b ? "border-white" : "border-white/10"}`}
              aria-label={`${b}px`}
            >
              <span className="rounded-full bg-white" style={{ width: b + 2, height: b + 2 }} />
            </button>
          ))}
          {isHost && (
            <button type="button" className="btn-ghost btn-sm ml-auto" onClick={async () => showError(await social.clearBoard())}>
              {t("social.clear")}
            </button>
          )}
        </div>
      ) : (
        reason && <p className="shrink-0 text-center text-xs text-white/50">{reason}</p>
      )}
    </div>
  );
}
