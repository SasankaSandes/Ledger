import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Period } from "@/lib/types";

type SelectedMonthContextValue = {
  // The month Home and Activity are both looking at. null means "the open
  // month", so the selection follows along when a new month is started
  // instead of staying pinned to a period that just closed.
  selectedPeriodId: string | null;
  setSelectedPeriodId: (id: string | null) => void;
};

const SelectedMonthContext = createContext<SelectedMonthContextValue | null>(null);

// One month selection shared by every tab, so flipping to August on Home and
// then opening Activity (or the reverse) stays on August. Lives above the
// tab navigator — its screens stay mounted, but each keeps its own state, so
// the selection has to sit outside them.
export function SelectedMonthProvider({ children }: { children: ReactNode }) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedPeriodId, setSelectedPeriodId }), [selectedPeriodId]);
  return <SelectedMonthContext.Provider value={value}>{children}</SelectedMonthContext.Provider>;
}

// Resolves the shared selection against a screen's own `periods` list (most
// recent first, so index 0 is the open month) and hands back the switcher
// wiring. An unset or vanished selection falls back to the open month.
export function useViewedMonth(periods: Period[]) {
  const ctx = useContext(SelectedMonthContext);
  if (!ctx) throw new Error("useViewedMonth must be used within a SelectedMonthProvider");
  const { selectedPeriodId, setSelectedPeriodId } = ctx;

  const found = selectedPeriodId ? periods.findIndex((p) => p.id === selectedPeriodId) : 0;
  const viewedIndex = found === -1 ? 0 : found;
  const viewedPeriod = periods[viewedIndex] ?? null;

  const goTo = (index: number) => {
    const target = periods[index];
    if (target) setSelectedPeriodId(index === 0 ? null : target.id);
  };

  return {
    viewedPeriod,
    isOpen: viewedIndex === 0,
    canGoOlder: viewedIndex < periods.length - 1,
    canGoNewer: viewedIndex > 0,
    goOlder: () => goTo(viewedIndex + 1),
    goNewer: () => goTo(viewedIndex - 1),
  };
}
