import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: { default: "Aggarwal Jewellers — Artificial Jewellery, Sadar Bazar Delhi", template: "%s | Aggarwal Jewellers" },
  description: "Premium artificial jewellery — Kundan, Meenakari, Temple & more. Retail & wholesale from Aggarwal Jewellers, Sadar Bazar, Delhi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Mukta:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* progressive-enhancement flag for scroll reveal */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
