import type { Config } from "tailwindcss";

/*
  Theme: "lamplit practice room at night."

  The catalogue/detail/upload components were built against Tailwind's default
  cool `neutral` + `amber` ramps. Rather than touch every file, we REDEFINE
  those two ramps here to warm, room-toned values so the whole app inherits the
  studio palette: warm near-black grounds, ivory (piano-key) text, brass accent.
  Named tokens (room/ivory/brass/felt) are also provided for new code.
*/
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Warm grayscale ramp — replaces Tailwind's cool neutral.
        neutral: {
          50: "#f6f1e7",
          100: "#ece4d3", // ivory — primary text
          200: "#d8cdb6",
          300: "#bcae93",
          400: "#a89e8c", // ivory-dim — secondary text
          500: "#8a7f6b",
          600: "#6b6151",
          700: "#3a3024",
          800: "#2c251c", // hairline borders
          900: "#1f1a14", // raised surfaces / cards
          950: "#16130f", // room ground
        },
        // Brass accent ramp — replaces Tailwind's amber.
        amber: {
          300: "#e4c089",
          400: "#caa46a", // the accent
          500: "#b88f4f",
          600: "#9a7639",
        },
        // Named tokens for new code.
        room: {
          DEFAULT: "#16130f",
          raised: "#1f1a14",
          line: "#2c251c",
        },
        ivory: {
          DEFAULT: "#ece4d3",
          dim: "#a89e8c",
        },
        brass: {
          DEFAULT: "#caa46a",
          bright: "#e4c089",
        },
        felt: "#3f5d52",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Fraunces", "Georgia", "serif"],
        sans: [
          "var(--font-sans)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
