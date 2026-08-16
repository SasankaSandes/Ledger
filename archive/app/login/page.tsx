"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up" | "magic-link";

const MODE_LABEL: Record<Mode, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  "magic-link": "Send magic link",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
        return;
      }

      if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email to confirm your account.");
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setMessage("Check your email for a magic link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: "#101218",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        fontFamily: "var(--font-ibm-plex-sans), sans-serif",
        color: "#edeef2",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontSize: 26,
            fontWeight: 600,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          Ledger
        </div>

        <form
          onSubmit={submit}
          style={{
            background: "#171a21",
            border: "1px solid #23262f",
            borderRadius: 16,
            padding: "24px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <label style={{ fontSize: 12, color: "#8b8fa0" }}>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </label>

          {mode !== "magic-link" && (
            <label style={{ fontSize: 12, color: "#8b8fa0" }}>
              Password
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </label>
          )}

          {error && (
            <div style={{ fontSize: 12.5, color: "#e0664f" }}>{error}</div>
          )}
          {message && (
            <div style={{ fontSize: 12.5, color: "#6fcf97" }}>{message}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              background: "#d9a441",
              color: "#101218",
              border: "none",
              borderRadius: 8,
              padding: "10px 0",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Working…" : MODE_LABEL[mode]}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            marginTop: 16,
            fontSize: 12.5,
          }}
        >
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setMessage(null);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: mode === m ? "#d9a441" : "#5a5f6d",
                padding: 0,
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  background: "#1b1e27",
  border: "1px solid #2c303a",
  borderRadius: 8,
  color: "#edeef2",
  fontSize: 13.5,
  padding: "9px 10px",
  outline: "none",
};
