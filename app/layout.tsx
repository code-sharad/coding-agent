import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Noto_Serif, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next"

import "./globals.css";
const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const serif = Noto_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

const usernameFont = Playfair_Display({
  variable: "--font-username",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: "italic",
});

export const metadata: Metadata = {
  title: "Coding Agent",
  description: "Connect GitHub, pick a repo, and let an LLM fix or add features with live progress.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark"  >
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} ${usernameFont.variable} antialiased`}
       >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
