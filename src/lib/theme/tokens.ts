// Solid hex values mirrored from src/global.css / tailwind.config.js — kept
// here for the rare case a component needs a raw color value (e.g. an SVG
// stroke prop) rather than a NativeWind className. Keep these two
// representations in sync by hand; there's no single source of truth yet.
export const darkTokens = {
  bg: "#101218",
  card: "#171A21",
  card2: "#141720",
  input: "#1B1E27",
  fill: "#22262F",
  fill2: "#2A2E38",
  text: "#EDEEF2",
  text2: "#C9CDD8",
  muted: "#8B8FA0",
  muted2: "#5C6070",
  faint: "#4A4E5C",
  line: "#EDEEF2",
  gold: "#D9A441",
  onGold: "#101218",
  positive: "#6FCF97",
  negative: "#E0664F",
  info: "#4FA6D9",
} as const;

export const lightTokens = {
  bg: "#F6F7FA",
  card: "#FFFFFF",
  card2: "#F0F2F6",
  input: "#EDEFF4",
  fill: "#E3E6EC",
  fill2: "#CFD3DC",
  text: "#1A1C22",
  text2: "#3A3E48",
  muted: "#666B7A",
  muted2: "#8A8F9C",
  faint: "#A8ADB8",
  line: "#14161C",
  gold: "#A9761C",
  onGold: "#FFFFFF",
  positive: "#2E9E63",
  negative: "#C4462F",
  info: "#2B7FB0",
} as const;

export type ThemeTokens = typeof darkTokens;
export type ThemePreference = "system" | "light" | "dark";

// For the rare plain-RN-style-object (not a NativeWind className) that
// needs a translucent tint/border of a token color, e.g. `line` at low
// opacity for a hairline border.
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
