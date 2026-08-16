import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — check .env.local"
  );
}

// Session storage is plain AsyncStorage (unencrypted at rest, sandboxed
// per-app) for this milestone. Supabase's documented hybrid
// SecureStore+AsyncStorage pattern is a hardening upgrade for later.
//
// Magic-link sign-in needs a dev-client build (`npx expo run:ios`), not
// Expo Go — Expo Go proxies deep links through its own `exp://` scheme,
// which doesn't match the `ledger://` scheme registered with Supabase.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
