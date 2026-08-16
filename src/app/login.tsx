import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up" | "magic-link";

const MODE_LABEL: Record<Mode, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  "magic-link": "Send magic link",
};

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // AuthProvider's onAuthStateChange picks up the new session and the
        // root layout's Stack.Protected guards redirect automatically.
        return;
      }

      if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email to confirm your account.");
        return;
      }

      const redirectTo = Linking.createURL("/auth/callback");
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      setMessage("Check your email for a magic link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 items-center justify-center bg-bg px-[18px]"
    >
      <View className="w-full max-w-[360px]">
        <Text className="mb-6 text-center font-display text-[26px] text-gold">Ledger</Text>

        <View className="gap-3 rounded-2xl border border-line/10 bg-card p-[22px]">
          <View>
            <Text className="mb-1.5 text-[12px] text-muted">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#5C6070"
              className="rounded-lg border border-line/10 bg-input px-[10px] py-[9px] text-[13.5px] text-text"
            />
          </View>

          {mode !== "magic-link" && (
            <View>
              <Text className="mb-1.5 text-[12px] text-muted">Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#5C6070"
                className="rounded-lg border border-line/10 bg-input px-[10px] py-[9px] text-[13.5px] text-text"
              />
            </View>
          )}

          {error && <Text className="text-[12.5px] text-negative">{error}</Text>}
          {message && <Text className="text-[12.5px] text-positive">{message}</Text>}

          <Pressable
            onPress={submit}
            disabled={loading}
            className="mt-1.5 items-center rounded-lg bg-gold py-2.5"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            <Text className="font-body-semibold text-[14px] text-on-gold">
              {loading ? "Working…" : MODE_LABEL[mode]}
            </Text>
          </Pressable>
        </View>

        <View className="mt-4 flex-row justify-center gap-4">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setMode(m);
                setError(null);
                setMessage(null);
              }}
            >
              <Text className={`text-[12.5px] ${mode === m ? "text-gold" : "text-muted2"}`}>
                {MODE_LABEL[m]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
