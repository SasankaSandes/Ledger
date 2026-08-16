"use client";

import { type CSSProperties, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { closeOpenPeriod } from "@/lib/period";
import { fmt, todayKey, uid, type HouseholdSettings } from "@/lib/types";

type Pool = "unallocated" | "cashInHand";
type Destination = { type: "forward" } | { type: "save"; collectionId: string };

export default function ClosePeriodPanel({
  householdId,
  settings,
  month,
  unallocated,
  cashInHand,
  savingsCollections,
  outstandingDebtTotal,
}: {
  householdId: string;
  settings: HouseholdSettings;
  month: string;
  unallocated: number;
  cashInHand: number;
  savingsCollections: { id: string; name: string }[];
  outstandingDebtTotal: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Partial<Record<Pool, Destination>>>({});

  const allPools: { key: Pool; label: string; amount: number }[] = [
    { key: "unallocated", label: "Unallocated salary", amount: unallocated },
    { key: "cashInHand", label: "Cash in hand", amount: cashInHand },
  ];
  const pools = allPools.filter((p) => p.amount > 0);

  const ready = pools.every((p) => picks[p.key]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={triggerBtn}>
        Close period
      </button>
    );
  }

  const confirmClose = async () => {
    setClosing(true);
    setError(null);
    const supabase = createClient();

    let bringForwardTotal = 0;
    for (const p of pools) {
      const dest = picks[p.key];
      if (!dest) continue;
      if (dest.type === "forward") {
        bringForwardTotal += p.amount;
        continue;
      }
      const { data: collection } = await supabase
        .from("savings_collections")
        .select("transactions")
        .eq("id", dest.collectionId)
        .single();
      const transactions = [
        ...(collection?.transactions ?? []),
        { id: uid(), desc: `From ${p.label.toLowerCase()}`, amount: p.amount, date: todayKey() },
      ];
      const { error: saveError } = await supabase
        .from("savings_collections")
        .update({ transactions, updated_at: new Date().toISOString() })
        .eq("id", dest.collectionId);
      if (saveError) {
        setError(saveError.message);
        setClosing(false);
        return;
      }
    }

    try {
      await closeOpenPeriod(
        supabase,
        householdId,
        settings,
        { month },
        bringForwardTotal > 0 ? { amount: bringForwardTotal, desc: `Carried forward from ${month}` } : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setClosing(false);
      return;
    }

    router.refresh();
  };

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, color: "#EDEEF2", marginBottom: 10 }}>
        Closing this period — place every rupee before you finish.
      </div>

      {pools.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#8B8FA0", marginBottom: 12 }}>
          Nothing unallocated or in hand — ready to close.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          {pools.map((p) => (
            <PoolPicker
              key={p.key}
              label={p.label}
              amount={p.amount}
              collections={savingsCollections}
              picked={picks[p.key] ?? null}
              onPick={(dest) => setPicks((cur) => ({ ...cur, [p.key]: dest }))}
            />
          ))}
        </div>
      )}

      {outstandingDebtTotal > 0 && (
        <div style={{ fontSize: 11.5, color: "#8B8FA0", marginBottom: 12, lineHeight: 1.5 }}>
          Still owed: <span className="num">{fmt(outstandingDebtTotal)}</span> across your{" "}
          <a href="/debts" style={{ color: "#D9A441" }}>
            debts
          </a>
          . Not required to close.
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: "#E0664F", marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setOpen(false)} disabled={closing} style={secondaryBtn}>
          Cancel
        </button>
        <button
          onClick={confirmClose}
          disabled={closing || !ready}
          style={{ ...primaryBtn, opacity: closing || !ready ? 0.5 : 1 }}
        >
          {closing ? "Closing…" : "Close period"}
        </button>
      </div>
    </div>
  );
}

function PoolPicker({
  label,
  amount,
  collections,
  picked,
  onPick,
}: {
  label: string;
  amount: number;
  collections: { id: string; name: string }[];
  picked: Destination | null;
  onPick: (dest: Destination) => void;
}) {
  return (
    <div style={{ fontSize: 12.5 }}>
      <div style={{ color: "#8B8FA0", marginBottom: 6 }}>
        {label} — <span className="num" style={{ color: "#EDEEF2" }}>{fmt(amount)}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => onPick({ type: "forward" })}
          style={picked?.type === "forward" ? pillBtnActive : pillBtn}
        >
          Bring forward
        </button>
        {collections.length > 0 ? (
          <select
            value={picked?.type === "save" ? picked.collectionId : ""}
            onChange={(e) => e.target.value && onPick({ type: "save", collectionId: e.target.value })}
            style={picked?.type === "save" ? selectStyleActive : selectStyle}
          >
            <option value="" disabled>
              Save to…
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <a href="/savings" style={{ fontSize: 11, color: "#5A5F6D" }}>
            Create a savings collection to save this
          </a>
        )}
      </div>
    </div>
  );
}

const triggerBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid #3A3F4B",
  borderRadius: 20,
  color: "#D9A441",
  fontSize: 12,
  padding: "8px 16px",
  cursor: "pointer",
  marginBottom: 18,
};

const panelStyle: CSSProperties = {
  background: "#171A21",
  border: "1px solid #D9A441",
  borderRadius: 12,
  padding: "14px 16px",
  marginBottom: 18,
};

const primaryBtn: CSSProperties = {
  background: "#D9A441",
  color: "#101218",
  border: "none",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  background: "transparent",
  color: "#8B8FA0",
  border: "1px solid #3A3F4B",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  cursor: "pointer",
};

const pillBtn: CSSProperties = {
  fontSize: 11.5,
  padding: "5px 10px",
  borderRadius: 20,
  border: "1px solid #3A3F4B",
  background: "transparent",
  color: "#EDEEF2",
  cursor: "pointer",
};

const pillBtnActive: CSSProperties = {
  ...pillBtn,
  border: "1px solid #6FCF97",
  background: "rgba(111,207,151,0.12)",
  color: "#6FCF97",
};

const selectStyle: CSSProperties = {
  background: "#1B1E27",
  border: "1px solid #2C303A",
  borderRadius: 8,
  color: "#EDEEF2",
  fontSize: 12,
  padding: "5px 8px",
  outline: "none",
};

const selectStyleActive: CSSProperties = {
  ...selectStyle,
  border: "1px solid #6FCF97",
  color: "#6FCF97",
};
