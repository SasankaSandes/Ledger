"use client";

import { type CSSProperties, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ensureOpenPeriodRow } from "@/lib/period";
import {
  fmt,
  shortDate,
  sumItems,
  todayKey,
  uid,
  type BudgetItem,
  type HouseholdSettings,
  type SavingsCollection,
} from "@/lib/types";
import AddItemRow from "./AddItemRow";
import AmountInput from "./AmountInput";

export default function SavingsView({
  householdId,
  settings,
  initialCollections,
}: {
  householdId: string;
  settings: HouseholdSettings;
  initialCollections: SavingsCollection[];
}) {
  const [collections, setCollections] = useState<SavingsCollection[]>(initialCollections);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const addCollection = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("savings_collections")
      .insert({ household_id: householdId, name: newName.trim(), transactions: [] })
      .select("id, name, transactions")
      .single();
    setBusy(false);
    if (error || !data) return;
    setCollections((cs) => [...cs, data as SavingsCollection]);
    setNewName("");
  };

  const renameCollection = async (id: string, name: string) => {
    setCollections((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));
    const supabase = createClient();
    await supabase.from("savings_collections").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  };

  const removeCollection = async (collection: SavingsCollection) => {
    const balance = sumItems(collection.transactions);
    if (balance !== 0) {
      alert(`Move the ${fmt(balance)} balance to spending first before removing "${collection.name}".`);
      return;
    }
    if (!confirm(`Remove "${collection.name}"?`)) return;
    const supabase = createClient();
    await supabase.from("savings_collections").delete().eq("id", collection.id);
    setCollections((cs) => cs.filter((c) => c.id !== collection.id));
  };

  const addTransaction = async (collection: SavingsCollection, item: BudgetItem) => {
    const transactions = [...collection.transactions, item];
    setCollections((cs) => cs.map((c) => (c.id === collection.id ? { ...c, transactions } : c)));
    const supabase = createClient();
    await supabase
      .from("savings_collections")
      .update({ transactions, updated_at: new Date().toISOString() })
      .eq("id", collection.id);
  };

  const removeTransaction = async (collection: SavingsCollection, itemId: string) => {
    const transactions = collection.transactions.filter((t) => t.id !== itemId);
    setCollections((cs) => cs.map((c) => (c.id === collection.id ? { ...c, transactions } : c)));
    const supabase = createClient();
    await supabase
      .from("savings_collections")
      .update({ transactions, updated_at: new Date().toISOString() })
      .eq("id", collection.id);
  };

  const moveToSpending = async (collection: SavingsCollection, amount: number) => {
    const balance = sumItems(collection.transactions);
    if (amount <= 0 || amount > balance) return;
    setBusy(true);
    const supabase = createClient();
    const { month, monthly } = await ensureOpenPeriodRow(supabase, householdId, settings);

    const topUp: BudgetItem = { id: uid(), desc: `From savings: ${collection.name}`, amount, date: todayKey() };
    await supabase
      .from("budgets")
      .update({ top_ups: [...monthly.topUps, topUp], updated_at: new Date().toISOString() })
      .eq("household_id", householdId)
      .eq("month", month);

    const withdrawal: BudgetItem = { id: uid(), desc: "To spending", amount: -amount, date: todayKey() };
    const transactions = [...collection.transactions, withdrawal];
    await supabase
      .from("savings_collections")
      .update({ transactions, updated_at: new Date().toISOString() })
      .eq("id", collection.id);

    setCollections((cs) => cs.map((c) => (c.id === collection.id ? { ...c, transactions } : c)));
    setBusy(false);
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 22, fontWeight: 600 }}>
            Savings
          </div>
          <Link href="/dashboard" style={{ fontSize: 11.5, color: "#8B8FA0" }}>
            ← Dashboard
          </Link>
        </div>

        {collections.length === 0 && (
          <div style={{ fontSize: 12.5, color: "#5A5F6D", marginBottom: 18 }}>
            No savings collections yet. Create one below to set money aside.
          </div>
        )}

        {collections.map((c) => (
          <CollectionCard
            key={c.id}
            collection={c}
            busy={busy}
            onRename={(name) => renameCollection(c.id, name)}
            onRemove={() => removeCollection(c)}
            onAddTransaction={(item) => addTransaction(c, item)}
            onRemoveTransaction={(itemId) => removeTransaction(c, itemId)}
            onMoveToSpending={(amount) => moveToSpending(c, amount)}
          />
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New collection, e.g. Emergency fund"
            style={nameInputStyle}
            onKeyDown={(e) => e.key === "Enter" && addCollection()}
          />
          <button onClick={addCollection} disabled={busy} style={addBtnStyle}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectionCard({
  collection,
  busy,
  onRename,
  onRemove,
  onAddTransaction,
  onRemoveTransaction,
  onMoveToSpending,
}: {
  collection: SavingsCollection;
  busy: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddTransaction: (item: BudgetItem) => void;
  onRemoveTransaction: (itemId: string) => void;
  onMoveToSpending: (amount: number) => void;
}) {
  const [moveAmount, setMoveAmount] = useState(0);
  const balance = sumItems(collection.transactions);

  const move = () => {
    if (!moveAmount) return;
    onMoveToSpending(moveAmount);
    setMoveAmount(0);
  };

  return (
    <div
      style={{
        background: "#171A21",
        border: "1px solid #23262F",
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <input
          value={collection.name}
          onChange={(e) => onRename(e.target.value)}
          style={{ ...nameInputStyle, fontSize: 14.5, border: "none", background: "transparent", padding: "2px 0" }}
        />
        <button onClick={onRemove} aria-label="Remove" style={removeBtnStyle}>
          ✕
        </button>
      </div>
      <div className="num" style={{ fontSize: 20, marginBottom: 12 }}>
        {fmt(balance)}
      </div>

      {collection.transactions.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {collection.transactions
            .slice()
            .reverse()
            .map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ color: "#B7BAC5" }}>{t.desc}</div>
                  <div style={{ fontSize: 10.5, color: "#5A5F6D", marginTop: 1 }}>{shortDate(t.date)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="num" style={{ color: t.amount >= 0 ? "#6FCF97" : "#8B8FA0" }}>
                    {t.amount >= 0 ? "+" : ""}
                    {fmt(t.amount)}
                  </span>
                  <button onClick={() => onRemoveTransaction(t.id)} aria-label="Remove" style={removeBtnStyle}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      <AddItemRow onAdd={onAddTransaction} placeholder="e.g. Bonus" />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px dashed #2C303A",
        }}
      >
        <span style={{ fontSize: 12, color: "#8B8FA0" }}>Move to spending</span>
        <AmountInput value={moveAmount} onChange={(n) => setMoveAmount(n ?? 0)} />
        <button onClick={move} disabled={busy || !moveAmount || moveAmount > balance} style={moveBtnStyle}>
          Move
        </button>
      </div>
    </div>
  );
}

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

const moveBtnStyle: CSSProperties = {
  fontSize: 11.5,
  padding: "5px 10px",
  borderRadius: 20,
  border: "1px solid #3A3F4B",
  background: "transparent",
  color: "#EDEEF2",
  cursor: "pointer",
};
