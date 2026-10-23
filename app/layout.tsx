import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ModeBadge } from "@/components/ModeBadge";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", axes: ["wdth"] });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Sopan — see it on you, tudung and all",
  description: "Hijab-aware virtual try-on for Malaysian modest-fashion sellers and shoppers, built on the YouCam API.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2b1830" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="wrap">
          <header className="topbar">
            <Link href="/" className="brand"><span className="brand-mark" aria-hidden />Sopan</Link>
            <nav className="nav" aria-label="Main">
              <Link href="/try">Try on</Link>
              <Link href="/seller">For sellers</Link>
              <Link href="/how">How it works</Link>
            </nav>
            <ModeBadge />
          </header>
          <main>{children}</main>
          <footer>
            <p>
              Try-on images are generated with the YouCam API (AI Clothes Virtual Try-On cloth-v4, AI Facial Color Tones Analyzer).
              Sopan&rsquo;s tudung and coverage checks run on your device with MediaPipe. Every image is a visual preview, not a fit or coverage guarantee.
            </p>
            <p>Demo model photos: Unsplash and Pexels contributors (see <Link href="/how#credits">credits</Link>). Sopan is a hackathon project, MIT licensed.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
