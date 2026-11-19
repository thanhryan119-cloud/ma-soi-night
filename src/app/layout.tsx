import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Cormorant_Garamond, Dancing_Script, JetBrains_Mono, Oswald, Pacifico, Playfair_Display } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { ToastHost } from "@/components/ui";
import "./globals.css";

const body = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-body",
});
const title = Cormorant_Garamond({ subsets: ["latin", "vietnamese"], weight: ["600", "700"], variable: "--font-title" });
// Fonts players can pick for their name (all include Vietnamese glyphs).
const nfSerif = Playfair_Display({ subsets: ["latin", "vietnamese"], weight: ["700"], variable: "--font-nf-serif" });
const nfScript = Dancing_Script({ subsets: ["latin", "vietnamese"], weight: ["700"], variable: "--font-nf-script" });
const nfCondensed = Oswald({ subsets: ["latin", "vietnamese"], weight: ["600"], variable: "--font-nf-condensed" });
const nfMono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], weight: ["700"], variable: "--font-nf-mono" });
const nfBrush = Pacifico({ subsets: ["latin", "vietnamese"], weight: ["400"], variable: "--font-nf-brush" });
const fontVars = [body, title, nfSerif, nfScript, nfCondensed, nfMono, nfBrush].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Ma Sói Online by Ryan",
  description: "Quản trò Ma Sói trực tiếp bằng QR & điện thoại — Run a live Werewolf game with phones.",
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
        <I18nProvider>
          {children}
          <ToastHost />
        </I18nProvider>
      </body>
    </html>
  );
}
