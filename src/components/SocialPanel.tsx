"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  newStage,
  CHAT_MIN_GAP_MS,
  SOCIAL_PHASES,
  chatWaitMs,
  mentionsName,
  recentSends,
  type ChatMessage,
} from "@shared/social";
import type { ClientState, PlayerView } from "@shared/views";
import { useT } from "@/lib/i18n";
import { useSocial } from "@/lib/social";
import { storage } from "@/lib/socket";
import { useVoice } from "@/lib/voice";
import { Avatar, ChatBubble, StyledName, useErrorToast } from "./ui";
import { GhostLog, useGhostChat } from "./GhostChat";
import { InviteCards, ServerChat, useGlobalChat } from "./GlobalChat";
import { ProfileLink } from "./Profile";

export { newStage } from "@shared/social";

/** A chat line's time of day, "21:05". */
export const chatTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The marker line between parts of a chat: "Ván 2 · Đêm 3 · 21:05"… */
export function ChatMilestone({ m }: { m: ChatMessage }) {
  const t = useT();
  const stage =
    m.stage === "day"
      ? `☀️ ${t("social.markDay", { n: m.n ?? 1 })}`
      : m.stage === "night"
        ? `🌙 ${t("social.markNight", { n: m.n ?? 1 })}`
        : m.stage === "over"
          ? `🏁 ${t("social.markOver")}`
          : `🏠 ${t("social.markLobby")}`;
  const label = [m.g ? `${t("social.markGame", { n: m.g })}` : null, stage, chatTime(m.t)].filter(Boolean).join(" · ");
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

/**
 * The room's chat box. Tabs: the room chat, the dead
 * players' chat when this viewer may read it, and the server-wide chat.
 * Who is using the panel: the host, a spectator, or a player id.
 */
export function SocialPanel({
  state,
  viewer,
  className = "",
}: {
  state: ClientState;
  viewer: "host" | "spectator" | string;
  className?: string;
}) {
  const t = useT();
  const social = useSocial(state.code);
  const players = new Map(state.players.map((p) => [p.id, p]));
  const isHost = viewer === "host";
  const spectator = viewer === "spectator";
  const me = isHost || spectator ? null : players.get(viewer);
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
    isHost || (!spectator && phaseOpen && !dead && !defenseLocked && !silenced);
  const reason = spectator
    ? t("social.spectatorReadOnly")
    : !phaseOpen
    ? t("social.closed")
    : dead
      ? t("social.deadReadOnly")
      : silenced
        ? t("social.silenced")
        : defenseLocked
          ? t("social.onlyNominees")
          : null;
  // Spectators talk in the dead players' chat, so they start there.
  const [tab, setTab] = useState<Tab>(spectator ? "ghost" : "room");
  const over = state.phase.kind === "gameOver";
  const ghost = useGhostChat(state, viewer);
  const anyDead = state.players.some((p) => !p.alive);
  // Same rule as before: the server says who may read; once the game is over
  // the tab only shows if the dead said something.
  const ghostShown = spectator
    ? !over || ghost.messages.length > 0
    : ghost.allowed && (ghost.messages.length > 0 || (!over && (!isHost || anyDead)));
  const global = useGlobalChat(tab === "server");
  useEffect(() => {
    if (tab === "ghost" && !ghostShown) setTab("room");
  }, [tab, ghostShown]);

  // Unread counts for the tabs you are not looking at.
  const [roomSince, setRoomSince] = useState(() => Date.now());
  const [ghostSeen, setGhostSeen] = useState(0);
  useEffect(() => {
    if (tab === "room") setRoomSince(Date.now());
  }, [tab, social.chat.length]);
  useEffect(() => {
    if (tab === "ghost") setGhostSeen(ghost.messages.length);
  }, [tab, ghost.messages.length]);
  const roomUnread =
    tab === "room" ? 0 : social.chat.filter((m) => m.t > roomSince && m.from !== viewer).length;
  const ghostUnread =
    tab === "ghost" ? 0 : ghost.messages.slice(ghostSeen).filter((m) => m.from !== viewer).length;

  const tabs: { id: Tab; icon: string; label: string; unread: number }[] = [
    { id: "room", icon: "💬", label: t("social.tabRoom"), unread: roomUnread },
    ...(ghostShown
      ? [{ id: "ghost" as Tab, icon: "👻", label: over ? t("ghostChat.endTitle") : t("social.tabGhost"), unread: ghostUnread }]
      : []),
    { id: "server", icon: "🌐", label: t("social.tabServer"), unread: global.unread },
  ];

  return (
    <div
      className={`@container tarot-frame flex min-h-0 flex-col overflow-hidden rounded-lg border border-gold/40 bg-night-900/85 ${className}`}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-gold/25 px-1.5 py-1" role="tablist" aria-label={t("social.title")}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            aria-label={x.label}
            title={x.label}
            className={`flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-bold whitespace-nowrap ${tab === x.id ? "bg-gold/15 text-gold ring-1 ring-gold/40" : "text-white/60 hover:text-white"}`}
          >
            <span aria-hidden>{x.icon}</span>
            {/* In a narrow box only the open tab spells out its name. */}
            <span className={`truncate ${tab === x.id ? "" : "hidden @[30rem]:inline"}`}>{x.label}</span>
            {x.unread > 0 && (
              <span className="rounded-full bg-blood px-1.5 text-[10px] font-bold text-white">{x.unread > 99 ? "99+" : x.unread}</span>
            )}
          </button>
        ))}
      </div>
      {state.settings.voiceChat !== false && !spectator && (
        <VoiceBar state={state} players={players} enabled={phaseOpen} />
      )}
      {/* Kept mounted while hidden so the room chat keeps its scroll and filter. */}
      <div className={`min-h-0 flex-1 flex-col ${tab === "room" ? "flex" : "hidden"}`}>
        <Chat
          social={social}
          players={players}
          canSpeak={canSpeak}
          reason={isHost ? null : reason}
          viewer={viewer}
        />
      </div>
      {tab === "ghost" && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          {!over && (
            <p className="shrink-0 text-xs text-white/50">
              {isHost ? t("ghostChat.hostHint") : spectator ? t("ghostChat.spectatorHint") : t("ghostChat.hint")}
            </p>
          )}
          <GhostLog state={state} ghost={ghost} className="flex-1" />
        </div>
      )}
      {tab === "server" && (
        <ServerChat chat={global} canInvite={!spectator && state.phase.kind === "lobby"} className="flex-1 p-2" />
      )}
      <InviteCards chat={global} />
    </div>
  );
}

