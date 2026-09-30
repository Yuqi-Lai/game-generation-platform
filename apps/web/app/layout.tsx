import type { Metadata } from "next";
import { Inter, Silkscreen } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const pixel = Silkscreen({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Game Production Platform — Turn ideas into playable worlds",
  description:
    "Generate playable 2D game worlds from a prompt, then version, review, play and export them as content packs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${pixel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
