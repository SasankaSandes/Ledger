"use client";

import { useState } from "react";
import { todayKey, uid, type BudgetItem } from "@/lib/types";
import AmountInput from "./AmountInput";

export default function AddItemRow({
  onAdd,
  placeholder = "What did you spend on",
}: {
  onAdd: (item: BudgetItem) => void;
  placeholder?: string;
}) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayKey());

  const submit = () => {
    if (!desc.trim() || !amount || amount <= 0) return;
    onAdd({ id: uid(), desc: desc.trim(), amount, date: date || todayKey() });
    setDesc("");
    setAmount(0);
    setDate(todayKey());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 4px 4px" }}>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={placeholder}
        style={{
          background: "#1B1E27",
          border: "1px solid #2C303A",
          borderRadius: 8,
          color: "#EDEEF2",
          fontSize: 13,
          padding: "7px 10px",
          outline: "none",
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="num"
          style={{
            flex: 1,
            minWidth: 0,
            background: "#1B1E27",
            border: "1px solid #2C303A",
            borderRadius: 8,
            color: "#EDEEF2",
            fontSize: 12.5,
            padding: "7px 8px",
            outline: "none",
            colorScheme: "dark",
          }}
        />
        <AmountInput
          value={amount}
          onChange={(n) => setAmount(n ?? 0)}
          placeholder="0"
          className="num"
          style={{
            width: 78,
            background: "#1B1E27",
            border: "1px solid #2C303A",
            borderRadius: 8,
            color: "#EDEEF2",
            fontSize: 13,
            padding: "7px 8px",
            outline: "none",
            textAlign: "right",
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          onClick={submit}
          style={{
            width: 34,
            borderRadius: 8,
            border: "1px solid #3A3F4B",
            background: "transparent",
            color: "#D9A441",
            fontSize: 16,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
