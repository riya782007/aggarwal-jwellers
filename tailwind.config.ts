import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: "#FCF8EF",
        cream: "#F7EEDC",
        sand: "#EBDCC0",
        ink: "#451117",
        muted: "#7A6455",
        emerald: { DEFAULT: "#2F6B3C", dark: "#224D2B", light: "#4C8A58", mist: "#EAF2E8" },
        gold: { DEFAULT: "#C79A2D", light: "#E9CF8B", dark: "#96701C" },
        rose: { DEFAULT: "#B3383E", light: "#EFC9C6" },
        wine: "#7B1E28",
        diva: { rose: "#B3383E", gold: "#C79A2D", ink: "#451117", cream: "#FCF8EF" },
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        body: ['"Mukta"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        luxe: "0 10px 40px -12px rgba(69,17,23,0.18)",
        card: "0 6px 24px -10px rgba(69,17,23,0.16)",
        gold: "0 8px 30px -8px rgba(199,154,45,0.35)",
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
