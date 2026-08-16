"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ensureOpenPeriodRow } from "@/lib/period";
import { fmt, shortDate, todayKey, uid, type BudgetItem, type Debt, type HouseholdSettings } from "@/lib/types";
import AddItemRow from "./AddItemRow";

export default function DebtsView({
  householdId,
  settings,
  initialDebts,
}: {
  householdId: string;
  settings: HouseholdSettings;
  initialDebts: Debt[];
}) {
  const [debts, setDebts] = useState<Debt[]>(initialDebts);
  const [busy, setBusy] = useState(false);

  const addTopUp = async (desc: string, amount: number) => {
    const supabase = createClient();
    const { month, monthly } = await ensureOpenPeriodRow(supabase, householdId, settings);
    const topUp: BudgetItem = { id: uid(), desc, amount, date: todayKey() };
    await supabase
      .from("budgets")
      .update({ top_ups: [...monthly.topUps, topUp], updated_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("month", month);
  };

  const addDebt = async (item: BudgetItem) => {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("debts")
      .insert({ household_id: householdId, name: item.desc, amount: item.amount, date: item.date })
      .select("id, name, amount, date, paid_at")
      .single();

    if (!error && data) {
      setDebts((ds) => [...ds, { id: data.id, name: data.name, amount: data.amount, date: data.date, paidAt: data.paid_at }]);
      // Borrowed/owed money is spendable now — it becomes a top-up.
      await addTopUp(`Owed: ${item.desc}`, item.amount);
    }
    setBusy(false);
  };

  const markPaid = async (debt: Debt) => {
    setBusy(true);
    const supabase = createClient();
    const paidAt = new Date().toISOString();
    await supabase.from("debts").update({ paid_at: paidAt }).eq("id", debt.id);
    setDebts((ds) => ds.map((d) => (d.id === debt.id ? { ...d, paidAt } : d)));
    // Repaying it is money leaving the open period — a negative top-up.
    await addTopUp(`Repaid: ${debt.name}`, -debt.amount);
    setBusy(false);
  };

  const remove = async (debt: Debt) => {
    if (!confirm(`Remove "${debt.name}"?`)) return;
    const supabase = createClient();
    await supabase.from("debts").delete().eq("id", debt.id);
    setDebts((ds) => ds.filter((d) => d.id !== debt.id));
  };

  const outstanding = debts.filter((d) => !d.paidAt);
  const settled = debts.filter((d) => d.paidAt);
  const outstandingTotal = outstanding.reduce((s, d) => s + Number(d.amount || 0), 0);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 22, fontWeight: 600 }}>Debts</div>
          <Link href="/dashboard" style={{ fontSize: 11.5, color: "#8B8FA0" }}>
            ← Dashboard
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: outstandingTotal > 0 ? "rgba(224,102,79,0.08)" : "rgba(217,164,65,0.08)",
            border: "1px solid " + (outstandingTotal > 0 ? "#E0664F" : "#2C303A"),
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 18,
          }}
        >
          <span style={{ fontSize: 12, color: outstandingTotal > 0 ? "#E0664F" : "#8B8FA0" }}>You owe</span>
          <span className="num" style={{ fontSize: 14, color: outstandingTotal > 0 ? "#E0664F" : "#6FCF97" }}>
            {fmt(outstandingTotal)}
          </span>
        </div>

        <div style={{ background: "#171A21", border: "1px solid #23262F", borderRadius: 16, padding: "18px 20px" }}>
          {outstanding.length === 0 && (
            <div style={{ fontSize: 12.5, color: "#5A5F6D", marginBottom: 8 }}>Nothing outstanding.</div>
          )}
          {outstanding.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px dashed #2C303A",
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: "#EDEEF2" }}>{d.name}</div>
                <div style={{ fontSize: 10.5, color: "#5A5F6D", marginTop: 1 }}>{shortDate(d.date)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span className="num" style={{ fontSize: 13.5 }}>
                  {fmt(d.amount)}
                </span>
                <button onClick={() => markPaid(d)} disabled={busy} style={paidBtnStyle}>
                  Mark paid
                </button>
                <button onClick={() => remove(d)} aria-label="Remove" style={removeBtnStyle}>
                  ✕
                </button>
              </div>
            </div>
          ))}

          <AddItemRow onAdd={addDebt} placeholder="e.g. Loan from Kasun" />
        </div>

        {settled.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontSize: 12.5,
                letterSpacing: 0.6,
                color: "#8B8FA0",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Settled
            </div>
            {settled.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 4px",
                  fontSize: 13,
                  color: "#5A5F6D",
                }}
              >
                <span>{d.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="num">{fmt(d.amount)}</span>
                  <button onClick={() => remove(d)} aria-label="Remove" style={removeBtnStyle}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const paidBtnStyle = {
  fontSize: 10.5,
  padding: "4px 9px",
  borderRadius: 20,
  border: "1px solid #3A3F4B",
  background: "transparent",
  color: "#8B8FA0",
  cursor: "pointer",
} as const;

const removeBtnStyle = {
  background: "none",
  border: "none",
  color: "#5A5F6D",
  cursor: "pointer",
  fontSize: 14,
  padding: "0 2px",
  lineHeight: 1,
} as const;
