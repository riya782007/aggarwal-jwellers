"use client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** GA4 (0049) — renders nothing unless NEXT_PUBLIC_GA4_ID is set. SPA pageviews on route change. */
export function Analytics() {
  const id = process.env.NEXT_PUBLIC_GA4_ID;
  const pathname = usePathname();
  useEffect(() => {
    if (!id || typeof window === "undefined" || !(window as any).gtag) return;
    (window as any).gtag("event", "page_view", { page_path: pathname });
  }, [id, pathname]);
  if (!id) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${id}', { send_page_view: false });
      `}</Script>
    </>
  );
}
