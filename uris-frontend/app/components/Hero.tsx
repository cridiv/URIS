"use client";
import { useState, useEffect, useRef } from "react";
import PipelinePanel from "./AuditPanel";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  primary:       "#676AF1",
  primaryHover:  "#5558E8",
  primaryLight:  "#EDEEFF",
  primaryBorder: "rgba(103,106,241,0.22)",
  primaryGlow:   "rgba(103,106,241,0.16)",
  ground:        "#F5F6FA",
  surface:       "#FFFFFF",
  ink900:        "#0F1117",
  ink600:        "#3A3D4A",
  ink400:        "#6B7080",
  ink200:        "#B0B4C1",
  ink100:        "#D8DAE5",
  ink50:         "#EDEEF4",
  emerald:       "#059669",
  emeraldBg:     "#ECFDF5",
  emeraldBorder: "rgba(5,150,105,0.22)",
  amber:         "#B45309",
  amberBg:       "#FFFBEB",
  amberBorder:   "rgba(180,83,9,0.22)",
  red:           "#DC2626",
  redBg:         "#FEF2F2",
  violet:        "#7C3AED",
  violetLight:   "rgba(124,58,237,0.08)",
  violetBorder:  "rgba(124,58,237,0.2)",
};

const HEADLINE_WORDS = ["Synthetic data.", "Privacy-native.", "Production-ready."];

