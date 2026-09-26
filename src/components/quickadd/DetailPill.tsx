import { Pressable, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useColorScheme } from "nativewind";
import { darkTokens, lightTokens } from "@/lib/theme/tokens";

// A dropdown pill: the small chips under the category row on Quick Add and Edit
// (Date, Pot, Paid with) and the filter row on Activity (Category, Pot, Paid
// with). It doubles as the summary of the current value and the button that
// opens its sheet. `active` = not the default (gold); `suggested` adds a ✦
// when the value came from the note rather than a tap; `invalid` flags a pill
// the user still has to fill in.
//
// The dropdown affordance is a real 12px chevron in the label's own colour, not
// a tiny text glyph — the ▾ this replaces was ~9px in the dimmest grey and
// vanished next to the label.
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
  const { colorScheme } = useColorScheme();
  const tokens = colorScheme === "light" ? lightTokens : darkTokens;
  const chevron = invalid ? tokens.negative : active ? tokens.gold : tokens.muted;

  return (
    <Pressable
      onPress={onPress}
      className={`h-8 shrink flex-row items-center gap-1 rounded-full border pl-2.5 pr-2 ${
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
      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={chevron} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M6 9l6 6 6-6" />
      </Svg>
    </Pressable>
  );
}
