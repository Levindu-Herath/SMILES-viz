"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.push("/visualize");
      }
    });
  }, [router]);

  return (
    <main className="min-h-screen bg-surface-bg flex items-center justify-center">
      <p className="text-text-secondary text-sm">Confirming your account…</p>
    </main>
  );
}
