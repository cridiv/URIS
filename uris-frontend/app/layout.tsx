"use client";

import "./globals.css";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, useSidebar } from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const SESSION_KEY = "uris_auth_verified";

// Module-level cache: survives SPA navigation without needing async I/O.
// Cleared on 401 responses so the guard still catches expired sessions.
let _moduleAuthCache = false;

function _readSessionCache(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}
function _writeSessionCache() {
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
}
function _clearSessionCache() {
  _moduleAuthCache = false;
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}


function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar();
  const pathname = usePathname();
  const normalizedPath = pathname.toLowerCase();
  const hideAppChrome = normalizedPath === "/" || normalizedPath === "/signin" || normalizedPath === "/auth/callback";

  // Initialise from module cache or sessionStorage so there is zero flash on
  // SPA navigation and minimal flash on hard reloads (cookie still valid).
  const alreadyVerified = _moduleAuthCache || _readSessionCache();
  const [authChecked, setAuthChecked] = useState(alreadyVerified);
  const [isAuthenticated, setIsAuthenticated] = useState(alreadyVerified);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const publicPaths = ["/", "/signin", "/auth/callback"];
    if (publicPaths.includes(normalizedPath)) {
      setIsAuthenticated(true);
      setAuthChecked(true);
      return;
    }

    // Already verified this session — no need to hit /auth/me again.
    if (_moduleAuthCache || _readSessionCache()) {
      setIsAuthenticated(true);
      setAuthChecked(true);
      return;
    }

    const verifyAuth = async () => {
      try {
        setAuthError(null);
        let response = await fetch(`${API_BASE}/auth/me`, {
          method: "GET",
          credentials: "include",
        });

        if (response.status === 401 || response.status === 403) {
          // Retry once in case cookie propagation is delayed after redirect.
          await new Promise((resolve) => setTimeout(resolve, 250));
          response = await fetch(`${API_BASE}/auth/me`, {
            method: "GET",
            credentials: "include",
          });
        }

        if (response.status === 401 || response.status === 403) {
          _clearSessionCache();
          setIsAuthenticated(false);
          window.location.href = "/Signin";
          return;
        }

        if (!response.ok) {
          setIsAuthenticated(false);
          setAuthError("Authentication service is temporarily unavailable. Please try again shortly.");
          return;
        }

        // Cache the positive result so subsequent navigations skip this check.
        _moduleAuthCache = true;
        _writeSessionCache();
        setIsAuthenticated(true);
      } catch (error) {
        console.error("[auth] failed to reach /auth/me", error);
        setIsAuthenticated(false);
        setAuthError("Unable to reach authentication service. Check backend/database connectivity and retry.");
      } finally {
        setAuthChecked(true);
      }
    };

    verifyAuth();
  }, [normalizedPath]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f0ef]">
        <p className="text-sm text-ink-500">Checking authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f0f0ef] px-4">
          <div className="max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-sm font-semibold text-amber-900">Authentication check failed</p>
            <p className="mt-2 text-sm text-amber-800">{authError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  if (hideAppChrome) {
    return <>{children}</>;
  }

  return (
    <div 
      style={{
        marginLeft: isOpen ? "220px" : "0px",
        transition: "margin-left 220ms cubic-bezier(0.22, 1, 0.36, 1)"
      }}
      className="flex flex-col min-h-screen"
    >
      <Navbar />
      <main className="flex-1 bg-[#f0f0ef]">
        {children}
      </main>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const normalizedPath = pathname.toLowerCase();
  const hideAppChrome = normalizedPath === "/" || normalizedPath === "/signin" || normalizedPath === "/auth/callback";

  return (
    <html lang="en">
      <body>
        <SidebarProvider>
          {!hideAppChrome && <Sidebar />}
          <LayoutContent>{children}</LayoutContent>
        </SidebarProvider>
      </body>
    </html>
  );
}
