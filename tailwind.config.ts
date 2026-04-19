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
        primary: '#20808D',
        'primary-light': '#1A6A75',
        'primary-bg': '#E8F4F5',
        background: '#F8F8F5',
        sidebar: '#F3F3EE',
        'row-even': '#FAFAF8',
        complete: '#22C55E',
        planned: '#F59E0B',
        foreground: "var(--foreground)",
        border: '#E3E3E0',
        divider: '#F0F0EE',
        'text-secondary': '#6F6F6B',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-noto-sans-kr)', '-apple-system', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 8px rgba(0, 0, 0, 0.04)',
        card: '0 4px 20px rgba(0, 0, 0, 0.06)',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
};
export default config;
