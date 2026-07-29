"use client";

interface AuthGuardProps {
  children: React.ReactNode;
}

// Auth requirement is currently disabled — all pages are publicly accessible.
// Original gate logic is preserved below, commented out, so it can be re-enabled later.
//
// import { useEffect } from "react";
// import { useRouter } from "next/navigation";
// import { useAuth } from "@/components/auth/AuthProvider";
//
// export function AuthGuard({ children }: AuthGuardProps) {
//   const { user, loading } = useAuth();
//   const router = useRouter();
//
//   useEffect(() => {
//     if (!loading && !user) {
//       router.push("/login");
//     }
//   }, [user, loading, router]);
//
//   if (loading) {
//     return (
//       <div className="min-h-[60vh] flex items-center justify-center">
//         <p className="text-sm text-text-secondary">Loading…</p>
//       </div>
//     );
//   }
//
//   if (!user) return null;
//
//   return <>{children}</>;
// }

export function AuthGuard({ children }: AuthGuardProps) {
  return <>{children}</>;
}
