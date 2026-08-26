import type { ChangeEvent } from "react";
import { Text, View } from "react-native";

// Web fallback for DateField — @react-native-community/datetimepicker has no
// web build, so render a plain DOM <input type="date">. react-native-web lets
// raw DOM elements through untouched. The 16px font (see src/global.css) keeps
// iOS Safari from zooming the viewport on focus.
type Props = {
  value: string;
  onChange: (key: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  label?: string;
};

const toKey = (d?: Date) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : undefined;

export function DateField({ value, onChange, minimumDate, maximumDate, label = "Date" }: Props) {
  return (
    <View>
      <Text className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted">{label}</Text>
      <input
        type="date"
        value={value}
        min={toKey(minimumDate)}
        max={toKey(maximumDate)}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (e.target.value) onChange(e.target.value);
        }}
        style={{
          alignSelf: "flex-start",
          fontSize: 16,
          fontFamily: "inherit",
          color: "rgb(var(--color-text2))",
          background: "rgb(var(--color-input))",
          border: "1px solid rgba(var(--color-line) / 0.15)",
          borderRadius: 999,
          padding: "7px 12px",
        }}
      />
    </View>
  );
}
