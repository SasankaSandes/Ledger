import { useEffect, useRef } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Bottom-sheet menu of tappable actions, sharing the transparent slide-up
// Modal pattern DateField uses for its iOS picker. Works as-is on web, iOS
// and Android — react-native-web ships a real Modal, so no .web.tsx split.
export type SheetAction = { label: string; onPress: () => void; destructive?: boolean };

type Props = {
  visible: boolean;
  onClose: () => void;
  actions: SheetAction[];
  title?: string;
};

export function ActionSheet({ visible, onClose, actions, title }: Props) {
  const insets = useSafeAreaInsets();
  const pending = useRef<null | (() => void)>(null);

  // Close the sheet first, then run the action once it's gone — router.push /
  // Alert.alert / window.confirm all misbehave when fired under a live modal.
  const run = (fn: () => void) => {
    pending.current = fn;
    onClose();
  };
  const flush = () => {
    const fn = pending.current;
    pending.current = null;
    if (fn) requestAnimationFrame(fn);
  };
  // iOS fires Modal.onDismiss after the slide-out animation; web/Android
  // don't, so flush there when `visible` drops. flush() nulls the ref, so
  // whichever path runs first wins and the other is a no-op.
  useEffect(() => {
    if (Platform.OS !== "ios" && !visible && pending.current) flush();
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={Platform.OS === "ios" ? flush : undefined}
    >
      <View className="flex-1 justify-end">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} className="bg-black/40" />
        <View className="rounded-t-2xl bg-card px-2 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
          {title ? (
            <Text
              numberOfLines={1}
              className="px-3 pb-1 pt-1 text-[10.5px] uppercase tracking-wider text-muted"
            >
              {title}
            </Text>
          ) : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => run(a.onPress)}
              className="rounded-xl px-3 py-3.5 active:bg-fill"
            >
              <Text
                className={`text-[13px] font-body-medium ${a.destructive ? "text-negative" : "text-text2"}`}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
