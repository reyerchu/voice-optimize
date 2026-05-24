import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "聲音優化室 · Voice Optimize",
  description:
    "上傳 Podcast 錄音，自動產生逐字稿，文字稿剪輯即音訊剪輯，一鍵降噪、響度正規化並匯出 MP3。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur">
          <div className="mx-auto max-w-5xl px-5 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="text-xl">🎙️</span>
              <span>聲音優化室</span>
              <span className="text-zinc-500 text-sm font-normal">Voice Optimize</span>
            </Link>
            <a
              href="https://github.com/reyerchu/voice-optimize"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              GitHub
            </a>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-800/80 py-4 text-center text-xs text-zinc-500">
          錄音 → 逐字稿 → 文字剪輯 → 降噪／響度 → 匯出 MP3
        </footer>
      </body>
    </html>
  );
}
