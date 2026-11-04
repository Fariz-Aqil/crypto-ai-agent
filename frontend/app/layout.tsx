import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Web3Provider from "../components/Web3Provider";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Si Paling Trading",
  description: "Analisis teknikal dan sinyal AI untuk kripto, emas, dan forex",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${plex.variable} h-full antialiased notranslate`} translate="no" suppressHydrationWarning>
      <body className="min-h-full bg-bg text-ink" suppressHydrationWarning>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
