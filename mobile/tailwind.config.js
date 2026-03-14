module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        surface: '#18181b',
        border: '#27272a',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
};
