import { Stack } from "expo-router";

// Nested Stack so Settings can push a sub-page on top without leaving the
// Settings tab (the tab bar stays visible). Categories/Pots/Fixed Expenses
// each got their own page instead of being inline sections on the hub.
export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="household" />
      <Stack.Screen name="member-names" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="pots-editor" />
      <Stack.Screen name="fixed-expenses" />
    </Stack>
  );
}
