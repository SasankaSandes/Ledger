import { Text, useWindowDimensions } from "react-native";
import { entryParts } from "@/lib/amount";

const BASE_SIZE = 38;
const MIN_SIZE = 18;
// IBM Plex Mono's advance is ~0.6em; the extra keeps a little slack so the
// last digit is never the one that gets clipped.
const CHAR_WIDTH_EM = 0.62;
// The entry screens pad their content px-4 on each side.
const GUTTER = 32;

// The big amount readout above the keypad. Shows exactly what's been typed
// plus the untyped remainder of the two decimals dimmed, so it always reads
// as a 2-decimal amount ("Rs 1,250" + dim ".00", "Rs 1,250.5" + dim "0")
// without implying digits the user hasn't entered.
//
// The font size is worked out from the text length and screen width rather
// than left to adjustsFontSizeToFit, which react-native-web ignores — on web
// a long amount ("Rs 999,999,999.99") would otherwise be truncated with an
// ellipsis, hiding exactly the cents just typed.
export function AmountDisplay({ text }: { text: string }) {
  const { width } = useWindowDimensions();
  const { main, hint } = entryParts(text);
  const chars = main.length + hint.length;
  const size = Math.max(MIN_SIZE, Math.min(BASE_SIZE, Math.floor((width - GUTTER) / (chars * CHAR_WIDTH_EM))));

  return (
    <Text className="font-mono text-text" style={{ fontSize: size }} numberOfLines={1}>
      {main}
      <Text className="text-muted2">{hint}</Text>
    </Text>
  );
}
