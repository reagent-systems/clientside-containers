import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { BASE_PATH } from "@/lib/base-path";
import "./globals.css";

// Origin used to resolve social-card image URLs (Open Graph and Twitter require
// absolute URLs). Defaults to the published Pages origin; override with
// NEXT_PUBLIC_SITE_URL when self-hosting elsewhere. The base path is appended so
// metadataBase carries it, and Next joins it with the image path below.
const siteOrigin =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://thyfriendlyfox.github.io";
const siteUrl = `${siteOrigin}${BASE_PATH}`;

// Root-relative: Next joins this with metadataBase's path, so do NOT prepend
// BASE_PATH here (that would duplicate it).
const ogImage = "/og.png";
const title = "clientside-containers";
const description = "Containers that run entirely in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    type: "website",
    url: "/",
    siteName: title,
    title,
    description,
    images: [
      {
        url: ogImage,
        width: 1536,
        height: 1024,
        alt: "clientside-containers — containers that run in the browser",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
