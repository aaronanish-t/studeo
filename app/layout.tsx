import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { THEME_INIT_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Studeo",
    template: "%s · Studeo",
  },
  description:
    "Attendance, marks and timetable for SRM students — plus the one thing the portal can't do: find when your whole group is free.",
  applicationName: "Studeo",
  appleWebApp: {
    capable: true,
    title: "Studeo",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Studeo",
    description: "Your semester, without the portal.",
    siteName: "Studeo",
    type: "website",
  },
};

export const viewport: Viewport = {
  // Matches --ground. This is the colour a phone browser paints its own chrome,
  // so a stale value here shows up as a mismatched bar above the page — the one
  // colour in the app that CSS variables can't reach.
  themeColor: "#f7f6f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The pre-paint script below stamps data-theme before React runs, which
      // is by definition a difference between server and client markup.
      suppressHydrationWarning
    >
      <head>
        {/* Must run before first paint, and before anything renders — a viewer
            who chose dark would otherwise get a white flash until hydration.
            See components/theme-toggle.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
