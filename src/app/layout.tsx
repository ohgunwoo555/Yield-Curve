import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "국채 수익률 조회기",
  description: "주요국 국채 수익률과 전일비·전주비·전월비·전년비를 한 화면에서 비교",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
