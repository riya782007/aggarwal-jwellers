import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Blythe Diva — Artificial Jewellery, Sadar Bazar Delhi", template: "%s | Blythe Diva" },
  description: "Retail & wholesale artificial jewellery from Blythe Diva, Sadar Bazar, Rui Mandi, Delhi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
