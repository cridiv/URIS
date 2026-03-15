"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import AccountModal from "./AccountModal";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://uris.onrender.com";

// ── URIS tokens ───────────────────────────────────────────────────────────────
const C = {
  primary:       "#676AF1",
  primaryLight:  "#EDEEFF",
  primaryBorder: "rgba(103,106,241,0.22)",
  primaryGlow:   "rgba(103,106,241,0.14)",
  ground:        "#F5F6FA",
  surface:       "#FFFFFF",
  ink900:        "#0F1117",
  ink600:        "#3A3D4A",
  ink400:        "#6B7080",
  ink200:        "#B0B4C1",
  ink100:        "#D8DAE5",
  violet:        "#7C3AED",
  emerald:       "#059669",
};

type NavbarUser = {
  name: string;
  picture?: string;
};

type MeResponse = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  picture: string | null;
  createdAt: string;
};

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ── Reusable icon button ──────────────────────────────────────────────────────
function NavIconBtn({
  children,
  badge,
  onClick,
  label,
}: {
  children: React.ReactNode;
  badge?: boolean;
  onClick?: () => void;
  label: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: 32, height: 32, borderRadius: 9,
        border: `1px solid ${hovered ? C.primaryBorder : C.ink100}`,
        background: hovered ? C.primaryLight : C.surface,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        color: hovered ? C.primary : C.ink400,
        transition: "all 0.14s",
        flexShrink: 0,
      }}
    >
      {children}
      {badge && (
        <span style={{
          position: "absolute", top: 5, right: 5,
          width: 6, height: 6, borderRadius: 99,
          background: C.primary,
          border: `1.5px solid ${C.surface}`,
          boxShadow: `0 0 5px ${C.primaryGlow}`,
        }} />
      )}
    </button>
  );
}

// ── Avatar button ─────────────────────────────────────────────────────────────
function AvatarBtn({
  initials,
  imageUrl,
  onClick,
}: {
  initials: string;
  imageUrl?: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl) && imageUrl !== failedImageUrl;

  return (
    <button
      aria-label="Account"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: 30, height: 30, borderRadius: "50%",
        border: `2px solid ${hovered ? C.primary : C.primaryBorder}`,
        background: "none",
        padding: 0, cursor: "pointer",
        transition: "all 0.14s",
        boxShadow: hovered ? `0 0 10px ${C.primaryGlow}` : "none",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: "100%", height: "100%", borderRadius: "50%",
        background: showImage
          ? C.surface
          : `linear-gradient(135deg, ${C.primary}, ${C.violet})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9.5, fontWeight: 800, color: "#fff",
        fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.03em",
        userSelect: "none",
        overflow: "hidden",
      }}>
        {showImage ? (
          <Image
            src={imageUrl!}
            alt="Account"
            width={30}
            height={30}
            unoptimized
            onError={() => setFailedImageUrl(imageUrl ?? null)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials
        )}
      </div>
    </button>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ width: 1, height: 18, background: C.ink100, flexShrink: 0 }} />;
}

// ── Navbar ────────────────────────────────────────────────────────────────────
export default function Navbar() {
  const [accountOpen, setAccountOpen] = useState(false);
  const [user, setUser] = useState<NavbarUser | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const cachedUser = typeof window !== "undefined"
          ? window.localStorage.getItem("uris_user")
          : null;

        if (cachedUser) {
          const parsed = JSON.parse(cachedUser) as Partial<MeResponse>;
          const cachedName = [parsed.firstName, parsed.lastName]
            .filter((value): value is string => Boolean(value && value.trim()))
            .join(" ")
            .trim();

          setUser({
            name: cachedName || parsed.email?.split("@")[0] || "User",
            picture: parsed.picture || undefined,
          });
        }

        const token = typeof window !== "undefined"
          ? window.localStorage.getItem("uris_access_token")
          : null;

        const response = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : undefined,
        });

        if (!response.ok) {
          return;
        }

        const me = (await response.json()) as MeResponse;
        const fullName = [me.firstName, me.lastName]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join(" ")
          .trim();

        const nextUser = {
          name: fullName || me.email?.split("@")[0] || "User",
          picture: me.picture || undefined,
        };

        setUser(nextUser);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("uris_user", JSON.stringify(me));
        }
      } catch {
        // Keep the navbar resilient; fall back to initials if account lookup fails.
      }
    };

    loadUser();
  }, []);

  const initials = user?.name
    ?.split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "UR";

  return (
    <>
      <header style={{
        height: 52,
        background: C.surface,
        borderBottom: `1px solid ${C.ink100}`,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 8,
        fontFamily: "IBM Plex Sans, sans-serif",
        position: "sticky", top: 0, zIndex: 40,
      }}>

        {/* ── Spacer ── */}
        <div style={{ flex: 1 }} />

        {/* ── Right actions ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <NavIconBtn label="Search">
            <SearchIcon />
          </NavIconBtn>

          <NavIconBtn label="Notifications" badge>
            <BellIcon />
          </NavIconBtn>

          <Divider />

          {/* Avatar → opens AccountModal */}
          <AvatarBtn
            initials={initials}
            imageUrl={user?.picture}
            onClick={() => setAccountOpen(true)}
          />
        </div>
      </header>

      <AccountModal isOpen={accountOpen} onClose={() => setAccountOpen(false)} />

      <style>{`
        @keyframes urisNavPulse {
          0%,100% { opacity:0.55; transform:scale(1); }
          50%      { opacity:1;    transform:scale(1.3); }
        }
      `}</style>
    </>
  );
}