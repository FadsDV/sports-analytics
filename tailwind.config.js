/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic theme tokens (mapped to CSS vars)
        bg:        'var(--bg)',
        surface:   'var(--surface)',
        'surface2':'var(--surface2)',
        primary:   'var(--primary)',
        secondary: 'var(--secondary)',
        accent:    'var(--accent)',
        'text-1':  'var(--text-1)',
        'text-2':  'var(--text-2)',
        border:    'var(--border)',
        // Legacy brand colors
        brand: {
          50:  "#f0f4ff",
          100: "#dbe4ff",
          500: "#4361ee",
          600: "#3a56d4",
          700: "#2d44b0",
          900: "#1a2a7a",
        },
      },
      boxShadow: {
        'card':    '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
        'card-lg': '0 4px 16px rgba(0,0,0,0.16)',
        'live':    '0 0 16px rgba(255,122,0,0.2)',
      },
    },
  },
  plugins: [],
};
