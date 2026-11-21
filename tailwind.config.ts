import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#F2C900",
          "yellow-dark": "#D4AF00",
          anthracite: "#25282B",
          "anthracite-soft": "#3A3E42",
          grey: "#F4F5F6",
          border: "#DCDFE2",
        },
        ok: { DEFAULT: "#1B8A3C", soft: "#E3F4E8" },
        bad: { DEFAULT: "#C62828", soft: "#FBE6E6" },
        info: { DEFAULT: "#1565C0", soft: "#E3EEFA" },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
