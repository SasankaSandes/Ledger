"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  householdSettingsToRow,
  monthlyStructureFromRow,
  reconcileMonthlyFromSettings,
  type HouseholdSettings,
} from "@/lib/types";
import SettingsEditor from "./settings/SettingsEditor";

const DEBOUNCE_MS = 500;

export default function SettingsView({
  householdId,
  initialSettings,
}: {
  householdId: string;
  initialSettings: HouseholdSettings;
}) {
  const [settings, setSettings] = useState<HouseholdSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    async (next: HouseholdSettings) => {
      setSaving(true);
      const supabase = createClient();

      const { error } = await supabase
        .from("household_settings")
        .update({ ...householdSettingsToRow(next), updated_at: new Date().toISOString() })
        .eq("household_id", householdId);
      if (error) console.error("save failed", error);

      // Cascade the structural change into the open period right away —
      // names/caps/entries come from settings, existing paid flags and
      // logged items are preserved by id (dropped entries take their spend
      // with them, per reconcileMonthlyFromSettings).
      const { data: current } = await supabase
        .from("budgets")
        .select("month, salary, fixed, budget, allowances, top_ups")
        .eq("household_id", householdId)
        .is("closed_at", null)
        .maybeSingle();
      if (current) {
        const reconciled = reconcileMonthlyFromSettings(next, monthlyStructureFromRow(current));
        const { error: reconcileError } = await supabase
          .from("budgets")
          .update({
            fixed: reconciled.fixed,
            budget: reconciled.budget,
            allowances: reconciled.allowances,
            updated_at: new Date().toISOString(),
          })
          .eq("household_id", householdId)
          .eq("month", current.month);
        if (reconcileError) console.error("reconcile failed", reconcileError);
      }

      setSaving(false);
    },
    [householdId]
  );

  const update = (next: HouseholdSettings) => {
    setSettings(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(next), DEBOUNCE_MS);
  };

  useEffect(() => {
    const timer = debounceRef.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      style={{
        background: "#101218",
        minHeight: "100vh",
        padding: "28px 18px 60px",
        fontFamily: "var(--font-ibm-plex-sans), sans-serif",
        color: "#EDEEF2",
      }}
    >
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
          <div style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 22, fontWeight: 600 }}>
            Manage
          </div>
          <Link href="/dashboard" style={{ fontSize: 11.5, color: "#8B8FA0" }}>
            ← Dashboard
          </Link>
        </div>
        <div style={{ fontSize: 11, color: saving ? "#D9A441" : "#5A5F6D", marginBottom: 20, height: 14 }}>
          {saving ? "saving…" : "saved"}
        </div>

        <div style={{ background: "#171A21", border: "1px solid #23262F", borderRadius: 16, padding: "22px 20px" }}>
          <SettingsEditor value={settings} onChange={update} />
        </div>

        <div style={{ fontSize: 11.5, color: "#5A5F6D", marginTop: 14, lineHeight: 1.5 }}>
          Changes here apply to this month right away and carry forward to every month after.
        </div>
      </div>
    </div>
  );
}
