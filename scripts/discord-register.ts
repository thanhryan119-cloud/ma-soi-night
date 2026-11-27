// Registers the guide bot's slash commands with Discord.
// Run once after creating the app, and again whenever the commands change:
//   npm run discord:register
// Needs DISCORD_APP_ID and DISCORD_BOT_TOKEN (from .env or the shell).
// With DISCORD_GUILD_ID the commands go to that one server and show up at
// once; without it they are global and can take up to an hour to appear.

import { commandDefinitions } from "../server/discordGuide";

try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
} catch {
  /* no .env file */
}

const appId = process.env.DISCORD_APP_ID?.trim();
const token = process.env.DISCORD_BOT_TOKEN?.trim();
const guild = process.env.DISCORD_GUILD_ID?.trim();
if (!appId || !token) {
  console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN first (Discord Developer Portal → your app).");
  process.exit(1);
}

const url = guild
  ? `https://discord.com/api/v10/applications/${appId}/guilds/${guild}/commands`
  : `https://discord.com/api/v10/applications/${appId}/commands`;

const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commandDefinitions()),
});
if (!res.ok) {
  console.error(`Discord answered ${res.status}:`, await res.text());
  process.exit(1);
}
const list = (await res.json()) as { name: string }[];
console.log(`Registered ${list.length} commands ${guild ? `on server ${guild}` : "globally"}: ${list.map((c) => `/${c.name}`).join(", ")}`);
