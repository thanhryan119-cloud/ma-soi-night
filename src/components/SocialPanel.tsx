"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BOARD_COLORS,
  BRUSH_SIZES,
  CHAT_MIN_GAP_MS,
  SOCIAL_PHASES,
  STROKE_MAX_POINTS,
  chatWaitMs,
  mentionsName,
  recentSends,
  type ChatMessage,
  type Stroke,
} from "@shared/social";
import type { ClientState, PlayerView } from "@shared/views";
import { useT } from "@/lib/i18n";
import { useSocial } from "@/lib/social";
import { storage } from "@/lib/socket";
import { useVoice } from "@/lib/voice";
import { Avatar, ChatBubble, StyledName, useErrorToast } from "./ui";
import { ProfileLink } from "./Profile";

/** True when the message starts a new day (or night, or the lobby / game over) compared with the one before. */
export function newStage(
  m: ChatMessage,
  prev: ChatMessage | undefined,
): boolean {
  if (!m.stage) return false;
  if (!prev) return m.stage !== "lobby";
  return prev.stage !== m.stage || prev.n !== m.n;
}

/** The marker line between days in a chat: "Sáng ngày 2", "Đêm 3"… */
export function ChatMilestone({ m }: { m: ChatMessage }) {
  const t = useT();
  const label =
    m.stage === "day"
      ? `☀️ ${t("social.markDay", { n: m.n ?? 1 })}`
      : m.stage === "night"
        ? `🌙 ${t("social.markNight", { n: m.n ?? 1 })}`
        : m.stage === "over"
          ? `🏁 ${t("social.markOver")}`
          : `🏠 ${t("social.markLobby")}`;
  return (
    <div
      className="my-2 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-gold/80"
      role="separator"
    >
      <span className="h-px flex-1 bg-gold/25" />
      <span className="shrink-0">{label}</span>
      <span className="h-px flex-1 bg-gold/25" />
    </div>
  );
}

