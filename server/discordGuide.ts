// The Discord guide bot: a panel with buttons, slash commands and select menus
// that walk newcomers into the game, explain every role, show the features
// people miss and answer the common questions. Replies are ephemeral (only the
// person who clicked sees them), so the guide channel stays clean.
//
// It runs as Discord's HTTP "Interactions Endpoint" on this server: no gateway
// connection and no extra dependency. Discord signs every request with the
// application's Ed25519 key, which we check before answering.

import { createPublicKey, verify, type KeyObject } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import viMessages from "../messages/vi.json";
import enMessages from "../messages/en.json";
import viGuide from "./guide/vi.json";
import enGuide from "./guide/en.json";
import { readBody } from "./http";
import { ROLES, ROLE_IDS } from "../shared/roles";
import { MAX_PLAYERS, MIN_PLAYERS } from "../shared/engine";
import { MIN_HUMANS_FOR_STATS } from "../shared/stats";
import { TIER_WINS } from "../shared/achievements";
import { FAQ, GUIDE_ROLE_ORDER, STARTER_ROLES, isBasicRole, nightRule, seerTricks, type FaqCategory } from "../shared/guide";
import type { RoleId } from "../shared/types";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type Lang = "vi" | "en";
type Tree = { [k: string]: string | Tree };
const TEXT: Record<Lang, Tree[]> = {
  vi: [viGuide as unknown as Tree, viMessages as unknown as Tree],
  en: [enGuide as unknown as Tree, enMessages as unknown as Tree],
};

/** Discord sends the clicker's client language ("vi", "en-US", ...). Vietnamese unless it is English. */
export function langOf(locale: unknown): Lang {
  return typeof locale === "string" && locale.toLowerCase().startsWith("en") ? "en" : "vi";
}

/** A message from server/guide/<lang>.json, else messages/<lang>.json, with {var} filled in. */
export function tr(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  for (const tree of TEXT[lang]) {
    const v = key.split(".").reduce<unknown>((o, k) => (o as Tree | undefined)?.[k], tree);
    if (typeof v === "string") return v.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
  }
  return key;
}

const roleName = (lang: Lang, r: RoleId) => tr(lang, `roles.${r}.name`);

// ---------------------------------------------------------------------------
// Discord shapes (just what we use)
// ---------------------------------------------------------------------------

const EPHEMERAL = 64;
const COLOR = { brand: 0x8b1e3f, village: 0x3fa66b, wolves: 0xb3262e, solo: 0x7c5cc4, gold: 0xe8b45a } as const;

interface Button {
  type: 2;
  style: 1 | 2 | 3 | 5;
  label: string;
  emoji?: { name: string };
  custom_id?: string;
  url?: string;
}
interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: { name: string };
  default?: boolean;
}
interface Select {
  type: 3;
  custom_id: string;
  placeholder: string;
  options: SelectOption[];
}
interface Row {
  type: 1;
  components: (Button | Select)[];
}
interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}
export interface MessageData {
  content?: string;
  embeds?: Embed[];
  components?: Row[];
  flags?: number;
  allowed_mentions?: { parse: string[] };
}

const button = (label: string, custom_id: string, style: 1 | 2 | 3 = 2, emoji?: string): Button => ({
  type: 2,
  style,
  label,
  custom_id,
  ...(emoji ? { emoji: { name: emoji } } : {}),
});
const link = (label: string, url: string, emoji?: string): Button => ({ type: 2, style: 5, label, url, ...(emoji ? { emoji: { name: emoji } } : {}) });
const row = (...components: (Button | Select)[]): Row => ({ type: 1, components });
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export interface GuideOptions {
  /** The web app, for "play now" link buttons (PUBLIC_WEB_URL). */
  webUrl?: string;
}

const webLink = (opts: GuideOptions, path: string) => (opts.webUrl ? `${opts.webUrl.replace(/\/+$/, "")}${path}` : null);

/** The public panel posted once in the guide channel. */
export function panel(lang: Lang, opts: GuideOptions): MessageData {
  const play = webLink(opts, "/lobby?quick=1");
  const buttons = [
    button(tr(lang, "discord.panel.new"), "g:new", 1, "🌱"),
    button(tr(lang, "discord.panel.roles"), "g:roles", 2, "🎭"),
    button(tr(lang, "discord.panel.features"), "g:features", 2, "✨"),
    button(tr(lang, "discord.panel.faq"), "g:faq", 2, "❓"),
  ];
  return {
    embeds: [{ title: tr(lang, "discord.panel.title"), description: tr(lang, "discord.panel.desc"), color: COLOR.gold }],
    components: [row(...buttons), ...(play ? [row(link(tr(lang, "discord.panel.play"), play, "⚡"))] : [])],
    allowed_mentions: { parse: [] },
  };
}

