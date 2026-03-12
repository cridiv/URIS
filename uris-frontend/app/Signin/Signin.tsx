"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const SignIn = () => {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<"google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authError = searchParams.get("error");

    if (authError === "missing_token") {
      setError("No token was returned from Google login. Please try again.");
      return;
    }

    if (authError === "invalid_token") {
      setError("Login token validation failed. Please sign in again.");
    }
  }, [searchParams]);

  const handleGoogleLogin = () => {
    setLoading("google");
    setError(null);
    window.location.href = `${API_BASE}/auth/google`;
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Background glow effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[35%] -left-[12%] h-136 w-136 rounded-full bg-[#676AF1]/18 blur-[140px]"></div>
        <div className="absolute -bottom-[28%] -right-[16%] h-120 w-120 rounded-full bg-[#676AF1]/12 blur-[140px]"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="relative overflow-hidden rounded-2xl border border-surface-200 bg-white p-8 shadow-[0_28px_90px_rgba(103,106,241,0.14)]">
          {/* Accent corner */}
          <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-4xl bg-[#676AF1]/10 pointer-events-none"></div>
          <div className="mb-4 inline-flex items-center rounded-full border border-[#676AF1]/15 bg-[#676AF1]/8 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#676AF1] font-mono">
            Sign In
          </div>

          {/* Logo */}
          <div className="mb-6 border-b border-surface-100 pb-4 text-center">
            <div className="text-3xl font-bold tracking-tight text-ink-900">
              Welcome to <span className="text-[#676AF1]">URIS</span>
            </div>
          </div>

          {/* Info text */}
          <p className="mb-8 text-center text-[15px] leading-7 text-ink-500">
            Sign in with your existing provider to access the URIS workspace and continue with your datasets and pipeline runs.
          </p>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Sign-in buttons */}
          <div className="space-y-4 pb-5">
            <button
              onClick={handleGoogleLogin}
              disabled={!!loading}
              className="flex w-full cursor-pointer items-center justify-center space-x-2 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 font-semibold text-ink-700 transition-all duration-150 hover:border-[#676AF1]/35 hover:bg-[#676AF1]/3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "google" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              <span>Sign in with Google</span>
            </button>
          </div>

          {/* Terms and privacy */}
          <p className="mt-8 pb-3 text-center text-xs leading-6 text-ink-500">
            By signing in, you accept the{" "}
            <Link href="#" className="font-medium text-[#676AF1] transition-colors hover:text-[#5558E8]">
              Terms of Service
            </Link>{" "}
            and acknowledge our{" "}
            <Link href="#" className="font-medium text-[#676AF1] transition-colors hover:text-[#5558E8]">
              Privacy Policy
            </Link>
            .
          </p>

          {/* Back to Home */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="flex items-center justify-center gap-1 text-sm font-medium text-ink-500 transition-colors duration-150 hover:text-[#676AF1]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SignIn;