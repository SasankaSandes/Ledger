"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import AddItemRow from "@/components/AddItemRow";
import AmountInput from "@/components/AmountInput";
import {
  allocatedTotal,
  fmt,
  uid,
  type AllowanceDef,
  type AllowancePeriod,
  type BudgetItem,
  type HouseholdSettings,
} from "@/lib/types";

type Section = "salary" | "fixed" | "budget" | "allowances";

export default function SettingsEditor({
  value,
  onChange,
  sections = ["salary", "fixed", "budget", "allowances"],
}: {
  value: HouseholdSettings;
  onChange: (next: HouseholdSettings) => void;
  sections?: Section[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <AllocationSummary settings={value} />

      {sections.includes("salary") && (
        <div>
          <SectionLabel>Monthly salary</SectionLabel>
          <AmountInput
            style={{ width: 140, fontSize: 18, textAlign: "left" }}
            value={value.salary}
            onChange={(n) => onChange({ ...value, salary: n ?? 0 })}
          />

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11.5, color: "#8B8FA0", marginBottom: 6 }}>
              Salary date — the day of the month a new period starts
            </div>
            <input
              type="number"
              min={1}
              max={31}
              value={value.salaryDate}
              onChange={(e) => {
                const n = Math.min(31, Math.max(1, Number(e.target.value) || 1));
                onChange({ ...value, salaryDate: n });
              }}
              style={dayInputStyle}
            />
          </div>
        </div>
      )}

      {sections.includes("fixed") && (
        <div>
          <SectionLabel>Fixed expenses</SectionLabel>
          <DefListEditor
            items={value.fixed}
            onChange={(fixed) => onChange({ ...value, fixed })}
            addPlaceholder="e.g. Rent"
          />
        </div>
      )}

      {sections.includes("budget") && (
        <div>
          <SectionLabel>Budget categories</SectionLabel>
          <DefListEditor
            items={value.budget}
            onChange={(budget) => onChange({ ...value, budget })}
            addPlaceholder="e.g. Groceries"
          />
        </div>
      )}

      {sections.includes("allowances") && (
        <div>
          <SectionLabel>Allowances</SectionLabel>
          <AllowanceListEditor
            items={value.allowances}
            onChange={(allowances) => onChange({ ...value, allowances })}
          />
        </div>
      )}
    </div>
  );
}