type Flow = "new" | "know";
const FLOWS: Record<Flow, Step[]> = {
  new: ["rules", "roles", "phone", "manners", "start"],
  know: ["phone", "manners", "start"],
};
type Step = "rules" | "roles" | "phone" | "manners" | "start";

/** First screen of the walkthrough: do you know the game? */
export function ask(lang: Lang): MessageData {
  return {
    embeds: [{ title: tr(lang, "onboard.ask.title"), description: tr(lang, "onboard.ask.desc"), color: COLOR.gold }],
    components: [
      row(
        button(tr(lang, "onboard.ask.new.title"), "g:flow:new:0", 1, "🌱"),
        button(tr(lang, "onboard.ask.know.title"), "g:flow:know:0", 2, "🎯"),
        button(tr(lang, "onboard.ask.skip.title"), "g:flow:know:2", 2, "⚡"),
      ),
    ],
  };
}

/** One step of the walkthrough, with back and next buttons. */
export function step(lang: Lang, flow: Flow, i: number, opts: GuideOptions): MessageData {
  const steps = FLOWS[flow];
  const at = Math.max(0, Math.min(steps.length - 1, i));
  const s = steps[at];
  const embed: Embed = { color: COLOR.brand, footer: { text: tr(lang, "onboard.stepOf", { n: at + 1, total: steps.length }) } };
  const extra: Row[] = [];

  if (s === "rules") {
    embed.title = `⏱️ ${tr(lang, "onboard.rules.title")}`;
    embed.description = tr(lang, "onboard.rules.desc");
    embed.fields = [
      { name: `🌙 ${tr(lang, "tutorial.flowNight")}`, value: tr(lang, "tutorial.flowNightDesc") },
      { name: `☀️ ${tr(lang, "tutorial.flowDay")}`, value: tr(lang, "tutorial.flowDayDesc") },
      { name: `🗳️ ${tr(lang, "tutorial.flowVote")}`, value: tr(lang, "tutorial.flowVoteDesc") },
      { name: `🏁 ${tr(lang, "tutorial.winTitle")}`, value: `🏘️ ${tr(lang, "tutorial.winVillage")}\n🐺 ${tr(lang, "tutorial.winWolves")}` },
    ];
  } else if (s === "roles") {
    embed.title = `🎭 ${tr(lang, "onboard.roles.title")}`;
    embed.description = tr(lang, "onboard.roles.desc");
    embed.fields = STARTER_ROLES.map((r) => ({ name: `${ROLES[r].emoji} ${roleName(lang, r)}`, value: tr(lang, `roles.${r}.desc`) }));
    extra.push(row(button(tr(lang, "discord.panel.roles"), "g:roles", 2, "🎭")));
  } else if (s === "phone" || s === "manners") {
    const icons = s === "phone" ? ["🃏", "💡", "👆", "🗳️"] : ["🤫", "👻", "🚪", "😄"];
    embed.title = `${s === "phone" ? "📱" : "🤝"} ${tr(lang, `onboard.${s}.title`)}`;
    embed.description = icons.map((icon, n) => `${icon} ${tr(lang, `onboard.${s}.tip${n + 1}`)}`).join("\n\n");
  } else {
    embed.title = `🚀 ${tr(lang, "onboard.start.title")}`;
    embed.description = tr(lang, "onboard.start.desc");
    const quick = webLink(opts, "/lobby?quick=1");
    const lobby = webLink(opts, "/lobby");
    const lines = [
      quick && `⚡ **${tr(lang, "onboard.start.quick.title")}** ${tr(lang, "onboard.start.quick.desc")}`,
      lobby && `🌐 **${tr(lang, "onboard.start.lobby.title")}** ${tr(lang, "onboard.start.lobby.desc")}`,
      `🎭 **${tr(lang, "onboard.start.guide.title")}** ${tr(lang, "onboard.start.guide.desc")}`,
    ].filter(Boolean);
    embed.description += `\n\n${lines.join("\n")}`;
    const links = [quick && link(tr(lang, "onboard.start.quick.title"), quick, "⚡"), lobby && link(tr(lang, "onboard.start.lobby.title"), lobby, "🌐")].filter(
      (b): b is Button => !!b,
    );
    extra.push(row(...links, button(tr(lang, "onboard.start.guide.title"), "g:roles", 2, "🎭"), button(tr(lang, "discord.panel.faq"), "g:faq", 2, "❓")));
  }

  const back = at === 0 ? "g:new" : `g:flow:${flow}:${at - 1}`;
  const nav = row(button(tr(lang, "onboard.prev"), back, 2, "⬅️"));
  if (at < steps.length - 1) nav.components.push(button(tr(lang, "onboard.next"), `g:flow:${flow}:${at + 1}`, 1, "➡️"));
  return { embeds: [embed], components: [...extra, nav] };
}

