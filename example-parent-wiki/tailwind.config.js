import frameworkConfig from './wiki-framework/tailwind.config.js';

/** @type {import('tailwindcss').Config} */
export default {
  // Extend the framework's Tailwind configuration
  ...frameworkConfig,

  // Add your content paths
  content: [
    './index.html',
    './main.jsx',
    './wiki-framework/src/**/*.{js,ts,jsx,tsx}',
  ],

  // You can override theme, plugins, etc. here
  theme: {
    ...frameworkConfig.theme,
    extend: {
      ...frameworkConfig.theme.extend,
      // Your custom theme extensions
    },
  },
};