function AllocationSummary({ settings }: { settings: HouseholdSettings }) {
  const allocated = allocatedTotal(settings);
  const unallocated = settings.salary - allocated;
  const over = unallocated < 0;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: over ? "rgba(224,102,79,0.1)" : "rgba(217,164,65,0.08)",
        border: "1px solid " + (over ? "#E0664F" : "#2C303A"),
        borderRadius: 10,
        padding: "10px 14px",
      }}
    >
      <span style={{ fontSize: 12, color: over ? "#E0664F" : "#8B8FA0" }}>
        {over ? "Over-allocated" : "Unallocated"}
      </span>
      <span className="num" style={{ fontSize: 14, color: over ? "#E0664F" : "#6FCF97" }}>
        {fmt(Math.abs(unallocated))}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        letterSpacing: 0.6,
        color: "#8B8FA0",
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function DefListEditor({
  items,
  onChange,
  addPlaceholder,
}: {
  items: { id: string; name: string; amount: number }[];
  onChange: (next: { id: string; name: string; amount: number }[]) => void;
  addPlaceholder: string;
}) {
  const patch = (id: string, p: Partial<{ name: string; amount: number }>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const remove = (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? Anything already logged under it this month will be removed too.`)) return;
    onChange(items.filter((it) => it.id !== id));
  };
  const add = (item: BudgetItem) =>
    onChange([...items, { id: item.id, name: item.desc, amount: item.amount }]);

  return (
    <div>
      {items.map((it) => (
        <div key={it.id} style={rowStyle}>
          <input
            value={it.name}
            onChange={(e) => patch(it.id, { name: e.target.value })}
            style={nameInputStyle}
          />
          <AmountInput value={it.amount} onChange={(n) => patch(it.id, { amount: n ?? 0 })} />
          <button onClick={() => remove(it.id, it.name)} style={removeBtnStyle} aria-label="Remove">
            ✕
          </button>
        </div>
      ))}
      <AddItemRow onAdd={add} placeholder={addPlaceholder} />
    </div>
  );
}

function AllowanceListEditor({
  items,
  onChange,
}: {
  items: AllowanceDef[];
  onChange: (next: AllowanceDef[]) => void;
}) {
  const patch = (id: string, p: Partial<AllowanceDef>) =>
    onChange(items.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const remove = (id: string, name: string) => {
    if (
      !confirm(
        `Remove "${name}"? ${
          items.find((a) => a.id === id)?.period === "annual"
            ? "This year's balance for it"
            : "Anything already logged under it this month"
        } will be removed too.`
      )
    )
      return;
    onChange(items.filter((a) => a.id !== id));
  };

  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [period, setPeriod] = useState<AllowancePeriod>("monthly");

  const add = () => {
    if (!name.trim() || !amount || amount <= 0) return;
    onChange([...items, { id: uid(), name: name.trim(), period, amount, cashoutCap: null }]);
    setName("");
    setAmount(0);
    setPeriod("monthly");
  };

  return (
    <div>
      {items.map((a) => (
        <div key={a.id} style={{ padding: "10px 4px", borderBottom: "1px dashed #2C303A" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <input
              value={a.name}
              onChange={(e) => patch(a.id, { name: e.target.value })}
              style={nameInputStyle}
            />
            <button onClick={() => remove(a.id, a.name)} style={removeBtnStyle} aria-label="Remove">
              ✕
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#8B8FA0" }}>
            <select
              value={a.period}
              onChange={(e) => patch(a.id, { period: e.target.value as AllowancePeriod })}
              style={selectStyle}
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
            <span>Amount</span>
            <AmountInput value={a.amount} onChange={(n) => patch(a.id, { amount: n ?? 0 })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12, color: "#8B8FA0" }}>
            <span>Cash-out cap</span>
            <AmountInput
              value={a.cashoutCap}
              nullable
              placeholder="none"
              onChange={(n) => patch(a.id, { cashoutCap: n })}
            />
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, padding: "10px 4px 4px", flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Fuel"
          style={{ ...nameInputStyle, flex: "1 1 120px" }}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as AllowancePeriod)}
          style={selectStyle}
        >
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
        </select>
        <AmountInput
          value={amount}
          onChange={(n) => setAmount(n ?? 0)}
          placeholder="0"
          className="num"
          style={amountAddInputStyle}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} style={addBtnStyle}>
          +
        </button>
      </div>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 4px",
  borderBottom: "1px dashed #2C303A",
};

const nameInputStyle: CSSProperties = {
  flex: 1,
  background: "#1B1E27",
  border: "1px solid #2C303A",
  borderRadius: 8,
  color: "#EDEEF2",
  fontSize: 13,
  padding: "7px 10px",
  outline: "none",
};

const removeBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "#5A5F6D",
  cursor: "pointer",
  fontSize: 14,
  padding: "0 2px",
  lineHeight: 1,
};

const selectStyle: CSSProperties = {
  background: "#1B1E27",
  border: "1px solid #2C303A",
  borderRadius: 8,
  color: "#EDEEF2",
  fontSize: 12.5,
  padding: "6px 8px",
  outline: "none",
};

const addBtnStyle: CSSProperties = {
  width: 34,
  borderRadius: 8,
  border: "1px solid #3A3F4B",
  background: "transparent",
  color: "#D9A441",
  fontSize: 16,
  cursor: "pointer",
  flexShrink: 0,
};

const dayInputStyle: CSSProperties = {
  width: 56,
  background: "#1B1E27",
  border: "1px solid #2C303A",
  borderRadius: 8,
  color: "#EDEEF2",
  fontSize: 14,
  padding: "7px 8px",
  outline: "none",
  textAlign: "center",
};

const amountAddInputStyle: CSSProperties = {
  width: 78,
  background: "#1B1E27",
  border: "1px solid #2C303A",
  borderRadius: 8,
  color: "#EDEEF2",
  fontSize: 13,
  padding: "7px 8px",
  outline: "none",
  textAlign: "right",
};
