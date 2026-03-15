"use client";
import React, { useEffect, useRef, useState } from "react";
import { X, Mail, Calendar } from "lucide-react";
import Image from "next/image";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://uris.onrender.com";

// ── URIS design tokens ────────────────────────────────────────────────────────
const C = {
  primary:       "#676AF1",
  primaryHover:  "#5558E8",
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
  emerald:       "#059669",
  emeraldBg:     "#ECFDF5",
  emeraldBorder: "rgba(5,150,105,0.22)",
  violet:        "#7C3AED",
  red:           "#DC2626",
  redBg:         "#FEF2F2",
  redBorder:     "rgba(220,38,38,0.22)",
};

type AccountModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type UserInfo = {
  name: string;
  email: string;
  joined: string;
  profileImageUrl?: string;
};

type MeResponse = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  picture: string | null;
  createdAt: string;
};

const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  const generateAvatarUrl = (name: string) => {
    const seed = encodeURIComponent(name.toLowerCase().replace(/\s+/g, ""));
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=676AF1,5558E8,7C3AED&radius=50`;
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

  const getInitials = (name: string) =>
    name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!isOpen) return;
      setIsLoading(true);
      setError(null);
      setAvatarError(false);

      try {
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
          throw new Error(`Failed to load account (${response.status})`);
        }

        const user = (await response.json()) as MeResponse;
        const fullName = [user.firstName, user.lastName]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join(" ")
          .trim();

        setUserInfo({
          name: fullName || user.email?.split("@")[0] || "User",
          email: user.email || "No email provided",
          joined: formatDate(user.createdAt),
          profileImageUrl: user.picture || undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load user data");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        background: "rgba(15,17,23,0.32)",
        backdropFilter: "blur(6px)",
        animation: "urisBackdropIn 0.18s ease",
      }}>
        {/* Card */}
        <div
          ref={modalRef}
          style={{
            width: "100%", maxWidth: 400,
            background: C.surface,
            border: `1px solid ${C.ink100}`,
            borderRadius: 16,
            boxShadow: `0 0 0 1px ${C.primaryBorder}, 0 24px 64px rgba(0,0,0,0.10), 0 0 48px ${C.primaryGlow}`,
            overflow: "hidden",
            fontFamily: "IBM Plex Sans, sans-serif",
            animation: "urisModalIn 0.22s cubic-bezier(0.22,1,0.36,1)",
          }}
        >

          {/* ── Header bar ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px",
            background: C.ground,
            borderBottom: `1px solid ${C.ink100}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {/* URIS logomark */}
              <Image
                src="/uris-logo.svg"
                alt="URIS logo"
                width={26}
                height={26}
                style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0 }}
                priority
              />
              <span style={{
                fontSize: 13, fontWeight: 700, color: C.ink900,
                fontFamily: "IBM Plex Mono, monospace", letterSpacing: "-0.01em",
              }}>
                Account
              </span>
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 28, height: 28, borderRadius: 7,
                border: `1px solid ${C.ink100}`, background: C.surface,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: C.ink400, transition: "all 0.14s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = C.primaryBorder;
                e.currentTarget.style.color = C.primary;
                e.currentTarget.style.background = C.primaryLight;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.ink100;
                e.currentTarget.style.color = C.ink400;
                e.currentTarget.style.background = C.surface;
              }}
            >
              <X size={13} />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: "28px 22px 22px" }}>

            {/* Loading */}
            {isLoading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 0 28px", gap: 14 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[C.primary, C.violet, C.emerald].map((color, i) => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: 99, background: color,
                      animation: `urisDotBounce 0.85s ${i * 0.14}s ease infinite`,
                    }} />
                  ))}
                </div>
                <p style={{ fontSize: 12, color: C.ink400, fontFamily: "IBM Plex Mono, monospace" }}>
                  Loading account…
                </p>
              </div>
            )}

            {/* Error */}
            {!isLoading && error && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 0 20px", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: C.redBg, border: `1px solid ${C.redBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <X size={18} style={{ color: C.red }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.ink900, margin: "0 0 4px" }}>
                    Failed to load account
                  </p>
                  <p style={{ fontSize: 11.5, color: C.ink400, fontFamily: "IBM Plex Mono, monospace" }}>
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* User info */}
            {!isLoading && !error && userInfo && (
              <>
                {/* Avatar + name */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22, gap: 12 }}>
                  {/* Avatar with glow ring */}
                  <div style={{ position: "relative" }}>
                    <div style={{
                      position: "absolute", inset: -3, borderRadius: "50%",
                      background: `conic-gradient(${C.primary}, ${C.violet}, ${C.primary})`,
                      opacity: 0.3, filter: "blur(4px)",
                    }} />
                    <div style={{
                      position: "relative", width: 76, height: 76, borderRadius: "50%",
                      border: `2px solid ${C.primaryBorder}`,
                      overflow: "hidden", background: C.primaryLight, flexShrink: 0,
                    }}>
                      {!avatarError ? (
                        <Image
                          src={userInfo.profileImageUrl || generateAvatarUrl(userInfo.name)}
                          alt={userInfo.name}
                          width={76} height={76}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={() => setAvatarError(true)}
                          unoptimized
                        />
                      ) : (
                        <div style={{
                          width: "100%", height: "100%",
                          background: `linear-gradient(135deg, ${C.primary}, ${C.violet})`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 20, fontWeight: 800, color: "#fff",
                          fontFamily: "IBM Plex Mono, monospace",
                        }}>
                          {getInitials(userInfo.name)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <h3 style={{
                      fontSize: 16, fontWeight: 700, color: C.ink900,
                      margin: "0 0 6px", letterSpacing: "-0.02em",
                    }}>
                      {userInfo.name}
                    </h3>

                  </div>
                </div>

                {/* Info rows */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {([
                    { Icon: Mail,     label: "Email",  value: userInfo.email,  iconColor: C.primary },
                    { Icon: Calendar, label: "Joined", value: userInfo.joined, iconColor: C.violet  },
                  ] as const).map(({ Icon, label, value, iconColor }) => (
                    <div key={label} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 13px",
                      background: C.ground, border: `1px solid ${C.ink100}`,
                      borderRadius: 10,
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                        background: C.surface, border: `1px solid ${C.ink100}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon size={13} style={{ color: iconColor }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 9, fontFamily: "IBM Plex Mono, monospace",
                          fontWeight: 700, color: C.ink200,
                          textTransform: "uppercase", letterSpacing: "0.1em", margin: 0,
                        }}>
                          {label}
                        </p>
                        <p style={{
                          fontSize: 12.5, color: C.ink600, fontWeight: 500,
                          margin: "2px 0 0", overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: C.ink100, margin: "0 0 16px" }} />

                {/* Sign out */}
                <button
                  style={{
                    width: "100%", height: 38, borderRadius: 9,
                    border: `1px solid ${C.ink100}`, background: C.surface,
                    color: C.ink400, fontSize: 13, fontWeight: 600,
                    fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    transition: "all 0.14s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = C.redBorder;
                    e.currentTarget.style.color = C.red;
                    e.currentTarget.style.background = C.redBg;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = C.ink100;
                    e.currentTarget.style.color = C.ink400;
                    e.currentTarget.style.background = C.surface;
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes urisBackdropIn { from{opacity:0} to{opacity:1} }
        @keyframes urisModalIn    { from{opacity:0;transform:scale(0.96) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes urisDotBounce  { 0%,100%{transform:translateY(0);opacity:0.35} 50%{transform:translateY(-5px);opacity:1} }
      `}</style>
    </>
  );
};

export default AccountModal;