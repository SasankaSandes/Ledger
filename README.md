# Ledger

A salary companion that turns each paycheck into a living plan. Native app built with Expo (React Native + Expo Router), Supabase for auth/data, and NativeWind for styling.

See [FRS.md](./FRS.md) for the product spec. The previous Next.js web build lives in [archive/](./archive) for reference — it isn't wired into this app.

## Get started

```bash
npm install
npx expo start
```

Requires a `.env.local` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.local.example`).

Press `i` for the iOS Simulator, `a` for Android, or scan the QR code with Expo Go. Magic-link sign-in needs a dev-client build (`npx expo run:ios`) rather than Expo Go — see the note in `lib/supabase/client.ts`.
