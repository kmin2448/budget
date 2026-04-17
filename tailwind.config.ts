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
        primary: '#1F5C99',
        'primary-light': '#2E75B6',
        'primary-bg': '#D6E4F0',
        background: '#F8FAFC',
        'row-even': '#F5F9FC',
        complete: '#22C55E',
        planned: '#F59E0B',
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
