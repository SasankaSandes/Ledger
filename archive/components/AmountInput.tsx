"use client";

import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";

// Rupee amounts are always whole numbers in this app, so 0 and "unset" are
// the same thing — displaying 0 as blank (placeholder shows through) reads
// better than a literal "0" sitting in every empty field.
function formatAmount(n: number) {
  return n === 0 ? "" : n.toLocaleString("en-LK", { maximumFractionDigits: 0 });
}

export default function AmountInput({
  value,
  onChange,
  nullable = false,
  className = "amt-input num",
  style,
  placeholder = "0",
  onKeyDown,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  // When true, clearing the field reports null (e.g. an uncapped cash-out
  // limit) instead of 0.
  nullable?: boolean;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const display = value == null ? "" : formatAmount(value);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^0-9]/g, "");
    if (digits === "") {
      onChange(nullable ? null : 0);
      return;
    }
    onChange(Number(digits));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      style={style}
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onKeyDown={onKeyDown}
    />
  );
}
