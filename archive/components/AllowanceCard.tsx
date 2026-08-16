import { fmt, sumItems, type AllowanceInstance, type BudgetItem } from "@/lib/types";
import ItemList from "./ItemList";
import AddItemRow from "./AddItemRow";
import AmountInput from "./AmountInput";

export default function AllowanceCard({
  allowance,
  onAmountChange,
  onAddUsage,
  onRemoveUsage,
  onAddCashout,
  onRemoveCashout,
}: {
  allowance: AllowanceInstance;
  // Only monthly allowances get an inline amount edit — annual amounts are
  // structural and live in household_settings, edited from /settings.
  onAmountChange?: (amount: number) => void;
  onAddUsage: (item: BudgetItem) => void;
  onRemoveUsage: (id: string) => void;
  onAddCashout: (item: BudgetItem) => void;
  onRemoveCashout: (id: string) => void;
}) {
  const used = sumItems(allowance.usageItems);
  const cashed = sumItems(allowance.cashoutItems);
  const remaining = allowance.amount - used - cashed;
  const capRoom = allowance.cashoutCap != null ? allowance.cashoutCap - cashed : Infinity;
  const cashoutRoom = Math.min(capRoom, remaining);

  const handleAddCashout = (item: BudgetItem) => {
    if (cashoutRoom <= 0) return;
    onAddCashout({ ...item, amount: Math.min(item.amount, cashoutRoom) });
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, color: "#8B8FA0" }}>
          {allowance.name}
          {allowance.period === "annual" && (
            <span style={{ fontSize: 10, color: "#5A5F6D", marginLeft: 6, letterSpacing: 0.4 }}>ANNUAL</span>
          )}
        </span>
        {onAmountChange ? (
          <AmountInput value={allowance.amount} onChange={(n) => onAmountChange(n ?? 0)} />
        ) : (
          <span className="num" style={{ fontSize: 14 }}>
            {fmt(allowance.amount)}
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#8B8FA0", marginBottom: 2 }}>Used directly — {fmt(used)}</div>
      <ItemList items={allowance.usageItems} onRemove={onRemoveUsage} />
      <AddItemRow onAdd={onAddUsage} placeholder="What was it for" />

      <div style={{ fontSize: 12, color: "#8B8FA0", margin: "14px 0 2px" }}>
        Claimed as cash — {fmt(cashed)}{" "}
        <span style={{ color: "#5A5F6D" }}>(room {fmt(Math.max(cashoutRoom, 0))})</span>
      </div>
      <ItemList items={allowance.cashoutItems} onRemove={onRemoveCashout} />
      <AddItemRow onAdd={handleAddCashout} placeholder="e.g. Cashed out" />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 14,
          borderTop: "1px dashed #2C303A",
          marginTop: 12,
        }}
      >
        <span style={{ fontSize: 13.5, color: "#8B8FA0" }}>
          {allowance.period === "annual" ? "Left this year" : "Left"}
        </span>
        <span className="num" style={{ fontSize: 14, color: remaining >= 0 ? "#6FCF97" : "#E0664F" }}>
          {fmt(remaining)}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6 }}>
        <span style={{ fontSize: 13.5, color: "#8B8FA0" }}>Cash in hand</span>
        <span className="num" style={{ fontSize: 14, color: "#D9A441" }}>
          {fmt(cashed)}
        </span>
      </div>
    </div>
  );
}
