"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://uris.onrender.com";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    console.debug("[auth-callback] entered", { hasToken: Boolean(token) });

    const validateToken = async () => {
      try {
        if (token) {
          // Legacy token callback path support.
          localStorage.setItem("uris_access_token", token);
        }

        const response = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : undefined,
        });

        console.debug("[auth-callback] /auth/me response", { status: response.status, ok: response.ok });

        if (!response.ok) {
          throw new Error("Token validation failed");
        }

        const user = await response.json();
        localStorage.setItem("uris_user", JSON.stringify(user));
        console.debug("[auth-callback] auth verified; redirecting to /Datasets");
        router.replace("/Datasets");
      } catch (error) {
        console.error("[auth-callback] validation failed", error);
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
