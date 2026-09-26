import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DateField } from "@/components/ui/DateField";
import { todayKey, yesterdayKey } from "@/lib/types";

// Small bottom sheets behind the Date / Pot / Paid-with pills on Quick Add and
// Edit, and behind the Activity filter chips. By default drawn as an
// absolutely-positioned overlay inside the screen rather than a nested RN Modal,
// so they behave identically on web, iOS and Android inside those modal
// screens. Render a sheet as a sibling of the screen inside a full-size parent
// View so its scrim also covers the safe areas. A screen that isn't itself a
// modal (Activity is a tab) passes `modal` to put the sheet in a real Modal, so
// the scrim covers the tab bar too.
function Sheet({
  visible,
  title,
  onClose,
  modal,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  modal?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const sheet = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Close"
        className="bg-black/50"
      />
      <View
        className="rounded-t-[20px] border-t border-line/10 bg-card px-4 pt-3.5"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[12px] text-muted">{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text className="font-body-semibold text-[13px] text-gold">Done</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </KeyboardAvoidingView>
  );
  return modal ? (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {sheet}
    </Modal>
  ) : (
    sheet
  );
}

function OptionChip({
  label,
  selected,
  dimmed,
  onPress,
}: {
  label: string;
  selected: boolean;
  dimmed?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-10 justify-center rounded-full border px-4 ${
        selected ? "border-gold/50 bg-gold/[0.12]" : "border-line/15"
      } ${dimmed ? "opacity-50" : ""}`}
    >
      <Text className={`text-[13px] ${selected ? "text-gold" : "text-text2"}`}>{label}</Text>
    </Pressable>
  );
}

// `dimmed` greys out an option that's still selectable but no longer live
// (an archived category, pot or card in the Activity filters).
export type ChoiceOption = { id: string; label: string; dimmed?: boolean };

// Single-choice list as wrapping chips, with the same inline "+ New …"
// creation the old chip rows had. Picking an option closes the sheet;
// onCreate is responsible for the insert and for selecting what it made.
// A long list (Activity's categories) scrolls inside the sheet instead of
// pushing it off the top of the screen.
export function ChoiceSheet({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  createLabel,
  onCreate,
  modal,
}: {
  visible: boolean;
  title: string;
  options: ChoiceOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  createLabel?: string;
  onCreate?: (name: string) => void;
  modal?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const close = () => {
    setAdding(false);
    setName("");
    onClose();
  };

  const submit = () => {
    const trimmed = name.trim();
    setAdding(false);
    setName("");
    if (trimmed && onCreate) {
      onCreate(trimmed);
      onClose();
    }
  };

  return (
    <Sheet visible={visible} title={title} onClose={close} modal={modal}>
      <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap gap-2">
          {options.map((o) => (
            <OptionChip
              key={o.id}
              label={o.label}
              selected={selectedId === o.id}
              dimmed={o.dimmed}
              onPress={() => {
                onSelect(o.id);
                onClose();
              }}
            />
          ))}
          {onCreate &&
            (adding ? (
              <View className="h-10 flex-row items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.1] pl-4 pr-2">
                <TextInput
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  placeholder="name"
                  placeholderTextColor="#5C6070"
                  onSubmitEditing={submit}
                  className="w-28 py-1 text-[13px] text-text"
                />
                <Pressable onPress={submit} hitSlop={6} className="px-1">
                  <Text className="text-[15px] text-gold">✓</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setAdding(true)}
                className="h-10 justify-center rounded-full border border-line/15 px-4"
              >
                <Text className="text-[13px] text-muted">{createLabel ?? "+ New"}</Text>
              </Pressable>
            ))}
        </View>
      </ScrollView>
    </Sheet>
  );
}

// Today / Yesterday cover nearly every case; the platform date picker
// (DateField) handles anything older. Entries can't be dated in the future.
export function DateSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChange: (key: string) => void;
  onClose: () => void;
}) {
  const today = todayKey();
  const yesterday = yesterdayKey();
  const pick = (key: string) => {
    onChange(key);
    onClose();
  };
  return (
    <Sheet visible={visible} title="Date" onClose={onClose}>
      <View className="flex-row gap-2">
        <OptionChip label="Today" selected={value === today} onPress={() => pick(today)} />
        <OptionChip label="Yesterday" selected={value === yesterday} onPress={() => pick(yesterday)} />
      </View>
      <View className="mt-3">
        <DateField label="Another date" value={value} onChange={onChange} maximumDate={new Date()} />
      </View>
    </Sheet>
  );
}
