import { fmt, shortDate, type BudgetItem } from "@/lib/types";

export default function ItemList({
  items,
  onRemove,
}: {
  items: BudgetItem[];
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 2 }}>
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 4px",
            fontSize: 13,
          }}
        >
          <div>
            <div style={{ color: "#B7BAC5" }}>{it.desc}</div>
            <div style={{ fontSize: 10.5, color: "#5A5F6D", marginTop: 1 }}>{shortDate(it.date)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="num" style={{ color: "#EDEEF2" }}>
              {fmt(it.amount)}
            </span>
            <button
              onClick={() => onRemove(it.id)}
              style={{
                background: "none",
                border: "none",
                color: "#5A5F6D",
                cursor: "pointer",
                fontSize: 13,
                padding: 0,
                lineHeight: 1,
              }}
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