/** Who is using the panel: the host, or a player id. */
export function SocialPanel({
  state,
  viewer,
  className = "",
}: {
  state: ClientState;
  viewer: "host" | string;
  className?: string;
}) {
  const t = useT();
  const social = useSocial(state.code);
  const players = new Map(state.players.map((p) => [p.id, p]));
  const isHost = viewer === "host";
  const me = isHost ? null : players.get(viewer);
  // The players on the stand keep the chat during the verdict vote.
  const defenderChat = state.phase.kind === "verdict";
  const phaseOpen =
    (SOCIAL_PHASES as readonly string[]).includes(state.phase.kind) ||
    defenderChat;
  const dead =
    !!me &&
    state.phase.kind !== "lobby" &&
    state.phase.kind !== "gameOver" &&
    !me.alive;
  const defenseLocked =
    (state.phase.kind === "defense" || defenderChat) && !state.me?.onStand;
  const silenced = !!me?.silenced;
  const canSpeak =
    isHost || (phaseOpen && !dead && !defenseLocked && !silenced);
  const reason = !phaseOpen
    ? t("social.closed")
    : dead
      ? t("social.deadReadOnly")
      : silenced
        ? t("social.silenced")
        : defenseLocked
          ? t("social.onlyNominees")
          : null;
  // The board can be folded away so the chat gets the whole panel.
  const [boardOpen, setBoardOpen] = useState(true);
  useEffect(
    () => setBoardOpen(storage.get<boolean>("msn:boardOpen") ?? true),
    [],
  );
  const toggleBoard = () => {
    storage.set("msn:boardOpen", !boardOpen);
    setBoardOpen(!boardOpen);
  };

  return (
    <div
      className={`tarot-frame flex min-h-0 flex-col overflow-hidden rounded-lg border border-gold/40 bg-night-900/85 ${className}`}
    >
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-gold/25 px-2 py-1.5">
        <span className="w-24 shrink-0" aria-hidden />
        <span className="ml-auto text-gold/60">✦</span>
        <h3 className="font-display text-lg leading-none text-gold">
          {t("social.title")}
        </h3>
        <span className="text-gold/60">✦</span>
        <button
          type="button"
          className="btn-ghost btn-sm ml-auto px-2 py-0.5 text-xs"
          onClick={toggleBoard}
          aria-expanded={boardOpen}
        >
          {boardOpen
            ? `▴ ${t("social.hideBoard")}`
            : `▾ ${t("social.showBoard")}`}
        </button>
      </div>
      {state.settings.voiceChat !== false && (
        <VoiceBar state={state} players={players} enabled={phaseOpen} />
      )}
      {boardOpen && (
        <div className="flex min-h-0 shrink-0 basis-[24%] flex-col border-b border-gold/25">
          <Board
            social={social}
            canDraw={canSpeak}
            isHost={isHost}
            reason={null}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <Chat
          social={social}
          players={players}
          canSpeak={canSpeak}
          reason={isHost ? null : reason}
          viewer={viewer}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

function VoiceBar({
  state,
  players,
  enabled,
}: {
  state: ClientState;
  players: Map<string, PlayerView>;
  enabled: boolean;
}) {
  const t = useT();
  const voice = useVoice();
  const showError = useErrorToast();
  const [busy, setBusy] = useState(false);
  const label = (from: string) =>
    from === "host" ? t("social.host") : (players.get(from)?.name ?? "?");

  // Everyone listens on their own while voice is open, so whoever talks is heard.
  // The server ends the call when the phase changes; also leave locally.
  useEffect(() => {
    if (enabled && voice.wantListen && !voice.joined && !voice.joining) void voice.join();
    if (!enabled && voice.joined) voice.leave();
  }, [enabled, voice.wantListen, voice.joined]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const r = await fn();
    if (r.error) showError(r);
    setBusy(false);
  };

  const people = voice.self ? [voice.self, ...voice.peers] : voice.peers;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-2 py-1.5">
      {!voice.joined ? (
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy || voice.joining}
          onClick={() => {
            voice.setWantListen(true);
            void run(voice.join);
          }}
        >
          🔈 {t("voice.listen")}
        </button>
      ) : (
        <>
          {voice.blocked && (
            <button type="button" className="btn btn-sm bg-gold text-night-950" onClick={() => voice.unlock()}>
              🔈 {t("voice.tapToHear")}
            </button>
          )}
          {voice.self?.listenOnly ? (
            <span className="chip text-white/60">🎧 {t("voice.listenOnly")}</span>
          ) : !voice.micOn ? (
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void run(voice.enableMic)}>
              🎙️ {t("voice.join")}
            </button>
          ) : (
            <button
              type="button"
              className={`btn btn-sm ${voice.self?.muted ? "btn-ghost" : "bg-blood text-white"}`}
              onClick={() => voice.setMuted(!voice.self?.muted)}
            >
              {voice.self?.muted
                ? `🔇 ${t("voice.unmute")}`
                : `🎙️ ${t("voice.mute")}`}
            </button>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              voice.setWantListen(false);
              voice.leave();
            }}
          >
            {t("voice.leave")}
          </button>
        </>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden">
        {people.slice(0, 8).map((p) => {
          const pv = players.get(p.from);
          const talking =
            voice.speaking(p === voice.self ? "self" : p.socketId) && !p.muted;
          return (
            <span
              key={p.socketId}
              title={`${label(p.from)}${p.muted ? " 🔇" : ""}`}
              className={`relative rounded-full ${talking ? "ring-2 ring-emerald-400" : ""}`}
            >
              {pv ? (
                <Avatar p={pv} size="sm" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-night-700">
                  🎙️
                </span>
              )}
              {p.muted && (
                <span className="absolute -right-1 -bottom-1 text-[10px]">
                  🔇
                </span>
              )}
            </span>
          );
        })}
        {people.length > 0 && (
          <span className="text-[11px] text-white/50">
            {t("voice.inCall", { count: people.length })}
          </span>
        )}
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
  const myName = players.get(viewer)?.name ?? "";
  const mentionsMe = (m: ChatMessage) =>
    !!myName && m.from !== viewer && mentionsName(m.text, myName);

  // Tap a name to read only that person's messages; tap again (or "show all") to see everyone.
  const [filter, setFilter] = useState<string | null>(null);
  const shown = filter
    ? social.chat.filter((m) => m.from === filter)
    : social.chat;
  useEffect(() => {
    if (filter && !social.chat.some((m) => m.from === filter)) setFilter(null);
  }, [social.chat, filter]);

  // Only follow new messages when you are already at the bottom (or wrote it
  // yourself); if you scrolled up to read, stay put and show a "new messages" pill.
  const atBottom = useRef(true);
  const [unread, setUnread] = useState(0);
  const [unreadMentions, setUnreadMentions] = useState(0);
  const toBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const last = social.chat[social.chat.length - 1];
  useEffect(() => {
    if (!last) {
      setUnread(0);
      setUnreadMentions(0);
      return;
    }
    const visible = !filter || last.from === filter;
    if (last.from === viewer || (atBottom.current && visible)) {
      toBottom();
      // While filtered, keep counting what the filter hides until "show all".
      if (!filter) {
        setUnread(0);
        setUnreadMentions(0);
      }
    } else {
      setUnread((n) => n + 1);
      if (mentionsMe(last)) setUnreadMentions((n) => n + 1);
    }
    // Keyed on the last id: the list stays at 200 lines once full.
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    toBottom();
    atBottom.current = true;
    // Back to everyone at the bottom: everything has been seen.
    if (!filter) {
      setUnread(0);
      setUnreadMentions(0);
    }
  }, [filter]);
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom.current && !filter) {
      setUnread(0);
      setUnreadMentions(0);
    }
  };
  const jumpDown = () => {
    // New messages may be from people the filter hides: show everyone again.
    if (filter) setFilter(null);
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnread(0);
    setUnreadMentions(0);
  };

  // Slow mode: a few messages, then a short wait (the server enforces the same rule).
  const limited = viewer !== "host";
  const sends = useRef<number[]>([]);
  const [waitUntil, setWaitUntil] = useState(0);
  const [clock, setClock] = useState(0);
  const startWait = (ms: number) => {
    const now = Date.now();
    setClock(now);
    setWaitUntil(now + ms);
  };
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const i = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= waitUntil) clearInterval(i);
    }, 250);
    return () => clearInterval(i);
  }, [waitUntil]);
  const waitS = Math.ceil(Math.max(0, waitUntil - clock) / 1000);

  const onType = (value: string) => setText(value);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || waitS > 0) return;
    if (limited) {
      const wait = chatWaitMs(sends.current, Date.now());
      if (wait > 0) return startWait(wait);
    }
    const r = await social.sendChat(text);
    if (r.ok) {
      const now = Date.now();
      sends.current = [...recentSends(sends.current, now), now];
      setText("");
      // Used up the burst: show the wait right away instead of after the next try.
      const next = limited ? chatWaitMs(sends.current, now) : 0;
      if (next > CHAT_MIN_GAP_MS) startWait(next);
    } else if (r.error === "err.chatSlow") startWait(Number(r.retryMs) || 1000);
    else showError(r);
  }
  // Everyone who has said something, for the "read one person" picker.
  const speakers = [...new Set(social.chat.map((m) => m.from))];
  const nameOf = (id: string) =>
    id === "host" ? t("social.host") : (players.get(id)?.name ?? "?");

  return (
    <>
      {speakers.length > 1 && (
        <div
          className={`flex shrink-0 items-center gap-1.5 border-b px-2 py-0.5 text-xs ${filter ? "border-gold/25 bg-night-800/80 text-gold" : "border-white/10 text-white/50"}`}
        >
          <label htmlFor="chat-filter" className="shrink-0">
            🔎 {t("social.filterLabel")}
          </label>
          <select
            id="chat-filter"
            className="ui-select min-w-0 flex-1 py-0.5 text-xs"
            value={filter ?? ""}
            onChange={(e) => setFilter(e.target.value || null)}
          >
            <option value="">{t("social.filterAll")}</option>
            {speakers.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)} ({social.chat.filter((m) => m.from === id).length})
              </option>
            ))}
          </select>
          {filter && (
            <button
              type="button"
              className="btn-ghost btn-sm shrink-0 px-2 py-0.5 text-xs"
              onClick={() => setFilter(null)}
            >
              ✕ {t("social.filterOff")}
            </button>
          )}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-0.5 pb-1.5"
        >
          {!social.chat.length && (
            <p className="py-6 text-center text-sm text-white/40">
              {t("social.empty")}
            </p>
          )}
          {shown.map((m, i) => {
            const p = players.get(m.from);
            const mine = m.from === viewer;
            // Several lines in a row from the same person share one avatar and name.
            const prev = shown[i - 1];
            const marker = newStage(m, prev);
            const followUp =
              !marker &&
              !!prev &&
              prev.from === m.from &&
              m.t - prev.t < 60_000;
            const mention = mentionsMe(m);
            const mark = mention
              ? "outline-2 outline-offset-1 outline-gold"
              : "";
            return (
              <Fragment key={m.id}>
                {marker && <ChatMilestone m={m} />}
                <div
                  className={`flex items-start gap-1.5 ${followUp ? "mt-0.5" : "mt-1.5"} ${mine ? "flex-row-reverse text-right" : ""}`}
                >
                  {followUp ? (
                    <span className="w-7 shrink-0" aria-hidden />
                  ) : p ? (
                    <ProfileLink playerId={p.id} className="shrink-0">
                      <Avatar p={p} size="sm" />
                    </ProfileLink>
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blood text-xs">
                      🎙️
                    </span>
                  )}
                  <div className="min-w-0 max-w-[80%]">
                    {!followUp && (
                      <div className="truncate text-[11px] leading-tight text-white/50">
                        <button
                          type="button"
                          onClick={() =>
                            setFilter(filter === m.from ? null : m.from)
                          }
                          title={t("social.filterBy")}
                          aria-label={`${p?.name ?? t("social.host")}: ${t("social.filterBy")}`}
                          aria-pressed={filter === m.from}
                          className="max-w-full truncate hover:underline"
                        >
                          {p ? (
                            <StyledName p={p} className="truncate" />
                          ) : (
                            t("social.host")
                          )}
                        </button>
                      </div>
                    )}
                    <div
                      className={`flex cursor-pointer items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}
                      onClick={() =>
                        setFilter(filter === m.from ? null : m.from)
                      }
                      title={t("social.filterBy")}
                    >
                      {p ? (
                        <ChatBubble
                          color={p.chatColor}
                          deco={p.style.chat}
                          className={mark}
                        >
                          {m.text}
                        </ChatBubble>
                      ) : (
                        <div
                          className={`inline-block rounded-lg bg-night-700 px-2 py-1 text-sm leading-snug break-words ring-1 ring-gold/50 ${mark}`}
                        >
                          {m.text}
                        </div>
                      )}
                      {mention && (
                        <span
                          className="shrink-0 text-xs font-black text-gold"
                          aria-label={t("social.mentionsYou")}
                        >
                          @
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={jumpDown}
            className="btn-primary btn-sm absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap shadow-lg"
          >
            ↓ {t("social.newMessages", { n: unread })}
            {unreadMentions > 0 && (
              <span className="ml-1 font-black">
                · {t("social.newMentions", { n: unreadMentions })}
              </span>
            )}
          </button>
        )}
      </div>
      {canSpeak ? (
        <form
          onSubmit={send}
          className="flex shrink-0 gap-1.5 border-t border-white/10 p-1.5"
        >
          <input
            className="ui-input py-2 text-base"
            value={text}
            maxLength={200}
            placeholder={t("social.placeholder")}
            onChange={(e) => onType(e.target.value)}
            enterKeyHint="send"
          />
          <button
            className="btn-primary shrink-0 px-3 tabular-nums"
            disabled={!text.trim() || waitS > 0}
            title={
              waitS > 0 ? t("err.chatSlow", { seconds: waitS }) : undefined
            }
          >
            {waitS > 0
              ? `⏳ ${t("social.slowWait", { seconds: waitS })}`
              : t("social.send")}
          </button>
        </form>
      ) : (
        reason && (
          <p className="shrink-0 border-t border-white/10 p-2 text-center text-xs text-white/50">
            {reason}
          </p>
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Drawing board
// ---------------------------------------------------------------------------

function drawStroke(
  ctx: CanvasRenderingContext2D,
  s: Pick<Stroke, "color" | "size" | "points">,
  w: number,
  h: number,
) {
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
  for (let i = 2; i < pts.length; i += 2)
    ctx.lineTo(pts[i] * w, pts[i + 1] * h);
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
    if (current.current)
      drawStroke(
        ctx,
        { color, size: brush, points: current.current },
        size.w,
        size.h,
      );
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
      <div
        ref={wrapRef}
        className="flex min-h-0 flex-1 items-center justify-center"
      >
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
              <span
                className="rounded-full bg-white"
                style={{ width: b + 2, height: b + 2 }}
              />
            </button>
          ))}
          {isHost && (
            <button
              type="button"
              className="btn-ghost btn-sm ml-auto"
              onClick={async () => showError(await social.clearBoard())}
            >
              {t("social.clear")}
            </button>
          )}
        </div>
      ) : (
        reason && (
          <p className="shrink-0 text-center text-xs text-white/50">{reason}</p>
        )
      )}
    </div>
  );
}
