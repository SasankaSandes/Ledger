import "@/global.css";
import { useCallback } from "react";
import { Stack } from "expo-router";
import Head from "expo-router/head";
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

  return (
    <>
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <meta name="theme-color" content="#101218" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ledger" />
      </Head>
      {(fontsLoaded || fontError) && (
        <View style={{ flex: 1 }} onLayout={onLayout}>
          <AuthProvider>
            <HouseholdProvider>
              <ThemedRoot />
            </HouseholdProvider>
          </AuthProvider>
        </View>
      )}
    </>
  );
}

// Waits for auth + household/theme-preference to resolve before rendering
// any route, so there's no flash of the wrong screen or the wrong theme.
function ThemedRoot() {
  const { loading: authLoading, session } = useAuth();
  const {
    loading: householdLoading,
    householdId,
    onboarded,
    themePreference,
    setThemePreference,
  } = useHousehold();

  if (authLoading || householdLoading) return null;

  const signedIn = !!session;
  const hasHousehold = !!householdId;

  return (
    <ThemeProvider initialPreference={themePreference} onPreferenceChange={setThemePreference}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>

        {/* Reachable via leave/removal, not just brand-new signups (those
            always get a household from handle_new_user()) — without this
            guard, a null householdId would fall through to onboarding,
            whose finish() silently no-ops without one. */}
        <Stack.Protected guard={signedIn && !hasHousehold}>
          <Stack.Screen name="no-household" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && hasHousehold && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && hasHousehold && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="quick-add" options={{ presentation: "modal" }} />
          <Stack.Screen name="edit-transaction" options={{ presentation: "modal" }} />
        </Stack.Protected>

        <Stack.Screen name="auth/callback" />
      </Stack>
    </ThemeProvider>
  );
}