// ── Typewriter ────────────────────────────────────────────────────────────────
function TypedHeadline() {
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = HEADLINE_WORDS[wordIdx];
    if (!deleting && charIdx === word.length) {
      const t = setTimeout(() => setDeleting(true), 1900);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx === 0) {
      setWordIdx(i => (i + 1) % HEADLINE_WORDS.length);
      setDeleting(false);
      return;
    }
    const speed = deleting ? 36 : charIdx === 0 ? 340 : 58;
    const t = setTimeout(() => setCharIdx(c => c + (deleting ? -1 : 1)), speed);
    return () => clearTimeout(t);
  }, [charIdx, deleting, wordIdx]);

  return (
    <span style={{ color: C.ink900 }}>
      {HEADLINE_WORDS[wordIdx].slice(0, charIdx)}
      <span style={{
        display: "inline-block", width: 3, height: "0.82em",
        background: C.primary, borderRadius: 1, marginLeft: 3,
        verticalAlign: "middle", animation: "cursorBlink 1s steps(1) infinite",
      }} />
    </span>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────────────
function Ticker({ to, duration = 1600, decimals = 0 }) {
  const [val, setVal] = useState(0);
  const startRef = useRef(null);
  useEffect(() => {
    const step = ts => {
      if (!startRef.current) startRef.current = ts;
      const p = Math.min((ts - startRef.current) / duration, 1);
      setVal((1 - Math.pow(1 - p, 3)) * to);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [to, duration]);
  return <>{val.toFixed(decimals)}</>;
}

// ── Background ────────────────────────────────────────────────────────────────
function BackgroundLayers() {
  return (
    <>
      {/* Fine grid in primary tint */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(${C.primaryBorder} 1px, transparent 1px),
          linear-gradient(90deg, ${C.primaryBorder} 1px, transparent 1px)
        `,
        backgroundSize: "48px 48px",
        opacity: 0.45,
      }} />
      {/* Top fade so grid disappears into the ground */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse 100% 55% at 50% 0%, ${C.ground} 0%, transparent 65%)`,
      }} />
      {/* Left indigo glow */}
      <div style={{
        position: "absolute", top: "5%", left: "-14%",
        width: 580, height: 580, borderRadius: "50%", pointerEvents: "none",
        background: `radial-gradient(circle, ${C.primaryGlow} 0%, transparent 65%)`,
        filter: "blur(2px)",
      }} />
      {/* Right violet glow */}
      <div style={{
        position: "absolute", top: "18%", right: "-10%",
        width: 460, height: 460, borderRadius: "50%", pointerEvents: "none",
        background: "radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 65%)",
      }} />
    </>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 56px", height: 62,
      background: scrolled ? "rgba(245,246,250,0.90)" : "transparent",
      backdropFilter: scrolled ? "blur(18px)" : "none",
      borderBottom: scrolled ? `1px solid ${C.ink100}` : "1px solid transparent",
      transition: "all 0.22s ease",
    }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: `linear-gradient(135deg, ${C.primary}, ${C.violet})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 18px ${C.primaryGlow}`,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" fill="#fff"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink900, letterSpacing: "-0.03em", fontFamily: "IBM Plex Mono, monospace" }}>
          URIS
        </span>
      </div>

      {/* Centre links */}
      <div style={{ display: "flex", gap: 34, alignItems: "center" }}>
        {["Product", "Docs", "Blog"].map(l => (
          <a key={l} href="#" style={{
            fontSize: 13.5, color: C.ink400, textDecoration: "none",
            fontFamily: "IBM Plex Sans, sans-serif", fontWeight: 500,
            transition: "color 0.14s",
          }}
            onMouseEnter={e => e.target.style.color = C.ink900}
            onMouseLeave={e => e.target.style.color = C.ink400}>
            {l}
          </a>
        ))}
      </div>

      {/* Right CTAs */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* Log in — ghost */}
        <a href="/Signin" style={{
          height: 36, padding: "0 14px", borderRadius: 8,
          display: "inline-flex", alignItems: "center",
          fontSize: 13, color: C.ink400, textDecoration: "none",
          fontFamily: "IBM Plex Sans, sans-serif", fontWeight: 500,
          transition: "color 0.14s",
        }}
          onMouseEnter={e => e.target.style.color = C.ink900}
          onMouseLeave={e => e.target.style.color = C.ink400}>
          Log in
        </a>

        {/* Get started — filled */}
        <a href="/Signin" style={{
          height: 36, padding: "0 17px", borderRadius: 8,
          border: "none", background: C.primary,
          color: "#fff", fontSize: 13, fontWeight: 700,
          fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer",
          boxShadow: `0 0 18px ${C.primaryGlow}`,
          transition: "all 0.14s",
          display: "inline-flex", alignItems: "center", textDecoration: "none",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = C.primaryHover; e.currentTarget.style.boxShadow = `0 0 28px rgba(103,106,241,0.32)`; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.primary; e.currentTarget.style.boxShadow = `0 0 18px ${C.primaryGlow}`; }}>
          Get started →
        </a>
      </div>
    </nav>
  );
}

// ── Framework badges ──────────────────────────────────────────────────────────
function FrameworkBadges() {
  const badges = [
    { label: "GDPR",      color: C.primary, bg: C.primaryLight,  border: C.primaryBorder   },
    { label: "CCPA",      color: C.violet,  bg: C.violetLight,   border: C.violetBorder     },
    { label: "HIPAA",     color: C.emerald, bg: C.emeraldBg,     border: C.emeraldBorder    },
    { label: "ISO-27001", color: C.amber,   bg: C.amberBg,       border: C.amberBorder      },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 28 }}>
      {badges.map(b => (
        <span key={b.label} style={{
          fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700,
          color: b.color, background: b.bg, border: `1px solid ${b.border}`,
          borderRadius: 5, padding: "4px 10px", letterSpacing: "0.06em",
        }}>{b.label}</span>
      ))}
    </div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────
function StatsStrip() {
  const STATS = [
    {
      value: 99.8, suffix: "%",  decimals: 1,
      label: "PII accuracy",
      color: C.violet,
    },
    {
      value: 94.3, suffix: "",   decimals: 1,
      label: "data quality score",
      color: C.emerald,
    },
    {
      value: 9.7,  suffix: "s",  decimals: 1,
      label: "avg runtime",
      color: C.amber,
    },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 0,
      marginTop: 52,
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {STATS.map((s, i) => (
        <div
          key={s.label}
          style={{
            padding: "22px 24px",
            borderRight: i < STATS.length - 1 ? `1px solid ${C.ink100}` : "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {/* Value */}
          <div style={{
            fontSize: 28,
            fontFamily: "IBM Plex Mono, monospace",
            fontWeight: 700,
            color: s.color,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}>
            <Ticker to={s.value} decimals={s.decimals} />{s.suffix}
          </div>

          {/* Label */}
          <div style={{
            fontSize: 11,
            fontFamily: "IBM Plex Mono, monospace",
            fontWeight: 600,
            color: C.ink300,
            marginTop: 6,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}>
            {s.label}
          </div>

          {/* Subtext */}
          <div style={{
            fontSize: 10,
            fontFamily: "IBM Plex Mono, monospace",
            color: C.ink200,
            letterSpacing: "0.01em",
            lineHeight: 1.4,
          }}>
            {s.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
// ── Hero section ──────────────────────────────────────────────────────────────
function HeroSection() {
  const [panelKey, setPanelKey] = useState(0);

  return (
    <section style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      padding: "100px 56px 60px", maxWidth: 1280, margin: "0 auto",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center", width: "100%" }}>

        {/* ── Left ── */}
        <div>

          <FrameworkBadges />

          <h1 style={{
            fontSize: 54, fontWeight: 800, lineHeight: 1.08,
            letterSpacing: "-0.035em", margin: "0 0 6px",
            fontFamily: "IBM Plex Mono, monospace",
          }}>
            <TypedHeadline />
          </h1>

          <h2 style={{
            fontSize: 54, fontWeight: 800, lineHeight: 1.08,
            letterSpacing: "-0.035em", margin: "0 0 22px",
            fontFamily: "IBM Plex Mono, monospace",
            background: `linear-gradient(90deg, ${C.primary} 0%, ${C.violet} 55%, #A78BFA 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Compliance-first.
          </h2>

          <p style={{
            fontSize: 17, color: C.ink400, lineHeight: 1.68,
            margin: "0 0 36px", maxWidth: 460,
            fontFamily: "IBM Plex Sans, sans-serif", fontWeight: 400,
          }}>
            A Multi-agent AI pipeline that evaluates data quality, enforces your privacy policy, and synthesises production-ready datasets without exposing a single PII field.
          </p>

          {/* CTAs — two evenly spaced */}
          <div style={{ display: "flex", gap: 10, alignItems: "center"}}>
            {/* Primary */}
            <a href="/Signin" style={{
              height: 46, padding: "0 26px", borderRadius: 11,
              border: "none", background: C.primary,
              color: "#fff", fontSize: 14.5, fontWeight: 700,
              fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer",
              boxShadow: `0 0 24px ${C.primaryGlow}`,
              display: "inline-flex", alignItems: "center", gap: 8, transition: "all 0.15s",
              textDecoration: "none",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = C.primaryHover; e.currentTarget.style.boxShadow = `0 0 36px rgba(103,106,241,0.32)`; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.primary; e.currentTarget.style.boxShadow = `0 0 24px ${C.primaryGlow}`; }}>
              Launch
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14m-6-6l6 6-6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>

            {/* Tertiary — ghost link */}
            <button style={{
              height: 46, padding: "0 18px", borderRadius: 11,
              border: "none", background: "transparent",
              color: C.ink400, fontSize: 14.5, fontWeight: 600,
              fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.color = C.primary}
              onMouseLeave={e => e.currentTarget.style.color = C.ink400}>
              View docs
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <StatsStrip />
        </div>

        {/* ── Right — pipeline panel ── */}
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute", inset: -48, borderRadius: 32,
            background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${C.primaryGlow} 0%, transparent 70%)`,
            pointerEvents: "none",
          }} />
          {/*
            ════════════════════════════════════════════════════
            Swap here for real data:
              <PipelinePanel
                events={yourAuditEvents}
                streamDelay={0}
                filename={dataset.name}
                onComplete={...}
                onReplay={...}
              />
            ════════════════════════════════════════════════════
          */}
          <PipelinePanel
            key={panelKey}
            filename="titanic_v3.csv"
            streamDelay={310}
            onReplay={() => setPanelKey(k => k + 1)}
          />
        </div>
      </div>
    </section>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────
export default function HeroPage() {
  return (
    <div style={{ background: C.ground, minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <BackgroundLayers />
      <Nav />
      <HeroSection />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.ground}; }
        @keyframes cursorBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes livePulse   { 0%,100%{opacity:0.55;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
      `}</style>
    </div>
  );
}