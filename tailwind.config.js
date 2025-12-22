/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'ping-slow': {
          '0%': { transform: 'scale(1)', opacity: '0.3' },
          '50%': { transform: 'scale(1.5)', opacity: '0.1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.5' },
        },
        'sparkle': {
          '0%, 100%': { opacity: '0', transform: 'scale(0) rotate(0deg)' },
          '50%': { opacity: '1', transform: 'scale(1) rotate(180deg)' },
        },
        'progress-fill': {
          '0%': { width: '0%', opacity: '0' },
          '100%': { width: '100%', opacity: '1' },
        },
        'shine': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        'slide-up-fade': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'bounce-once': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'ping-slow': 'ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'pulse-slow': 'pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'sparkle-1': 'sparkle 1.5s ease-in-out infinite',
        'sparkle-2': 'sparkle 1.8s ease-in-out 0.2s infinite',
        'sparkle-3': 'sparkle 1.6s ease-in-out 0.4s infinite',
        'sparkle-4': 'sparkle 1.7s ease-in-out 0.6s infinite',
        'shake': 'shake 0.5s ease-in-out',
        'slide-up-fade': 'slide-up-fade 0.4s ease-out',
        'bounce-once': 'bounce-once 0.6s ease-out',
      },
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
            // Remove underlines from all headings
            h1: {
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h2: {
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h3: {
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h4: {
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h5: {
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h6: {
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
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
            // Remove underlines from all headings in dark mode
            h1: {
              color: '#f3f4f6',
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h2: {
              color: '#f3f4f6',
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h3: {
              color: '#f3f4f6',
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h4: {
              color: '#f3f4f6',
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h5: {
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
            h6: {
              borderBottomWidth: '0',
              paddingBottom: '0',
              a: {
                textDecoration: 'none',
              },
            },
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
