import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";

// Atkinson Hyperlegible was drawn for low-vision readers: distinct 1/l/I and
// 0/O, which matters for CINs, sizes and a phone read in a dim drill hall.
const uiSans = Atkinson_Hyperlegible_Next({
  variable: "--font-ui-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const uiMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-ui-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "317 SMS",
  description: "317 Squadron management system",
  // iOS reads these instead of the manifest: open full-screen from the Home
  // Screen, with the status bar over the app's own (dark) header.
  appleWebApp: { capable: true, title: "317 SMS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  // The browser chrome and the installed app's title bar match the page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#070c16" },
  ],
  // Lets the page draw under a phone's notch and home bar; the tab bar pads
  // itself back out with env(safe-area-inset-bottom).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables go on <html>: Tailwind's preflight reads --font-sans
    // there, so a class on <body> would leave the whole app in the fallback.
    <html lang="en" suppressHydrationWarning className={`${uiSans.variable} ${uiMono.variable}`}>
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
