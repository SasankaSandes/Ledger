import { Pressable, Text, View } from "react-native";

// ‹ September 2026 › — the same control on Home and Activity. "Older" is ‹
// (periods are listed most recent first), "newer" is ›.
export function MonthSwitcher({
  label,
  canGoOlder,
  canGoNewer,
  onOlder,
  onNewer,
}: {
  label: string;
  canGoOlder: boolean;
  canGoNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Pressable onPress={onOlder} disabled={!canGoOlder} hitSlop={8} style={{ opacity: canGoOlder ? 1 : 0.3 }}>
        <Text className="text-[13px] text-muted">‹</Text>
      </Pressable>
      <Text className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</Text>
      <Pressable onPress={onNewer} disabled={!canGoNewer} hitSlop={8} style={{ opacity: canGoNewer ? 1 : 0.3 }}>
        <Text className="text-[13px] text-muted">›</Text>
      </Pressable>
    </View>
  );
}
