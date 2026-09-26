import { Pressable, Text } from "react-native";

// One of the small pills under Quick Add's category row (Date, Pot, Paid
// with). It doubles as the summary of the current value and the button that
// opens its sheet. `active` = not the default (gold); `suggested` adds a ✦
// when the value came from the note rather than a tap; `invalid` flags a pill
// the user still has to fill in.
export function DetailPill({
  label,
  active,
  suggested,
  invalid,
  onPress,
}: {
  label: string;
  active?: boolean;
  suggested?: boolean;
  invalid?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-8 shrink flex-row items-center gap-1 rounded-full border px-2.5 ${
        invalid
          ? "border-negative/70 bg-negative/10"
          : active
            ? "border-gold/40 bg-gold/[0.08]"
            : "border-line/10 bg-card"
      }`}
    >
      <Text numberOfLines={1} className={`shrink text-[12px] ${active ? "text-gold" : "text-muted"}`}>
        {suggested ? "✦ " : ""}
        {label}
      </Text>
      <Text className="text-[9px] text-muted2">▾</Text>
    </Pressable>
  );
}
