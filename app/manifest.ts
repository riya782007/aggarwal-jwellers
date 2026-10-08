import type { MetadataRoute } from "next";

/** Installable app for counter PCs (Chrome/Edge "Install") and phones ("Add to Home screen").
 *  Internal service worker caches only a static offline notice; stock and prices stay live. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aggarwal Jewellers",
    short_name: "Aggarwal",
    description: "Billing, stock and labels for Aggarwal Jewellers.",
    id: "/admin",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#451117",
    theme_color: "#451117",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
