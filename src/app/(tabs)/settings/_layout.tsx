import { Stack } from "expo-router";

// Nested Stack so Manage can push Household on top without leaving the
// Manage tab (the tab bar stays visible, matching the FRS's "Household
// reached from within Manage, not a tab" navigation).
export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="household" />
    </Stack>
  );
}
