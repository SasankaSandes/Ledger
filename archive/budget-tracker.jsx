import React, { useState, useEffect, useCallback } from "react";

// ---- helpers ----
const fmt = (n) =>
  "Rs " + Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: 0 });

const monthKey = (d = new Date()) =>
  `budget:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (d = new Date()) =>
  d.toLocaleString("en-US", { month: "long", year: "numeric" });

const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT_STATE = {
  salary: 250000,
  fixed: [
    { id: "rent", name: "Rent", amount: 26000, paid: false },
    { id: "loan", name: "Loan", amount: 32000, paid: false },
    { id: "card", name: "Credit card repayment", amount: 50000, paid: false },
  ],
  budget: [
    { id: "grocery", name: "Groceries", amount: 50000, items: [] },
    { id: "necessities", name: "Other necessities", amount: 25000, items: [] },
    { id: "utility", name: "Utility payment", amount: 10000, items: [] },
    { id: "subs", name: "Subscriptions", amount: 20000, items: [] },
  ],
  fuel: { allowance: 40000, usageItems: [], cashoutItems: [] },
};

const sumItems = (items) => items.reduce((s, it) => s + Number(it.amount || 0), 0);

function Ring({ pct, size = 84, stroke = 8, color = "#D9A441" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A2E38" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c * (1 - clamped)} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
    </svg>
  );
}

function StubRow({ label, sub, right, accent, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 4px", borderBottom: "1px dashed #2C303A" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: done ? accent : "#3A3F4B", flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 14.5, color: "#EDEEF2" }}>{label}</div>
          {sub && <div style={{ fontSize: 11.5, color: "#8B8FA0", marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>{right}</div>
    </div>
  );
}

function AddItemRow({ onAdd, placeholder = "What did you spend on" }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");

  const submit = () => {
    const val = Number(amount);
    if (!desc.trim() || !val || val <= 0) return;
    onAdd({ id: uid(), desc: desc.trim(), amount: val });
    setDesc("");
    setAmount("");
  };

  return (
    <div style={{ display: "flex", gap: 6, padding: "10px 4px 4px" }}>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, background: "#1B1E27", border: "1px solid #2C303A", borderRadius: 8, color: "#EDEEF2", fontSize: 13, padding: "7px 10px", outline: "none" }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        type="number"
        className="num"
        style={{ width: 78, background: "#1B1E27", border: "1px solid #2C303A", borderRadius: 8, color: "#EDEEF2", fontSize: 13, padding: "7px 8px", outline: "none", textAlign: "right" }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button
        onClick={submit}
        style={{ width: 34, borderRadius: 8, border: "1px solid #3A3F4B", background: "transparent", color: "#D9A441", fontSize: 16, cursor: "pointer", flexShrink: 0 }}
      >
        +
      </button>
    </div>
  );
}

function ItemList({ items, onRemove }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 2 }}>
      {items.map((it) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", fontSize: 13 }}>
          <span style={{ color: "#B7BAC5" }}>{it.desc}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="num" style={{ color: "#EDEEF2" }}>{fmt(it.amount)}</span>
            <button
              onClick={() => onRemove(it.id)}
              style={{ background: "none", border: "none", color: "#5A5F6D", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}
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

function BudgetCategory({ cat, onAddItem, onRemoveItem, onCapChange }) {
  const spent = sumItems(cat.items);
  const pct = cat.amount > 0 ? spent / cat.amount : 0;
  const over = spent > cat.amount;
  return (
    <div style={{ padding: "14px 4px", borderBottom: "1px dashed #2C303A" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 14.5 }}>{cat.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span className="num" style={{ fontSize: 12.5, color: over ? "#E0664F" : "#8B8FA0" }}>{fmt(spent)} /</span>
          <input className="amt-input num" style={{ width: 62 }} type="number" value={cat.amount} onChange={(e) => onCapChange(Number(e.target.value))} />
        </div>
      </div>
      <div style={{ height: 5, background: "#23262F", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 1) * 100}%`, height: "100%", background: over ? "#E0664F" : "#4FA6D9", transition: "width 0.4s ease" }} />
      </div>
      <ItemList items={cat.items} onRemove={onRemoveItem} />
      <AddItemRow onAdd={onAddItem} placeholder={cat.id === "subs" ? "Subscription name" : "What did you spend on"} />
    </div>
  );
}