function rolePicker(lang: Lang, selected?: RoleId): Select {
  return {
    type: 3,
    custom_id: "g:role",
    placeholder: tr(lang, "discord.rolesPick"),
    options: GUIDE_ROLE_ORDER.map((r) => ({
      label: cut(roleName(lang, r), 100),
      value: r,
      emoji: { name: ROLES[r].emoji },
      description: cut(
        `${tr(lang, `teams.${ROLES[r].team}`)}${STARTER_ROLES.includes(r) ? ` · 🌱 ${tr(lang, "roles.starter")}` : isBasicRole(r) ? "" : ` · ${tr(lang, "roles.advanced")}`}`,
        100,
      ),
      default: r === selected,
    })),
  };
}

/** The role menu with a short intro. */
export function roles(lang: Lang): MessageData {
  return {
    embeds: [{ title: tr(lang, "discord.rolesTitle"), description: tr(lang, "discord.rolesDesc", { n: ROLE_IDS.length }), color: COLOR.gold }],
    components: [row(rolePicker(lang))],
  };
}

/** How to play one role, with the menu kept so another role is one pick away. */
export function role(lang: Lang, r: RoleId): MessageData {
  const def = ROLES[r];
  const wake = nightRule(r);
  const badge = STARTER_ROLES.includes(r) ? `🌱 ${tr(lang, "roles.starter")}` : isBasicRole(r) ? null : tr(lang, "roles.advanced");
  const tips = tr(lang, `roles.${r}.tips`)
    .split("\n")
    .filter(Boolean)
    .map((t) => `• ${t}`)
    .join("\n");
  const fields: Embed["fields"] = [
    { name: `🎯 ${tr(lang, "roles.goalTitle")}`, value: tr(lang, `roles.goal.${def.team}`) },
    {
      name: `🌙 ${tr(lang, "roles.wakeTitle")}`,
      value: `${tr(lang, `roles.wake.${wake}`)}${def.night && def.alsoWakesIn?.length ? `. ${tr(lang, "roles.packToo")}` : ""}`,
      inline: true,
    },
    { name: `🔮 ${tr(lang, "roles.seerTitle")}`, value: def.seenAsWolf ? `🐺 ${tr(lang, "roles.seerWolf")}` : `🙂 ${tr(lang, "roles.seerVillage")}`, inline: true },
  ];
  if (def.night) fields.push({ name: `👆 ${tr(lang, "roles.actionTitle")}`, value: tr(lang, `roles.${r}.action`) });
  if (tips) fields.push({ name: `💡 ${tr(lang, "roles.tipsTitle")}`, value: cut(tips, 1024) });

  const i = GUIDE_ROLE_ORDER.indexOf(r);
  const prev = GUIDE_ROLE_ORDER[(i - 1 + GUIDE_ROLE_ORDER.length) % GUIDE_ROLE_ORDER.length];
  const next = GUIDE_ROLE_ORDER[(i + 1) % GUIDE_ROLE_ORDER.length];
  return {
    embeds: [
      {
        title: `${def.emoji} ${roleName(lang, r)}`,
        description: `**${tr(lang, `teams.${def.team}`)}**${badge ? ` · ${badge}` : ""}\n\n${tr(lang, `roles.${r}.desc`)}`,
        color: COLOR[def.team],
        fields,
      },
    ],
    components: [
      row(rolePicker(lang, r)),
      row(button(roleName(lang, prev), `g:rolego:${prev}`, 2, "⬅️"), button(roleName(lang, next), `g:rolego:${next}`, 2, "➡️")),
    ],
  };
}

