import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import {
  getHouseholdMemberCount,
  getMyMembership,
  getOnboarded,
  setMyNicknames,
  setMyThemePreference,
} from "@/lib/supabase/queries";
import type { ThemePreference } from "@/lib/theme/tokens";

type HouseholdContextValue = {
  loading: boolean;
  householdId: string | null;
  role: "owner" | "member" | null;
  themePreference: ThemePreference;
  onboarded: boolean;
  // How many people are in this household (drives whether Activity shows the
  // "by <who>" tag at all — pointless when it's just you).
  memberCount: number;
  // This viewer's private nicknames for other members: { memberUserId: nickname }.
  nicknames: Record<string, string>;
  refresh: () => Promise<void>;
  setThemePreference: (pref: ThemePreference) => void;
  setNicknames: (next: Record<string, string>) => void;
};

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

// Single fetch point for "which household, what role, onboarded yet" — the
// three route-group layouts ((auth), (onboarding), (tabs)) all read from
// here for their redirect decision instead of each re-querying and risking
// inconsistent in-flight state. Categories/fixed expenses/periods are real
// tables now, loaded per-screen rather than centrally cached here.
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "member" | null>(null);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("dark");
  const [onboarded, setOnboarded] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [nicknames, setNicknamesState] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session) {
      setHouseholdId(null);
      setRole(null);
      setThemePreferenceState("dark");
      setOnboarded(false);
      setMemberCount(0);
      setNicknamesState({});
      setLoading(false);
      return;
    }
    const membership = await getMyMembership(supabase, session.user.id);
    if (!membership) {
      // Reachable mid-session now (leave/removal), not just at sign-out —
      // reset every field, not just householdId, so a stale role/theme/
      // onboarded/nicknames from the old household can't leak into the next one.
      setHouseholdId(null);
      setRole(null);
      setThemePreferenceState("dark");
      setOnboarded(false);
      setMemberCount(0);
      setNicknamesState({});
      setLoading(false);
      return;
    }
    setHouseholdId(membership.householdId);
    setRole(membership.role);
    setThemePreferenceState(membership.themePreference);
    setNicknamesState(membership.nicknames);
    const [onboardedFlag, count] = await Promise.all([
      getOnboarded(supabase, membership.householdId),
      getHouseholdMemberCount(supabase, membership.householdId),
    ]);
    setOnboarded(onboardedFlag);
    setMemberCount(count);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    load();
  }, [authLoading, load]);

  const setThemePreference = useCallback(
    (pref: ThemePreference) => {
      setThemePreferenceState(pref);
      if (session && householdId) {
        setMyThemePreference(supabase, householdId, session.user.id, pref).catch((err) =>
          console.error("failed to persist theme preference", err)
        );
      }
    },
    [session, householdId]
  );

  const setNicknames = useCallback(
    (next: Record<string, string>) => {
      setNicknamesState(next);
      if (session && householdId) {
        setMyNicknames(supabase, householdId, session.user.id, next).catch((err) =>
          console.error("failed to persist nicknames", err)
        );
      }
    },
    [session, householdId]
  );

  return (
    <HouseholdContext.Provider
      value={{
        loading,
        householdId,
        role,
        themePreference,
        onboarded,
        memberCount,
        nicknames,
        refresh: load,
        setThemePreference,
        setNicknames,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used within a HouseholdProvider");
  return ctx;
}
