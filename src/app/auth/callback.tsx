import { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { supabase } from "@/lib/supabase/client";

// Landing route for the magic-link deep link (ledger://auth/callback?code=...).
// Expo Router's file-based deep linking routes the incoming URL here
// automatically — no manual Linking.addEventListener needed. Requires a
// dev-client build to test for real; Expo Go proxies deep links through
// its own exp:// scheme, which won't match what's registered with
// Supabase (see lib/supabase/client.ts).
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");

  useEffect(() => {
    if (!code) {
      setStatus("error");
      return;
    }
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => setStatus(error ? "error" : "done"))
      .catch(() => setStatus("error"));
  }, [code]);

  if (status === "done") return <Redirect href="/" />;

  return (
    <View className="flex-1 items-center justify-center bg-bg px-8">
      <Text className="text-[13px] text-muted">
        {status === "error" ? "That sign-in link didn't work — try again from Login." : "Signing you in…"}
      </Text>
    </View>
  );
}