const FEATURES: [string, string][] = [
  ["⚡", "quick"],
  ["🤖", "machine"],
  ["🧠", "bots"],
  ["🎙️", "voice"],
  ["👻", "ghost"],
  ["👀", "watch"],
  ["📺", "screen"],
  ["🎞️", "replay"],
  ["🃏", "collection"],
  ["📜", "quests"],
  ["🤝", "friends"],
  ["🏆", "leaderboard"],
  ["🔒", "password"],
  ["✨", "style"],
  ["🔊", "sfx"],
  ["📲", "install"],
];

export function features(lang: Lang, opts: GuideOptions): MessageData {
  const play = webLink(opts, "/lobby?quick=1");
  return {
    embeds: [
      {
        title: `✨ ${tr(lang, "features.title")}`,
        description: tr(lang, "features.desc"),
        color: COLOR.gold,
        fields: FEATURES.map(([icon, key]) => ({
          name: `${icon} ${tr(lang, `features.items.${key}.title`)}`,
          value: tr(lang, `features.items.${key}.desc`, { min: MIN_HUMANS_FOR_STATS }),
          inline: true,
        })),
      },
    ],
    components: play ? [row(link(tr(lang, "discord.panel.play"), play, "⚡"))] : [],
  };
}

const CAT_ICON: Record<FaqCategory, string> = { start: "🚀", game: "🌙", roles: "🎭", account: "👤", tech: "🛠️" };

function faqPicker(lang: Lang, selected?: string): Select {
  return {
    type: 3,
    custom_id: "g:faqq",
    placeholder: tr(lang, "discord.faqPick"),
    options: FAQ.map((f) => ({
      label: cut(tr(lang, `faq.items.${f.id}.q`), 100),
      value: f.id,
      emoji: { name: CAT_ICON[f.cat] },
      description: cut(tr(lang, `faq.cat.${f.cat}`), 100),
      default: f.id === selected,
    })),
  };
}

function faqVars(lang: Lang): Record<string, string | number> {
  const names = Object.fromEntries(
    (["mayor", "villager", "bodyguard", "hunter", "seer", "witch", "werewolf", "tanner", "arsonist"] as RoleId[]).map((r) => [r, roleName(lang, r)]),
  );
  return {
    min: MIN_PLAYERS,
    max: MAX_PLAYERS,
    stats: MIN_HUMANS_FOR_STATS,
    roles: seerTricks()
      .map((r) => roleName(lang, r))
      .join(", "),
    ...names,
    ...TIER_WINS,
  };
}

