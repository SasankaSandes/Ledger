import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useColorScheme } from "nativewind";
import { dateToKey, keyToDate, shortDate, todayKey } from "@/lib/types";

// Cross-platform date picker. Native (this file) drives the OS picker via
// @react-native-community/datetimepicker; web (DateField.web.tsx) falls back to
// a plain <input type="date"> since that package has no web build. Value is a
// "YYYY-MM-DD" key throughout — the same shape stored in transactions.date.
type Props = {
  value: string;
  onChange: (key: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  label?: string;
};

export function DateField({ value, onChange, minimumDate, maximumDate, label = "Date" }: Props) {
  const { colorScheme } = useColorScheme();
  const [iosOpen, setIosOpen] = useState(false);
  const display = value === todayKey() ? "Today" : shortDate(value);

  // Android's picker is a fire-and-forget dialog; iOS renders inline, so we
  // host it in a bottom sheet with an explicit Done button.
  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: keyToDate(value),
        mode: "date",
        minimumDate,
        maximumDate,
        onChange: (event, d) => {
          if (event.type === "set" && d) onChange(dateToKey(d));
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View>
      <Text className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted">{label}</Text>
      <Pressable onPress={open} className="self-start rounded-full border border-line/15 px-3 py-1.5">
        <Text className="text-[12px] text-text2">{display}</Text>
      </Pressable>

      {Platform.OS === "ios" && (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <View className="flex-1 justify-end">
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setIosOpen(false)} className="bg-black/40" />
            <View className="rounded-t-2xl bg-card px-4 pb-8 pt-2">
              <View className="flex-row justify-end">
                <Pressable onPress={() => setIosOpen(false)} hitSlop={8} className="px-2 py-2">
                  <Text className="font-body-semibold text-[13px] text-gold">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={keyToDate(value)}
                mode="date"
                display="spinner"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                themeVariant={colorScheme === "light" ? "light" : "dark"}
                onChange={(_event, d) => {
                  if (d) onChange(dateToKey(d));
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
