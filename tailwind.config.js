/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        card: "rgb(var(--color-card) / <alpha-value>)",
        card2: "rgb(var(--color-card2) / <alpha-value>)",
        input: "rgb(var(--color-input) / <alpha-value>)",
        fill: "rgb(var(--color-fill) / <alpha-value>)",
        fill2: "rgb(var(--color-fill2) / <alpha-value>)",
        text: "rgb(var(--color-text) / <alpha-value>)",
        text2: "rgb(var(--color-text2) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        muted2: "rgb(var(--color-muted2) / <alpha-value>)",
        faint: "rgb(var(--color-faint) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        gold: "rgb(var(--color-gold) / <alpha-value>)",
        "on-gold": "rgb(var(--color-on-gold) / <alpha-value>)",
        positive: "rgb(var(--color-positive) / <alpha-value>)",
        negative: "rgb(var(--color-negative) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Fraunces_600SemiBold"],
        "display-medium": ["Fraunces_500Medium"],
        body: ["IBMPlexSans_400Regular"],
        "body-medium": ["IBMPlexSans_500Medium"],
        "body-semibold": ["IBMPlexSans_600SemiBold"],
        mono: ["IBMPlexMono_500Medium"],
        "mono-semibold": ["IBMPlexMono_600SemiBold"],
      },
    },
  },
  plugins: [],
};
