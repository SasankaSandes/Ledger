import type { ReactNode } from "react";

export default function StubRow({
  label,
  sub,
  right,
  accent,
  done,
}: {
  label: string;
  sub?: string;
  right: ReactNode;
  accent: string;
  done: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 4px",
        borderBottom: "1px dashed #2C303A",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: done ? accent : "#3A3F4B",
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontSize: 14.5, color: "#EDEEF2" }}>{label}</div>
          {sub && (
            <div style={{ fontSize: 11.5, color: "#8B8FA0", marginTop: 2 }}>
              {sub}
            </div>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>{right}</div>
    </div>
  );
}