export function faq(lang: Lang, id?: string): MessageData {
  const item = id ? FAQ.find((f) => f.id === id) : undefined;
  const embed: Embed = item
    ? {
        title: `${CAT_ICON[item.cat]} ${tr(lang, `faq.items.${item.id}.q`)}`,
        description: tr(lang, `faq.items.${item.id}.a`, faqVars(lang)),
        color: COLOR.brand,
        footer: { text: `❓ ${tr(lang, "discord.panel.faq")} · ${tr(lang, `faq.cat.${item.cat}`)}` },
      }
    : { title: `❓ ${tr(lang, "discord.panel.faq")}`, description: tr(lang, "discord.faqDesc"), color: COLOR.gold };
  return { embeds: [embed], components: [row(faqPicker(lang, item?.id))] };
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

/** What scripts/discord-register.ts sends to Discord. Names are Vietnamese, English clients see English names. */
export function commandDefinitions() {
  const both = (key: string) => ({ description: tr("vi", key), description_localizations: { "en-US": tr("en", key), "en-GB": tr("en", key) } });
  const enName = (name: string) => ({ "en-US": name, "en-GB": name });
  return [
    { name: "huongdan", name_localizations: enName("guide"), type: 1, ...both("discord.cmd.guide") },
    {
      name: "vai",
      name_localizations: enName("role"),
      type: 1,
      ...both("discord.cmd.role"),
      options: [
        {
          type: 3,
          name: "ten",
          name_localizations: enName("name"),
          ...both("discord.cmd.roleOption"),
          required: false,
          // 24 roles: Discord allows up to 25 choices.
          choices: GUIDE_ROLE_ORDER.map((r) => ({
            name: `${ROLES[r].emoji} ${roleName("vi", r)}`,
            name_localizations: enName(`${ROLES[r].emoji} ${roleName("en", r)}`),
            value: r,
          })),
        },
      ],
    },
    { name: "hoidap", name_localizations: enName("faq"), type: 1, ...both("discord.cmd.faq") },
    { name: "chucnang", name_localizations: enName("features"), type: 1, ...both("discord.cmd.features") },
    // Only people who can manage the server see this one.
    { name: "bang-huongdan", name_localizations: enName("post-guide"), type: 1, default_member_permissions: "32", dm_permission: false, ...both("discord.cmd.panel") },
  ];
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export interface Interaction {
  type: number;
  locale?: string;
  data?: { name?: string; custom_id?: string; values?: string[]; options?: { name: string; value: unknown }[] };
  message?: { flags?: number };
}

const isRole = (v: unknown): v is RoleId => typeof v === "string" && (ROLE_IDS as string[]).includes(v);

/** The reply to one interaction. Pure, so it is tested without Discord. */
export function respond(i: Interaction, opts: GuideOptions = {}): { type: number; data?: MessageData } {
  if (i.type === 1) return { type: 1 }; // PING
  const lang = langOf(i.locale);
  // A click inside an ephemeral guide message updates it in place; a click on
  // the public panel (or a command) opens a new reply only the clicker sees.
  const inPlace = i.type === 3 && ((i.message?.flags ?? 0) & EPHEMERAL) !== 0;
  const reply = (data: MessageData) => (inPlace ? { type: 7, data } : { type: 4, data: { ...data, flags: EPHEMERAL } });

  if (i.type === 2) {
    const name = i.data?.name;
    if (name === "huongdan") return reply(ask(lang));
    if (name === "vai") {
      const picked = i.data?.options?.find((o) => o.name === "ten")?.value;
      return reply(isRole(picked) ? role(lang, picked) : roles(lang));
    }
    if (name === "hoidap") return reply(faq(lang));
    if (name === "chucnang") return reply(features(lang, opts));
    // The panel itself is public: it stays in the channel for everyone.
    if (name === "bang-huongdan") return { type: 4, data: panel(lang, opts) };
  }

  if (i.type === 3) {
    const id = i.data?.custom_id ?? "";
    if (id === "g:new") return reply(ask(lang));
    if (id === "g:roles") return reply(roles(lang));
    if (id === "g:features") return reply(features(lang, opts));
    if (id === "g:faq") return reply(faq(lang));
    if (id === "g:role" && isRole(i.data?.values?.[0])) return reply(role(lang, i.data!.values![0] as RoleId));
    if (id.startsWith("g:rolego:") && isRole(id.slice(9))) return reply(role(lang, id.slice(9) as RoleId));
    if (id === "g:faqq") return reply(faq(lang, i.data?.values?.[0]));
    const flow = /^g:flow:(new|know):(\d+)$/.exec(id);
    if (flow) return reply(step(lang, flow[1] as Flow, Number(flow[2]), opts));
  }

  return { type: 4, data: { content: tr(lang, "discord.unknown"), flags: EPHEMERAL } };
}

/** Discord's application public key (hex) as a key Node can verify with. */
export function publicKeyFromHex(hex: string): KeyObject | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  // An Ed25519 SPKI header followed by the raw 32-byte key.
  return createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(hex, "hex")]), format: "der", type: "spki" });
}

export function verifySignature(key: KeyObject, signatureHex: string, timestamp: string, body: Buffer): boolean {
  if (!/^[0-9a-f]{128}$/i.test(signatureHex) || !timestamp) return false;
  try {
    return verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

export interface DiscordGuide {
  enabled: boolean;
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
}

export const INTERACTIONS_PATH = "/discord/interactions";

export function createDiscordGuide(opts: GuideOptions & { publicKey?: string }): DiscordGuide {
  const raw = opts.publicKey?.trim() ?? "";
  const key = raw ? publicKeyFromHex(raw) : null;
  if (raw && !key) console.warn("[discord] DISCORD_PUBLIC_KEY is not a 64 character hex key: the guide bot is off");
  return {
    enabled: !!key,
    async handle(req, res) {
      if ((req.url ?? "").split("?")[0] !== INTERACTIONS_PATH) return false;
      const send = (status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
      };
      if (!key) return send(404, { ok: false }), true;
      if (req.method !== "POST") return send(405, { ok: false }), true;
      const body = await readBody(req, 64 * 1024);
      const sig = String(req.headers["x-signature-ed25519"] ?? "");
      const ts = String(req.headers["x-signature-timestamp"] ?? "");
      if (!body || !verifySignature(key, sig, ts, body)) return send(401, { error: "invalid request signature" }), true;
      let interaction: Interaction;
      try {
        interaction = JSON.parse(body.toString());
      } catch {
        return send(400, { ok: false }), true;
      }
      send(200, respond(interaction, opts));
      return true;
    },
  };
}
