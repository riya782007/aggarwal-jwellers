import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Aggarwal Jewellers "Royal Jeweller" palette ──────────────────────
        // Token names are kept stable (used across all components); only the
        // values are tuned for the Aggarwal identity: imperial green + antique
        // gold + royal wine on warm ivory. Swap values here to retheme the whole app.
        ivory: "#FBF8F1",
        cream: "#F2E9D7",
        sand: "#E5D6B8",
        ink: "#1C1622",
        muted: "#6B6175",
        emerald: { DEFAULT: "#0E5446", dark: "#073328", light: "#2C8472", mist: "#E7F1ED" },
        gold: { DEFAULT: "#B68A34", light: "#E3C079", dark: "#8A6620" },
        rose: { DEFAULT: "#7E2B3E", light: "#E7CCD2" },
        wine: "#5C1E2E",
        // Convenience aliases for new work (map to the same brand hues).
        royal: { DEFAULT: "#0E5446", gold: "#B68A34", wine: "#7E2B3E", ink: "#1C1622" },
        diva: { rose: "#7E2B3E", gold: "#B68A34", ink: "#1C1622", cream: "#FBF8F1" },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        body: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        luxe: "0 10px 40px -12px rgba(28,22,34,0.18)",
        card: "0 6px 24px -10px rgba(28,22,34,0.16)",
        gold: "0 8px 30px -8px rgba(182,138,52,0.35)",
      },
      keyframes: {
        fadeUp: { "0%": { opacity: "0", transform: "translateY(18px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        pop: { "0%": { transform: "scale(0.9)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
        spinSlow: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        fadeUp: "fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both",
        fadeIn: "fadeIn 0.8s ease both",
        float: "float 5s ease-in-out infinite",
        marquee: "marquee 24s linear infinite",
        shimmer: "shimmer 2.5s linear infinite",
        pop: "pop 0.35s cubic-bezier(0.16,1,0.3,1) both",
        spinSlow: "spinSlow 14s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
