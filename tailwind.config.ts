import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Blythe Diva boutique palette
        diva: { rose: "#b76e79", gold: "#c9a24b", ink: "#2b2138", cream: "#faf6f0" },
      },
    },
  },
  plugins: [],
} satisfies Config;
