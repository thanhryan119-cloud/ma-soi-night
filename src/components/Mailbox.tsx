"use client";

// The mailbox: a welcome letter for newcomers and one letter per release
// (from the changelog). What has been read is remembered on this device.

import Link from "next/link";
import { useEffect, useState } from "react";
import { APP_VERSION, CHANGELOG, type Release } from "@shared/changelog";
import { useLocale, useT } from "@/lib/i18n";
import { storage } from "@/lib/socket";

const KEY = "msn:mailRead";
const WELCOME = "welcome";
const idOf = (r: Release) => `v${r.version}`;

interface Letter {
  id: string;
  date: string | null;
  title: string;
  body: React.ReactNode;
}

/** The release's date, in the reader's language. */
export function releaseDate(date: string, locale: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "vi-VN", { day: "numeric", month: "long", year: "numeric" });
}

/** The list of changes in one release. */
export function ReleaseItems({ release }: { release: Release }) {
  const { locale } = useLocale();
  const items = release.items[locale === "en" ? "en" : "vi"];
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-snug text-white/80">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export function Mailbox() {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<string[] | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  // Newcomers find the welcome letter on top (it moves down once read, the next time the box opens).
  const [welcomeFirst, setWelcomeFirst] = useState(false);

  // First visit: the welcome letter and the newest release are new, older ones count as read.
  useEffect(() => {
    let saved = storage.get<string[]>(KEY);
    if (!Array.isArray(saved)) {
      saved = CHANGELOG.slice(1).map(idOf);
      storage.set(KEY, saved);
    }
    setRead(saved);
  }, []);

  const welcome: Letter = {
    id: WELCOME,
    date: null,
    title: t("mail.welcomeTitle"),
    body: (
      <div className="flex flex-col gap-2 text-sm leading-snug text-white/80">
        <p>{t("mail.welcome1")}</p>
        <p>{t("mail.welcome2")}</p>
        <p>{t("mail.welcome3")}</p>
      </div>
    ),
  };
  const releases: Letter[] = CHANGELOG.map((r) => ({
      id: idOf(r),
      date: r.date,
      title: `v${r.version} · ${r.title[locale === "en" ? "en" : "vi"]}`,
      body: <ReleaseItems release={r} />,
  }));
  const letters = welcomeFirst ? [welcome, ...releases] : [...releases, welcome];
  const unread = read ? letters.filter((l) => !read.includes(l.id)).length : 0;

  const markRead = (ids: string[]) => {
    setRead((cur) => {
      const next = [...new Set([...(cur ?? []), ...ids])];
      storage.set(KEY, next);
      return next;
    });
  };
  const openLetter = (id: string) => {
    setShown((cur) => (cur === id ? null : id));
    markRead([id]);
  };

  return (
    <>
      <button
        type="button"
        className="btn-ghost btn-sm relative gap-1.5"
        onClick={() => {
          if (!open) setWelcomeFirst(!read?.includes(WELCOME));
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-label={t("mail.title")}
      >
        📬 <span className="max-sm:sr-only">{t("mail.button")}</span>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-blood px-1 text-[11px] font-black text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <section
          className="rise fixed inset-x-2 top-14 z-[60] flex max-h-[75dvh] flex-col gap-2 rounded-lg border border-gold/40 bg-night-800/95 p-3 text-left shadow-[0_18px_50px_rgba(0,0,0,0.6),inset_0_0_0_3px_#1a153d] backdrop-blur sm:inset-x-auto sm:right-3 sm:w-[26rem]"
          aria-label={t("mail.title")}
        >
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate font-display text-lg font-black text-moon">📬 {t("mail.title")}</h2>
            {unread > 0 && (
              <button className="btn-ghost btn-sm text-xs" onClick={() => markRead(letters.map((l) => l.id))}>
                {t("mail.readAll")}
              </button>
            )}
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label={t("common.close")}>
              ✕
            </button>
          </div>
          <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
            {letters.map((l) => {
              const isNew = !!read && !read.includes(l.id);
              const isOpen = shown === l.id;
              return (
                <li key={l.id} className={`rounded-lg border ${isNew ? "border-gold/50 bg-gold/5" : "border-white/10 bg-white/[0.02]"}`}>
                  <button type="button" className="flex w-full items-start gap-2 p-2.5 text-left" onClick={() => openLetter(l.id)} aria-expanded={isOpen}>
                    <span className="text-lg leading-none">{isNew ? "✉️" : "📄"}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-snug ${isNew ? "font-bold text-moon" : "text-white/80"}`}>{l.title}</span>
                      <span className="block text-[11px] text-white/40">{l.date ? releaseDate(l.date, locale) : t("mail.fromTeam")}</span>
                    </span>
                    {isNew && <span className="shrink-0 rounded bg-blood px-1.5 text-[10px] font-bold text-white">{t("mail.new")}</span>}
                  </button>
                  {isOpen && <div className="border-t border-white/10 px-3 py-2.5">{l.body}</div>}
                </li>
              );
            })}
          </ul>
          <Link href="/changelog" className="text-center text-xs text-gold hover:underline" onClick={() => setOpen(false)}>
            {t("mail.allChanges", { version: APP_VERSION })}
          </Link>
        </section>
      )}
    </>
  );
}
