import { fmt, sumItems, type BudgetCategoryRow, type BudgetItem } from "@/lib/types";
import ItemList from "./ItemList";
import AddItemRow from "./AddItemRow";
import AmountInput from "./AmountInput";

export default function BudgetCategory({
  cat,
  onAddItem,
  onRemoveItem,
  onCapChange,
}: {
  cat: BudgetCategoryRow;
  onAddItem: (item: BudgetItem) => void;
  onRemoveItem: (id: string) => void;
  onCapChange: (amount: number) => void;
}) {
  const spent = sumItems(cat.items);
  const pct = cat.amount > 0 ? spent / cat.amount : 0;
  const over = spent > cat.amount;
  return (
    <div style={{ padding: "14px 4px", borderBottom: "1px dashed #2C303A" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 14.5 }}>{cat.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            className="num"
            style={{ fontSize: 12.5, color: over ? "#E0664F" : "#8B8FA0" }}
          >
            {fmt(spent)} /
          </span>
          <AmountInput
            style={{ width: 62 }}
            value={cat.amount}
            onChange={(n) => onCapChange(n ?? 0)}
          />
        </div>
      </div>
      <div
        style={{
          height: 5,
          background: "#23262F",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(pct, 1) * 100}%`,
            height: "100%",
            background: over ? "#E0664F" : "#4FA6D9",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <ItemList items={cat.items} onRemove={onRemoveItem} />
      <AddItemRow
        onAdd={onAddItem}
        placeholder={cat.id === "subs" ? "Subscription name" : "What did you spend on"}
      />
    </div>
  );
}
