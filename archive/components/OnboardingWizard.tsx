"use client";

import { type CSSProperties, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_HOUSEHOLD_SETTINGS, householdSettingsToRow, type HouseholdSettings } from "@/lib/types";
import SettingsEditor from "./settings/SettingsEditor";

const STEPS: {
  key: "salary" | "fixed" | "budget" | "allowances";
  blurb: string;
}[] = [
  { key: "salary", blurb: "What do you take home each month?" },
  {
    key: "fixed",
    blurb: "Rent, loans, subscriptions — anything that costs the same amount every month.",
  },
  {
    key: "budget",
    blurb: "Spending buckets you want to track and cap, like groceries or eating out.",
  },
  {
    key: "allowances",
    blurb:
      "Money you're given to use directly or claim back as cash — fuel, mobile, etc. Set each to reset monthly, or once a year for annual allowances.",
  },
];

export default function OnboardingWizard({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [settings, setSettings] = useState<HouseholdSettings>(EMPTY_HOUSEHOLD_SETTINGS);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLast = step === STEPS.length - 1;

  const finish = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("household_settings").upsert(
      {
        household_id: householdId,
        ...householdSettingsToRow(settings),
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "household_id" }
    );
    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

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
        <div
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontSize: 22,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Let&rsquo;s set up Ledger
        </div>
        <div style={{ fontSize: 11.5, color: "#8B8FA0", marginBottom: 20 }}>
          Step {step + 1} of {STEPS.length}
        </div>

        <div
          style={{
            background: "#171A21",
            border: "1px solid #23262F",
            borderRadius: 16,
            padding: "22px 20px",
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 12.5, color: "#8B8FA0", marginBottom: 16 }}>
            {STEPS[step].blurb}
          </div>
          <SettingsEditor value={settings} onChange={setSettings} sections={[STEPS[step].key]} />
        </div>

        {error && <div style={{ fontSize: 12.5, color: "#E0664F", marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{
              ...secondaryBtn,
              opacity: step === 0 ? 0.4 : 1,
              cursor: step === 0 ? "default" : "pointer",
            }}
          >
            Back
          </button>
          {isLast ? (
            <button onClick={finish} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Setting up…" : "Finish setup"}
            </button>
          ) : (
            <button onClick={() => setStep((s) => s + 1)} style={primaryBtn}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const primaryBtn: CSSProperties = {
  background: "#D9A441",
  color: "#101218",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  background: "transparent",
  color: "#8B8FA0",
  border: "1px solid #3A3F4B",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
};
