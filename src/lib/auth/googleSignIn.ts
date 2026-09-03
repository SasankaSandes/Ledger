import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase/client";

// "Continue with Google" via Supabase's PKCE OAuth flow.
//
// Web (including an installed PWA): a full-page top-level redirect to
// Google and back — no popup, no FedCM. That's the one variant an iOS
// home-screen PWA handles without breaking out to Safari. supabase-js
// does the window.location assignment; the return lands on
// app/auth/callback.tsx, which runs exchangeCodeForSession().
//
// Native: open the system browser as an auth session. It hands the
// redirect URL back to us (rather than deep-linking into the app), so the
// code exchange happens here. Needs a dev-client build — Expo Go's
// exp:// scheme won't match the ledger:// redirect (see supabase/client.ts).
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = Linking.createURL("/auth/callback");

  if (Platform.OS === "web") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) throw error;
    return; // supabase-js navigates away; nothing after this runs
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Couldn't start Google sign-in.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return; // user closed the browser — not an error

  const { queryParams } = Linking.parse(result.url);
  const providerError = queryParams?.error_description ?? queryParams?.error;
  if (providerError) throw new Error(String(providerError));

  const code = queryParams?.code;
  if (typeof code !== "string") throw new Error("No sign-in code returned by Google.");

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}