export default function BudgetTracker() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const key = monthKey();

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(key);
        if (res && res.value) setState(JSON.parse(res.value));
      } catch (e) {
        // no saved data yet
      } finally {
        setLoaded(true);
      }
    })();
  }, [key]);

  const persist = useCallback(
    async (next) => {
      setSaving(true);
      try {
        await window.storage.set(key, JSON.stringify(next));
      } catch (e) {
        console.error("save failed", e);
      } finally {
        setSaving(false);
      }
    },
    [key]
  );

  const update = (next) => {
    setState(next);
    persist(next);
  };

  if (!loaded) {
    return (
      <div style={{ background: "#101218", minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: "#8B8FA0", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        Loading ledger…
      </div>
    );
  }

  const fixedTotal = state.fixed.reduce((s, f) => s + Number(f.amount || 0), 0);
  const fixedPaid = state.fixed.filter((f) => f.paid).reduce((s, f) => s + Number(f.amount || 0), 0);
  const budgetSpentTotal = state.budget.reduce((s, b) => s + sumItems(b.items), 0);
  const totalSpent = fixedPaid + budgetSpentTotal;
  const moneyLeft = state.salary - totalSpent;
  const overallSpentPct = state.salary > 0 ? totalSpent / state.salary : 0;

  const fuelUsed = sumItems(state.fuel.usageItems);
  const fuelCashed = sumItems(state.fuel.cashoutItems);
  const fuelLeft = state.fuel.allowance - fuelUsed - fuelCashed;
  const cashInHand = fuelCashed;
  const cashoutRoom = 25000 - fuelCashed;

  const setFixed = (id, patch) =>
    update({ ...state, fixed: state.fixed.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const setSalary = (val) => update({ ...state, salary: val });

  const addBudgetItem = (catId, item) =>
    update({ ...state, budget: state.budget.map((b) => (b.id === catId ? { ...b, items: [...b.items, item] } : b)) });
  const removeBudgetItem = (catId, itemId) =>
    update({ ...state, budget: state.budget.map((b) => (b.id === catId ? { ...b, items: b.items.filter((i) => i.id !== itemId) } : b)) });
  const setBudgetCap = (catId, amount) =>
    update({ ...state, budget: state.budget.map((b) => (b.id === catId ? { ...b, amount } : b)) });

  const addFuelUsage = (item) =>
    update({ ...state, fuel: { ...state.fuel, usageItems: [...state.fuel.usageItems, item] } });
  const removeFuelUsage = (itemId) =>
    update({ ...state, fuel: { ...state.fuel, usageItems: state.fuel.usageItems.filter((i) => i.id !== itemId) } });

  const addFuelCashout = (item) => {
    const room = 25000 - fuelCashed;
    if (room <= 0) return;
    const capped = { ...item, amount: Math.min(item.amount, room) };
    update({ ...state, fuel: { ...state.fuel, cashoutItems: [...state.fuel.cashoutItems, capped] } });
  };
  const removeFuelCashout = (itemId) =>
    update({ ...state, fuel: { ...state.fuel, cashoutItems: state.fuel.cashoutItems.filter((i) => i.id !== itemId) } });

  const setFuelAllowance = (val) => update({ ...state, fuel: { ...state.fuel, allowance: val } });

  return (
    <div style={{ background: "#101218", minHeight: "100vh", padding: "28px 18px 60px", fontFamily: "'IBM Plex Sans', sans-serif", color: "#EDEEF2" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .amt-input {
          background: transparent; border: none; border-bottom: 1px solid #3A3F4B;
          color: #EDEEF2; font-family: 'IBM Plex Mono', monospace; font-size: 14px;
          text-align: right; width: 90px; padding: 2px 4px; outline: none;
        }
        .amt-input:focus { border-bottom-color: #D9A441; }
      `}</style>

      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, letterSpacing: 0.2 }}>Ledger</div>
          <div style={{ fontSize: 11.5, color: "#8B8FA0" }}>{monthLabel()}</div>
        </div>
        <div style={{ fontSize: 11, color: saving ? "#D9A441" : "#5A5F6D", marginBottom: 20, height: 14 }}>
          {saving ? "saving…" : "saved"}
        </div>

        <div style={{ background: "#171A21", border: "1px solid #23262F", borderRadius: 16, padding: "22px 20px", display: "flex", alignItems: "center", gap: 20, marginBottom: 18 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Ring pct={overallSpentPct} color={overallSpentPct > 1 ? "#E0664F" : "#D9A441"} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
              {Math.round(overallSpentPct * 100)}%
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "#8B8FA0", marginBottom: 2 }}>Salary</div>
            <input
              className="amt-input num"
              style={{ width: 110, fontSize: 18, textAlign: "left", borderBottom: "1px solid #2C303A" }}
              type="number"
              value={state.salary}
              onChange={(e) => setSalary(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, background: "#171A21", border: "1px solid #23262F", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#8B8FA0", marginBottom: 4 }}>Money spent</div>
            <div className="num" style={{ fontSize: 17 }}>{fmt(totalSpent)}</div>
          </div>
          <div style={{ flex: 1, background: "#171A21", border: "1px solid #23262F", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#8B8FA0", marginBottom: 4 }}>Money left</div>
            <div className="num" style={{ fontSize: 17, color: moneyLeft >= 0 ? "#6FCF97" : "#E0664F" }}>{fmt(moneyLeft)}</div>
          </div>
        </div>

        <div style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, letterSpacing: 0.6, color: "#8B8FA0", textTransform: "uppercase" }}>Fixed expenses</div>
            <div className="num" style={{ fontSize: 12.5, color: "#8B8FA0" }}>{fmt(fixedPaid)} / {fmt(fixedTotal)}</div>
          </div>
          {state.fixed.map((f) => (
            <StubRow
              key={f.id}
              label={f.name}
              accent="#D9A441"
              done={f.paid}
              right={
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input className="amt-input num" type="number" value={f.amount} onChange={(e) => setFixed(f.id, { amount: Number(e.target.value) })} />
                  <button
                    onClick={() => setFixed(f.id, { paid: !f.paid })}
                    style={{
                      fontSize: 10.5, padding: "4px 9px", borderRadius: 20,
                      border: "1px solid " + (f.paid ? "#6FCF97" : "#3A3F4B"),
                      background: f.paid ? "rgba(111,207,151,0.12)" : "transparent",
                      color: f.paid ? "#6FCF97" : "#8B8FA0", cursor: "pointer",
                    }}
                  >
                    {f.paid ? "Paid" : "Mark paid"}
                  </button>
                </div>
              }
            />
          ))}
        </div>

        <div style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, letterSpacing: 0.6, color: "#8B8FA0", textTransform: "uppercase" }}>Budget allocation</div>
            <div className="num" style={{ fontSize: 12.5, color: "#8B8FA0" }}>{fmt(budgetSpentTotal)} / {fmt(state.budget.reduce((s, b) => s + b.amount, 0))}</div>
          </div>
          {state.budget.map((cat) => (
            <BudgetCategory
              key={cat.id}
              cat={cat}
              onAddItem={(item) => addBudgetItem(cat.id, item)}
              onRemoveItem={(itemId) => removeBudgetItem(cat.id, itemId)}
              onCapChange={(amount) => setBudgetCap(cat.id, amount)}
            />
          ))}
        </div>

        <div>
          <div style={{ fontSize: 12.5, letterSpacing: 0.6, color: "#8B8FA0", textTransform: "uppercase", marginBottom: 6 }}>Fuel allowance</div>
          <div style={{ background: "#171A21", border: "1px solid #23262F", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, color: "#8B8FA0" }}>Total allowance</span>
              <input className="amt-input num" type="number" value={state.fuel.allowance} onChange={(e) => setFuelAllowance(Number(e.target.value))} />
            </div>

            <div style={{ fontSize: 12, color: "#8B8FA0", marginBottom: 2 }}>Used on car / bike — {fmt(fuelUsed)}</div>
            <ItemList items={state.fuel.usageItems} onRemove={removeFuelUsage} />
            <AddItemRow onAdd={addFuelUsage} placeholder="e.g. Petrol top-up" />

            <div style={{ fontSize: 12, color: "#8B8FA0", margin: "14px 0 2px" }}>
              Cashed out — {fmt(fuelCashed)} <span style={{ color: "#5A5F6D" }}>(room {fmt(Math.max(cashoutRoom, 0))})</span>
            </div>
            <ItemList items={state.fuel.cashoutItems} onRemove={removeFuelCashout} />
            <AddItemRow onAdd={addFuelCashout} placeholder="e.g. Cashed at pump" />

            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, borderTop: "1px dashed #2C303A", marginTop: 12 }}>
              <span style={{ fontSize: 13.5, color: "#8B8FA0" }}>Fuel left</span>
              <span className="num" style={{ fontSize: 14, color: fuelLeft >= 0 ? "#6FCF97" : "#E0664F" }}>{fmt(fuelLeft)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6 }}>
              <span style={{ fontSize: 13.5, color: "#8B8FA0" }}>Cash in hand</span>
              <span className="num" style={{ fontSize: 14, color: "#D9A441" }}>{fmt(cashInHand)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
