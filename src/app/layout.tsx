import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Табель — учёт рабочих часов и ЗП",
  description:
    "Табель учёта рабочего времени: кастомные промежутки, обеды, несколько профилей, подсчёт часов и примерной зарплаты за месяц, выгрузка для HR.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>
          {children}
          <Toaster richColors position="top-center" closeButton />
        </Providers>
      </body>
    </html>
  );
}
