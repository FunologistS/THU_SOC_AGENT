import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        thupurple: {
          DEFAULT: "var(--thu-purple)",
          light: "var(--thu-purple-light)",
          dark: "var(--thu-purple-dark)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          light: "var(--accent-light)",
        },
      },
      boxShadow: {
        "thu-soft": "var(--shadow-soft)",
        "thu-card": "var(--shadow-card)",
        "thu-dialog": "var(--shadow-dialog)",
      },
      ringColor: {
        thupurple: "var(--thu-purple)",
      },
    },
  },
  plugins: [],
};
export default config;
