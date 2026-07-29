"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const NAV_ITEMS = [
  { label: "Analyze", href: "/visualize" },
  { label: "Datasets", href: "/datasets" },
  { label: "Train", href: "/train" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <header className="bg-primary-500 sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-14">
        {/* Logo + Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-7 w-7 rounded-md bg-white/15 flex items-center justify-center text-white text-sm font-bold group-hover:bg-white/25 transition-colors duration-150">
              ⌬
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
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
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors duration-150 ${
                      isActive
                        ? "text-white bg-white/20 font-medium"
                        : "text-white/65 hover:text-white hover:bg-white/10"
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
            <span className="text-xs text-white/70 hidden sm:inline">
              {user.email}
            </span>
            <button
              onClick={signOut}
              className="rounded-md border border-white/30 px-3 py-1.5 text-xs text-white/80 hover:border-white/60 hover:text-white transition-colors duration-150"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
