import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { ToastHost } from "@/components/ui";
import "./globals.css";

const body = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Ma Sói Online · Werewolf Online",
  description: "Quản trò Ma Sói trực tiếp bằng QR & điện thoại — Run a live Werewolf game with phones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={body.variable}>
      <body className="font-sans antialiased">
        <I18nProvider>
          {children}
          <ToastHost />
        </I18nProvider>
      </body>
    </html>
  );
}
