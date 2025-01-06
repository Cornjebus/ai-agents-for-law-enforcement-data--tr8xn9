import type { Config } from 'tailwindcss' // v3.3+

const config: Config = {
  // Content sources for Tailwind to process
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
  ],

  // Theme customization
  theme: {
    extend: {
      // Typography system
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Roboto', 'system-ui', 'sans-serif'],
      },

      // Font size scale
      fontSize: {
        'xs': '12px',
        'sm': '14px',
        'base': '16px',
        'lg': '20px',
        'xl': '24px',
        '2xl': '32px',
      },

      // Color palette with WCAG 2.1 AA compliant contrast ratios
      colors: {
        primary: '#2563EB',    // Blue 600
        secondary: '#3B82F6',  // Blue 500
        success: '#059669',    // Green 600
        error: '#DC2626',      // Red 600
        gray: {
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },

      // Spacing scale based on 4px grid
      spacing: {
        '0': '0px',
        '1': '4px',    // Base unit
        '2': '8px',    // 2x base
        '3': '12px',   // 3x base
        '4': '16px',   // Standard padding/margin
        '6': '24px',   // Large padding/margin
        '8': '32px',   // Extra large padding/margin
        '12': '48px',  // Section spacing
        '16': '64px',  // Large section spacing
      },

      // Shadow system
      boxShadow: {
        'sm': '0 2px 4px rgba(0,0,0,0.1)',
        'md': '0 4px 6px rgba(0,0,0,0.1)',
        'lg': '0 10px 15px rgba(0,0,0,0.1)',
      },

      // Responsive breakpoints
      screens: {
        'mobile': '320px',
        'tablet': '768px',
        'desktop': '1024px',
        'wide': '1440px',
      },
    },
  },

  // Tailwind plugins for enhanced functionality
  plugins: [
    require('@tailwindcss/forms'),     // Form element styling
    require('@tailwindcss/typography'), // Prose content styling
    require('@tailwindcss/aspect-ratio'), // Aspect ratio utilities
  ],
}

export default config