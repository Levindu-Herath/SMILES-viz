"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/visualize");
    }
  }, [user, authLoading, router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-surface-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Get started with SMILES Viz
          </p>
        </div>

        <div className="rounded-lg border border-surface-border bg-surface-card p-6">
          {success ? (
            <div className="text-center space-y-4">
              <div className="inline-flex h-12 w-12 rounded-full bg-success-bg items-center justify-center text-success-text text-xl">
                ✓
              </div>
              <div>
                <h2 className="text-lg font-medium text-text-primary">
                  Check your email
                </h2>
                <p className="mt-2 text-sm text-text-secondary">
                  We sent a confirmation link to{" "}
                  <span className="text-text-primary font-medium">{email}</span>.
                  Click it to activate your account.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-block text-sm text-primary-500 hover:text-primary-600 font-medium transition-colors duration-150"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-text-secondary mb-1.5"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-md border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-text-secondary mb-1.5"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-md border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-sm font-medium text-text-secondary mb-1.5"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-md border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </form>
            </>
          )}
        </div>

        {!success && (
          <p className="text-center text-sm text-text-secondary">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary-500 hover:text-primary-600 font-medium transition-colors duration-150"
            >
              Sign in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
