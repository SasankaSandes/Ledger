import "@/global.css";
import { useCallback } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { View } from "react-native";
import { useAppFonts } from "@/lib/fonts";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { HouseholdProvider, useHousehold } from "@/lib/household/HouseholdProvider";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  const onLayout = useCallback(async () => {
    if (fontsLoaded || fontError) await SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <AuthProvider>
        <HouseholdProvider>
          <ThemedRoot />
        </HouseholdProvider>
      </AuthProvider>
    </View>
  );
}

// Waits for auth + household/theme-preference to resolve before rendering
// any route, so there's no flash of the wrong screen or the wrong theme.
function ThemedRoot() {
  const { loading: authLoading, session } = useAuth();
  const { loading: householdLoading, onboarded, themePreference, setThemePreference } = useHousehold();

  if (authLoading || householdLoading) return null;

  const signedIn = !!session;

  return (
    <ThemeProvider initialPreference={themePreference} onPreferenceChange={setThemePreference}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="history" />
          <Stack.Screen name="quick-add" options={{ presentation: "modal" }} />
        </Stack.Protected>

        <Stack.Screen name="auth/callback" />
      </Stack>
    </ThemeProvider>
  );
}
