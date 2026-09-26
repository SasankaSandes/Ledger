import { useState } from "react";
import { TextInput, type TextStyle } from "react-native";
import { sanitizeAmountText } from "@/lib/amount";

// Controlled numeric-text input. `decimals` is how many decimal places it
// accepts — 0 (the default) strips everything but digits, which is what the
// budget targets (pot / card limits) use; 2 allows cents for records (fixed
// expenses, what's already owed on a card). `nullable` distinguishes "cleared"
// (null) from "zero" (0) — used for caps where null means uncapped.
//
// It keeps its own text so an in-progress "12." or "12.50" survives the round
// trip through the numeric `value` (which can't represent a trailing point or
// trailing zero). If the parent sets `value` to something the text doesn't
// already represent, the text follows the parent instead.
export function AmountInput({
  value,
  onChange,
  nullable = false,
  decimals = 0,
  placeholder = "0",
  className,
  style,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  nullable?: boolean;
  decimals?: number;
  placeholder?: string;
  className?: string;
  style?: TextStyle;
}) {
  const [text, setText] = useState(value ? String(value) : "");

  const empty = nullable ? null : 0;
  const parsed = text === "" || text === "." ? empty : Number(text);
  const shown = parsed === value ? text : value ? String(value) : "";

  return (
    <TextInput
      value={shown}
      onChangeText={(raw) => {
        const clean = sanitizeAmountText(raw, decimals);
        setText(clean);
        onChange(clean === "" || clean === "." ? empty : Number(clean));
      }}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      placeholder={placeholder}
      placeholderTextColor="#5C6070"
      className={
        className ??
        "rounded-lg border border-line/10 bg-input px-[10px] py-[7px] text-right font-mono text-[13px] text-text"
      }
      style={style}
    />
  );
}
