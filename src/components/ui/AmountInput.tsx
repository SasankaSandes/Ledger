import { TextInput, type TextStyle } from "react-native";

// Controlled numeric-text input: strips non-digits, shows blank instead of
// "0" when empty. `nullable` distinguishes "cleared" (null) from "zero"
// (0) — used for cashout caps where null means uncapped.
export function AmountInput({
  value,
  onChange,
  nullable = false,
  placeholder = "0",
  className,
  style,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  nullable?: boolean;
  placeholder?: string;
  className?: string;
  style?: TextStyle;
}) {
  return (
    <TextInput
      value={value ? String(value) : ""}
      onChangeText={(text) => {
        const digits = text.replace(/[^0-9]/g, "");
        if (!digits) return onChange(nullable ? null : 0);
        onChange(Number(digits));
      }}
      inputMode="numeric"
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
