import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Grenze_Gotisch, Dancing_Script, JetBrains_Mono, Oswald, Pacifico, Playfair_Display } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { ToastHost } from "@/components/ui";
import { ProfileHost } from "@/components/Profile";
import { GameReplayHost } from "@/components/GameReplay";
import { NightBackdrop } from "@/components/art/NightBackdrop";
import "./globals.css";

const body = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-body",
});
const title = Grenze_Gotisch({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--font-title" });
// Fonts players can pick for their name (all include Vietnamese glyphs).
const nfSerif = Playfair_Display({ subsets: ["latin", "vietnamese"], weight: ["700"], variable: "--font-nf-serif" });
const nfScript = Dancing_Script({ subsets: ["latin", "vietnamese"], weight: ["700"], variable: "--font-nf-script" });
const nfCondensed = Oswald({ subsets: ["latin", "vietnamese"], weight: ["600"], variable: "--font-nf-condensed" });
const nfMono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], weight: ["700"], variable: "--font-nf-mono" });
const nfBrush = Pacifico({ subsets: ["latin", "vietnamese"], weight: ["400"], variable: "--font-nf-brush" });
const fontVars = [body, title, nfSerif, nfScript, nfCondensed, nfMono, nfBrush].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Ma Sói Online",
  description: "Quản trò Ma Sói trực tiếp bằng QR và điện thoại. Run a live Werewolf game with phones.",
  applicationName: "Ma Sói Online",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Ma Sói", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0d0a22",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={fontVars}>
      <body className="font-sans antialiased">
        <NightBackdrop />
        <I18nProvider>
          {children}
          <ProfileHost />
          <GameReplayHost />
          <ToastHost />
        </I18nProvider>
      </body>
    </html>
  );
}
