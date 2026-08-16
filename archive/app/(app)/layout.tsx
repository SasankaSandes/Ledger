import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: 18, right: 18, zIndex: 10 }}>
        <SignOutButton />
      </div>
      {children}
    </div>
  );
}
