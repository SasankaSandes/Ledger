import { Alert, Platform } from "react-native";

// react-native-web's Alert.alert() is a complete no-op (see
// node_modules/react-native-web/src/exports/Alert) — it never shows
// anything and never calls back, so on web every confirm dialog silently
// did nothing at all. Branch to the browser's native confirm() there;
// use the real Alert.alert on iOS/Android.
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
