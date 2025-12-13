/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'inherit',
            a: {
              color: '#3b82f6',
              '&:hover': {
                color: '#2563eb',
              },
            },
            code: {
              backgroundColor: '#f3f4f6',
              padding: '0.2rem 0.4rem',
              borderRadius: '0.25rem',
              fontWeight: '400',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
            pre: {
              backgroundColor: '#1f2937',
              code: {
                backgroundColor: 'transparent',
                color: '#e5e7eb',
              },
            },
          },
        },
        dark: {
          css: {
            color: '#e5e7eb',
            a: {
              color: '#60a5fa',
              '&:hover': {
                color: '#3b82f6',
              },
            },
            code: {
              backgroundColor: '#374151',
              color: '#e5e7eb',
            },
            h1: { color: '#f3f4f6' },
            h2: { color: '#f3f4f6' },
            h3: { color: '#f3f4f6' },
            h4: { color: '#f3f4f6' },
            strong: { color: '#f3f4f6' },
            blockquote: {
              color: '#d1d5db',
              borderLeftColor: '#4b5563',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
