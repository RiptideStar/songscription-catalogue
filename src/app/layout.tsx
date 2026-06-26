import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Display: Fraunces — a warm old-style serif with optical sizing. Carries the
// "music room / editorial" personality without reading like a default serif.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

// Body / UI: Inter.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Data: monospace for the precise numbers a learner reads — BPM, durations,
// note ranges, MIDI values. Treats the metadata like instrument readouts.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Songscription — your transcriptions",
  description:
    "Every song you've transcribed, ready to practice. Upload a MIDI, browse your catalogue, and sit down at the piano roll.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}>
      <body className="antialiased font-sans bg-room text-ivory min-h-screen">
        {children}
      </body>
    </html>
  );
}
