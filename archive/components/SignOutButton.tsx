"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={signOut}
      style={{
        background: "transparent",
        border: "1px solid #3a3f4b",
        borderRadius: 20,
        color: "#8b8fa0",
        fontSize: 11.5,
        padding: "5px 12px",
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}
