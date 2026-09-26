import { Pressable, Text, View } from "react-native";
import { applyKey } from "@/lib/amount";

// Amount entry with a decimal point key. Controlled by the entry string
// ("", "12", "12.", "12.50") — applyKey (src/lib/amount.ts) owns the rules:
// one decimal point, up to 2 decimals, up to 9 whole digits.
const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export function Keypad({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const press = (key: string) => onChange(applyKey(value, key));

  return (
    <View className="gap-2">
      {ROWS.map((row, i) => (
        <View key={i} className="flex-row gap-2">
          {row.map((d) => (
            <Key key={d} label={d} onPress={() => press(d)} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-2">
        <Key label="." onPress={() => press(".")} />
        <Key label="0" onPress={() => press("0")} />
        <Key label="⌫" onPress={() => press("back")} muted />
      </View>
    </View>
  );
}

function Key({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center justify-center rounded-xl bg-fill py-4">
      <Text className={`text-[20px] ${muted ? "text-muted" : "text-text"}`}>{label}</Text>
    </Pressable>
  );
}
