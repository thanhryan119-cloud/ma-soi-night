import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Playfair_Display } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { ToastHost } from "@/components/ui";
import "./globals.css";

const body = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
});
const title = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  weight: ["700", "900"],
  variable: "--font-title",
});

export const metadata: Metadata = {
  title: "Ma Sói Night · Werewolf Night",
  description: "Quản trò Ma Sói trực tiếp bằng QR & điện thoại — Run a live Werewolf game with phones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#05060d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${body.variable} ${title.variable}`}>
      <body className="font-sans antialiased">
        <I18nProvider>
          {children}
          <ToastHost />
        </I18nProvider>
      </body>
    </html>
  );
}
