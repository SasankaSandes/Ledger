import { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { supabase } from "@/lib/supabase/client";

// Landing route for the OAuth / magic-link redirect
// (ledger://auth/callback?code=... on native, <origin>/auth/callback?code=...
// on web). Expo Router's file-based deep linking routes the incoming URL
// here automatically — no manual Linking.addEventListener needed. Native
// needs a dev-client build to test for real; Expo Go proxies deep links
// through its own exp:// scheme, which won't match what's registered with
// Supabase (see lib/supabase/client.ts). Sits outside every Stack.Protected
// guard in app/_layout.tsx so it's reachable while signed out.
export default function AuthCallback() {
  const { code, error: errorParam, error_description: errorDescription } =
    useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");

  useEffect(() => {
    // No code to exchange: either nothing was passed, or the provider
    // bounced back with a denial (e.g. cancelled at Google's consent screen).
    if (errorParam || errorDescription || !code) {
      setStatus("error");
      return;
    }
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => setStatus(error ? "error" : "done"))
      .catch(() => setStatus("error"));
  }, [code, errorParam, errorDescription]);

  if (status === "done") return <Redirect href="/" />;

  return (
    <View className="flex-1 items-center justify-center bg-bg px-8">
      <Text className="text-center text-[13px] text-muted">
        {status === "error"
          ? (errorDescription || "That sign-in didn't work") + " — try again from Login."
          : "Signing you in…"}
      </Text>
    </View>
  );
}
