import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { colorScheme as nativewindColorScheme, useColorScheme } from "nativewind";
import type { ThemePreference } from "./tokens";

type ThemeContextValue = {
  preference: ThemePreference;
  // Effective scheme after resolving "system" against the OS setting —
  // handy for platform APIs (status bar style, etc.) that want a concrete
  // light/dark rather than the tri-state preference.
  resolvedScheme: "light" | "dark";
  setPreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Missing/unset preference means dark, not "system" — dark is Ledger's
// actual default, distinct from "follow the OS."
export function ThemeProvider({
  initialPreference = "dark",
  onPreferenceChange,
  children,
}: {
  initialPreference?: ThemePreference;
  onPreferenceChange?: (pref: ThemePreference) => void;
  children: ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    nativewindColorScheme.set(preference);
  }, [preference]);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      onPreferenceChange?.(pref);
    },
    [onPreferenceChange]
  );

  return (
    <ThemeContext.Provider
      value={{ preference, resolvedScheme: colorScheme === "dark" ? "dark" : "light", setPreference }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
