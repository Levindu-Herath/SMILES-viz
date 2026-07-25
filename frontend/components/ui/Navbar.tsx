"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const NAV_ITEMS = [
  { label: "Analyze", href: "/visualize" },
  { label: "Datasets", href: "/datasets" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-14">
        {/* Logo + Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-7 w-7 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold group-hover:bg-emerald-500/30 transition-colors">
              ⌬
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-100">
              SMILES Viz
            </span>
          </Link>

          {user && (
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map(({ label, href }) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? "text-emerald-400 bg-emerald-500/10 font-medium"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* User controls */}
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 hidden sm:inline">
              {user.email}
            </span>
            <button
              onClick={signOut}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