type Tab = "room" | "ghost" | "server";

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
  // Who is in the call: just a count by default, the faces on request (remembered on this device).
  const [showPeople, setShowPeople] = useState(false);
  useEffect(() => setShowPeople(storage.get<boolean>("msn:micPeople") ?? false), []);
  const togglePeople = () => {
    storage.set("msn:micPeople", !showPeople);
    setShowPeople(!showPeople);
  };
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
  const isTalking = (p: (typeof people)[number]) => voice.speaking(p === voice.self ? "self" : p.socketId) && !p.muted;
  const anyTalking = people.some(isTalking);
  // Talking first, then mic on, then muted or only listening; you stay first among equals.
  const rank = (p: (typeof people)[number]) => (isTalking(p) ? 0 : p.muted || p.listenOnly ? 2 : 1);
  const sorted = people.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
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
      {people.length > 0 && (
        <button
          type="button"
          onClick={togglePeople}
          aria-expanded={showPeople}
          title={showPeople ? t("voice.hidePeople") : t("voice.showPeople")}
          className={`ml-auto flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${anyTalking ? "border-emerald-400/70 text-emerald-300" : "border-white/15 text-white/60 hover:text-white"}`}
        >
          🎙️ {people.length}
          <span className="sr-only">{t("voice.inCall", { count: people.length })}</span>
          <span aria-hidden>{showPeople ? "▴" : "▾"}</span>
        </button>
      )}
      {showPeople && people.length > 0 && (
        <ul className="flex w-full flex-wrap gap-x-2 gap-y-1.5 border-t border-white/10 pt-1.5" aria-label={t("voice.inCall", { count: people.length })}>
          {sorted.map((p) => {
            const pv = players.get(p.from);
            const talking = isTalking(p);
            return (
              <li key={p.socketId} className="flex max-w-[8rem] min-w-0 items-center gap-1" title={`${label(p.from)}${p.muted ? " 🔇" : ""}`}>
                <span className={`relative shrink-0 rounded-full ${talking ? "ring-2 ring-emerald-400" : ""}`}>
                  {pv ? (
                    <Avatar p={pv} size="sm" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-night-700">🎙️</span>
                  )}
                  {p.muted && <span className="absolute -right-1 -bottom-1 text-[10px]">🔇</span>}
                </span>
                <span className={`truncate text-[11px] ${talking ? "font-bold text-emerald-300" : "text-white/60"}`}>{label(p.from)}</span>
              </li>
            );
          })}
        </ul>
      )}
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
                        <span className="ml-1 text-white/30 tabular-nums">{chatTime(m.t)}</span>
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
