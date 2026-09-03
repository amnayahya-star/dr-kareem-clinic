import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "عيادة الدكتور عبد الكريم عليوي | طب الأطفال وحديثي الولادة",
  description: "نظام إدارة متكامل لعيادة طب الأطفال وحديثي الولادة - د. عبد الكريم عليوي",
  applicationName: "عيادة د. عبد الكريم عليوي",
  authors: [{ name: "الدكتور عبد الكريم عليوي" }],
  keywords: ["طب أطفال", "حديثي الولادة", "عيادة", "وصفة طبية", "ملف طبي"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#147D7A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen bg-[#F7F9FA] antialiased font-sans text-slate-800 selection:bg-[#147D7A] selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
