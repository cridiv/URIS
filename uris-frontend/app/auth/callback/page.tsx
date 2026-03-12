"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      router.replace("/Signin?error=missing_token");
      return;
    }

    // Persist the JWT so authenticated API calls can use it later.
    localStorage.setItem("uris_access_token", token);

    const validateToken = async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Token validation failed");
        }

        const user = await response.json();
        localStorage.setItem("uris_user", JSON.stringify(user));
        router.replace("/Datasets");
      } catch {
        localStorage.removeItem("uris_access_token");
        localStorage.removeItem("uris_user");
        router.replace("/Signin?error=invalid_token");
      }
    };

    validateToken();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f0ef] px-4 text-center">
      <div>
        <p className="text-lg font-semibold text-ink-800">Signing you in...</p>
        <p className="mt-2 text-sm text-ink-500">Please wait while we complete Google authentication.</p>
      </div>
    </div>
  );
}
