"use client";
import Image from "next/image";
import { useState, useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";

// ── Design tokens (identical to HeroPage) ────────────────────────────────────
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
  redBorder:     "rgba(220,38,38,0.22)",
  violet:        "#7C3AED",
  violetLight:   "rgba(124,58,237,0.08)",
  violetBorder:  "rgba(124,58,237,0.2)",
};

// ── Scroll-reveal hook ────────────────────────────────────────────────────────
function useReveal(threshold = 0.12): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{
      padding: "100px 56px",
      maxWidth: 1280,
      margin: "0 auto",
      position: "relative",
      ...style,
    }}>
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
      <div style={{ width: 18, height: 1.5, background: C.primary, borderRadius: 99 }} />
      <span style={{
        fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700,
        color: C.primary, letterSpacing: "0.12em", textTransform: "uppercase",
      }}>{children}</span>
    </div>
  );
}

function SectionHeading({ children, sub, maxWidth = 640 }: { children: ReactNode; sub?: ReactNode; maxWidth?: number }) {
  return (
    <div style={{ marginBottom: 56 }}>
      <h2 style={{
        fontSize: 42, fontWeight: 800, lineHeight: 1.1,
        letterSpacing: "-0.03em", color: C.ink900, margin: "0 0 16px",
        fontFamily: "IBM Plex Mono, monospace", maxWidth,
      }}>{children}</h2>
      {sub && (
        <p style={{
          fontSize: 17, color: C.ink400, lineHeight: 1.65,
          maxWidth: 560, fontFamily: "IBM Plex Sans, sans-serif", fontWeight: 400, margin: 0,
        }}>{sub}</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HOW IT WORKS
// ══════════════════════════════════════════════════════════════════════════════
const STEPS = [
  {
    num: "01",
    title: "Upload your dataset",
    body: "Drop any CSV, Parquet, or JSON file. URIS ingests it directly — no transformation needed, no schema mapping required upfront.",
    color: C.primary,
    bg:    C.primaryLight,
    border: C.primaryBorder,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    num: "02",
    title: "Attach a compliance policy",
    body: "Select GDPR, CCPA, HIPAA, or compose a custom DSL policy. The pipeline enforces it as a deterministic gate — no hallucination possible.",
    color: C.violet,
    bg:    C.violetLight,
    border: C.violetBorder,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    num: "03",
    title: "Run the 4-agent pipeline",
    body: "Evaluation → Planner → Compliance → Synthesis. Each agent publishes a live audit trail. The whole run typically completes in under 60 seconds.",
    color: C.emerald,
    bg:    C.emeraldBg,
    border: C.emeraldBorder,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    num: "04",
    title: "Download production-ready data",
    body: "Receive a synthetic dataset with a verified ADFI score, a zero-PII compliance report, and a full chain-of-custody audit log you can share with regulators.",
    color: C.amber,
    bg:    C.amberBg,
    border: C.amberBorder,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

function HowItWorksSection() {
  const [ref, visible] = useReveal();
  return (
    <div style={{ background: C.surface, borderTop: `1px solid ${C.ink100}`, borderBottom: `1px solid ${C.ink100}` }}>
      <Section>
        <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(24px)", transition: "all 0.55s ease" }}>
          <SectionLabel>How it works</SectionLabel>
          <SectionHeading
            sub="Four deterministic steps from raw data to a compliance-verified synthetic dataset. No black boxes, no guesswork."
          >
            Pipeline in four steps.
          </SectionHeading>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: C.ink100, borderRadius: 14, overflow: "hidden" }}>
          {STEPS.map((step, i) => (
            <StepCard key={step.num} step={step} index={i} parentVisible={visible} />
          ))}
        </div>

        {/* Connector line */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 2px 0", position: "relative" }}>
          <div style={{ position: "absolute", left: "12.5%", right: "12.5%", top: 42, height: 1, background: `linear-gradient(90deg, ${C.primary}, ${C.violet}, ${C.emerald}, ${C.amber})`, opacity: 0.25 }} />
          {STEPS.map(s => (
            <div key={s.num} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: 99, background: s.color, boxShadow: `0 0 8px ${s.color}55`, zIndex: 1 }} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

type Step = (typeof STEPS)[number];

function StepCard({ step, index, parentVisible }: { step: Step; index: number; parentVisible: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "32px 28px",
        background: hovered ? C.ground : C.surface,
        transition: "background 0.2s ease",
        opacity: parentVisible ? 1 : 0,
        transform: parentVisible ? "none" : "translateY(20px)",
        transitionDelay: `${index * 0.08 + 0.1}s`,
        transitionDuration: "0.5s",
        cursor: "default",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 11, marginBottom: 20,
        background: step.bg, border: `1px solid ${step.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: step.color,
        transform: hovered ? "scale(1.06)" : "scale(1)",
        transition: "transform 0.2s ease",
      }}>
        {step.icon}
      </div>

      <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: step.color, marginBottom: 10, letterSpacing: "0.08em" }}>
        {step.num}
      </div>
      <h3 style={{ fontSize: 15.5, fontWeight: 700, color: C.ink900, margin: "0 0 10px", fontFamily: "IBM Plex Sans, sans-serif", letterSpacing: "-0.01em", lineHeight: 1.3 }}>
        {step.title}
      </h3>
      <p style={{ fontSize: 13.5, color: C.ink400, lineHeight: 1.65, margin: 0, fontFamily: "IBM Plex Sans, sans-serif" }}>
        {step.body}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURES
// ══════════════════════════════════════════════════════════════════════════════
const FEATURES = [
  {
    tag: "Evaluation Agent",
    tagColor: C.primary,
    tagBg: C.primaryLight,
    tagBorder: C.primaryBorder,
    headline: "Baseline your data quality before you touch it.",
    body: "The Evaluation agent computes a full ADFI score, maps column types, detects nulls, and flags PII fields — all before synthesis begins. You always know what you're working with.",
    bullets: ["ADFI baseline & target scoring", "Column-level PII classification", "Gap & anomaly detection", "Schema fingerprinting"],
    visual: <EvalVisual />,
  },
  {
    tag: "Compliance Agent",
    tagColor: C.violet,
    tagBg: C.violetLight,
    tagBorder: C.violetBorder,
    headline: "Policy enforcement that's deterministic, not probabilistic.",
    body: "Unlike LLM-based filters, the Compliance agent applies your DSL policy as a hard boolean gate. If a directive says BLOCK, the column is blocked — no exceptions, no leakage.",
    bullets: ["BLOCK / MASK / FLAG / GENERALISE / DROP verbs", "GDPR, CCPA, HIPAA built-in", "Custom DSL rule composer", "Zero-hallucination enforcement"],
    visual: <ComplianceVisual />,
    reversed: true,
  },
  {
    tag: "Synthesis Agent",
    tagColor: C.emerald,
    tagBg: C.emeraldBg,
    tagBorder: C.emeraldBorder,
    headline: "Synthetic data that passes statistical scrutiny.",
    body: "The Synthesis agent runs up to 3 attempts, checking re-identification risk and distribution fidelity on each pass. You only get output that clears every threshold.",
    bullets: ["Re-ID risk scoring < 0.1 threshold", "Distribution fidelity checks", "Up to 3 auto-retry attempts", "ADFI improvement guaranteed"],
    visual: <SynthVisual />,
  },
];

function EvalVisual() {
  const cols = [
    { name: "PassengerId", type: "INTEGER",  pii: false, null: 0   },
    { name: "Name",        type: "VARCHAR",  pii: true,  null: 0   },
    { name: "Age",         type: "FLOAT",    pii: false, null: 19.9 },
    { name: "Email",       type: "VARCHAR",  pii: true,  null: 0   },
    { name: "Survived",    type: "BOOLEAN",  pii: false, null: 0   },
  ];
  return (
    <div style={{ background: C.ground, border: `1px solid ${C.ink100}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.ink100}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: C.ink400, letterSpacing: "0.08em", textTransform: "uppercase" }}>Schema scan</span>
        <div style={{ marginLeft: "auto", fontSize: 9, fontFamily: "IBM Plex Mono, monospace", color: C.emerald, background: C.emeraldBg, border: `1px solid ${C.emeraldBorder}`, borderRadius: 4, padding: "2px 7px", fontWeight: 700 }}>COMPLETE</div>
      </div>
      <div style={{ padding: "8px 0" }}>
        {cols.map(col => (
          <div key={col.name} style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 48px", gap: 8, alignItems: "center", padding: "7px 16px" }}>
            <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: col.pii ? C.red : C.ink600, fontWeight: col.pii ? 700 : 500 }}>{col.name}</span>
            <span style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", color: C.ink200, letterSpacing: "0.04em" }}>{col.type}</span>
            {col.pii
              ? <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: C.red, background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 4, padding: "1px 6px", textAlign: "center" }}>PII</span>
              : <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", color: C.ink200, textAlign: "center" }}>—</span>
            }
            <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: col.null > 0 ? C.amber : C.ink200, textAlign: "right" }}>{col.null > 0 ? `${col.null}%` : "—"}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.ink100}`, display: "flex", gap: 16 }}>
        {[["ADFI baseline", "0.827", C.primary], ["PII cols", "2", C.red], ["Null risk", "19.9%", C.amber]].map(([label, value, color]) => (
          <div key={label}>
            <div style={{ fontSize: 15, fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color, letterSpacing: "-0.02em" }}>{value}</div>
            <div style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", color: C.ink200, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComplianceVisual() {
  const rules = [
    { verb: "BLOCK",      col: "Name",       reason: "direct_identifier",     color: C.red,    bg: C.redBg,      border: C.redBorder },
    { verb: "BLOCK",      col: "Email",       reason: "direct_identifier",     color: C.red,    bg: C.redBg,      border: C.redBorder },
    { verb: "GENERALISE", col: "Age",         reason: "quasi_identifier",      color: C.amber,  bg: C.amberBg,    border: C.amberBorder },
    { verb: "FLAG",       col: "PassportNo",  reason: "sensitive_attribute",   color: C.violet, bg: C.violetLight, border: C.violetBorder },
    { verb: "PASS",       col: "PassengerId", reason: "non_sensitive",         color: C.emerald, bg: C.emeraldBg, border: C.emeraldBorder },
  ];
  return (
    <div style={{ background: C.ground, border: `1px solid ${C.ink100}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.ink100}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: C.ink400, letterSpacing: "0.08em", textTransform: "uppercase" }}>Policy directives</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["GDPR", "CCPA"].map(f => (
            <span key={f} style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 4, padding: "2px 7px" }}>{f}</span>
          ))}
        </div>
      </div>
      <div style={{ padding: "8px 0" }}>
        {rules.map(r => (
          <div key={r.col} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 16px" }}>
            <span style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: r.color, background: r.bg, border: `1px solid ${r.border}`, borderRadius: 4, padding: "2px 8px", minWidth: 80, textAlign: "center", letterSpacing: "0.04em" }}>{r.verb}</span>
            <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: C.ink600, flex: 1 }}>{r.col}</span>
            <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: C.ink200 }}>{r.reason}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "11px 16px", borderTop: `1px solid ${C.ink100}` }}>
        <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: C.emerald, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: 99, background: C.emerald }} />
          Manifest resolved — 12 columns active, 2 blocked
        </div>
      </div>
    </div>
  );
}

function SynthVisual() {
  const attempts = [
    { n: 1, adfi: "0.841", reid: "0.14", pass: false, note: "Re-ID above threshold" },
    { n: 2, adfi: "0.876", reid: "0.11", pass: false, note: "Distribution mismatch" },
    { n: 3, adfi: "0.912", reid: "0.08", pass: true,  note: "All checks passed" },
  ];
  return (
    <div style={{ background: C.ground, border: `1px solid ${C.ink100}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.ink100}` }}>
        <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: C.ink400, letterSpacing: "0.08em", textTransform: "uppercase" }}>Synthesis attempts</span>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {attempts.map(a => (
          <div key={a.n} style={{ background: a.pass ? C.emeraldBg : C.surface, border: `1px solid ${a.pass ? C.emeraldBorder : C.ink100}`, borderRadius: 9, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: a.pass ? C.emerald : C.ink50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {a.pass
                ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: C.ink400 }}>{a.n}</span>
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: a.pass ? C.emerald : C.ink400, fontFamily: "IBM Plex Mono, monospace", marginBottom: 3 }}>{a.note}</div>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: C.ink600 }}>ADFI <b style={{ color: a.pass ? C.emerald : C.primary }}>{a.adfi}</b></span>
                <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: C.ink600 }}>Re-ID <b style={{ color: a.reid > "0.10" ? C.amber : C.emerald }}>{a.reid}</b></span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "11px 16px", borderTop: `1px solid ${C.ink100}`, display: "flex", gap: 16 }}>
        {[["Final ADFI", "0.912", C.emerald], ["Improvement", "+10.3%", C.primary], ["Rows synth.", "1,311", C.violet]].map(([label, value, color]) => (
          <div key={label}>
            <div style={{ fontSize: 15, fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color, letterSpacing: "-0.02em" }}>{value}</div>
            <div style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", color: C.ink200, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <Section>
      <SectionLabel>Platform features</SectionLabel>
      <SectionHeading
        sub="Each of the four agents is purpose-built for its role. No monolithic model — deterministic, inspectable, auditable."
      >
        Built agent by agent.<br/>Verified step by step.
      </SectionHeading>

      <div style={{ display: "flex", flexDirection: "column", gap: 80 }}>
        {FEATURES.map((f) => (
          <FeatureRow key={f.tag} feature={f} />
        ))}
      </div>
    </Section>
  );
}

type Feature = (typeof FEATURES)[number];

function FeatureRow({ feature: f }: { feature: Feature }) {
  const [ref, visible] = useReveal(0.08);
  const reversed = f.reversed;
  return (
    <div
      ref={ref}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 64,
        alignItems: "center",
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(32px)",
        transition: "all 0.6s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {/* Copy */}
      <div style={{ order: reversed ? 2 : 1 }}>
        <span style={{
          fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700,
          color: f.tagColor, background: f.tagBg, border: `1px solid ${f.tagBorder}`,
          borderRadius: 5, padding: "3px 10px", letterSpacing: "0.07em",
          display: "inline-block", marginBottom: 18,
        }}>{f.tag}</span>
        <h3 style={{ fontSize: 28, fontWeight: 800, color: C.ink900, margin: "0 0 16px", fontFamily: "IBM Plex Mono, monospace", lineHeight: 1.2, letterSpacing: "-0.025em" }}>
          {f.headline}
        </h3>
        <p style={{ fontSize: 15.5, color: C.ink400, lineHeight: 1.7, margin: "0 0 28px", fontFamily: "IBM Plex Sans, sans-serif" }}>
          {f.body}
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {f.bullets.map((b: string) => (
            <li key={b} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: C.ink600, fontFamily: "IBM Plex Sans, sans-serif" }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, background: f.tagBg, border: `1px solid ${f.tagBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={f.tagColor} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* Visual */}
      <div style={{ order: reversed ? 1 : 2 }}>
        {f.visual}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE SECTION
// ══════════════════════════════════════════════════════════════════════════════
const FRAMEWORKS = [
  {
    name: "GDPR",
    region: "European Union",
    color: C.primary,
    bg: C.primaryLight,
    border: C.primaryBorder,
    caps: ["Right to erasure", "Data minimisation", "Purpose limitation", "Re-ID prevention"],
  },
  {
    name: "CCPA",
    region: "California, USA",
    color: C.violet,
    bg: C.violetLight,
    border: C.violetBorder,
    caps: ["Consumer opt-out", "Data deletion", "No sale of PI", "Disclosure rights"],
  },
  {
    name: "HIPAA",
    region: "United States",
    color: C.emerald,
    bg: C.emeraldBg,
    border: C.emeraldBorder,
    caps: ["PHI de-identification", "Safe Harbor method", "Expert determination", "Access controls"],
  },
  {
    name: "ISO 27001",
    region: "International",
    color: C.amber,
    bg: C.amberBg,
    border: C.amberBorder,
    caps: ["Data classification", "Risk assessment", "Audit trail", "Access management"],
  },
];

function ComplianceSection() {
  const [ref, visible] = useReveal();
  return (
    <div style={{ background: C.surface, borderTop: `1px solid ${C.ink100}`, borderBottom: `1px solid ${C.ink100}` }}>
      <Section>
        <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(24px)", transition: "all 0.55s ease" }}>
          <SectionLabel>Compliance coverage</SectionLabel>
          <SectionHeading
            sub="Built-in frameworks map directly to URIS policy directives. Your legal team approves the policy once — the pipeline enforces it on every run."
          >
            Regulatory coverage<br/>out of the box.
          </SectionHeading>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {FRAMEWORKS.map((fw, i) => (
            <ComplianceCard key={fw.name} fw={fw} delay={i * 0.07} parentVisible={visible} />
          ))}
        </div>

        {/* Audit trail callout */}
        <div style={{
          marginTop: 48, padding: "32px 40px",
          background: `linear-gradient(135deg, ${C.primaryLight} 0%, ${C.violetLight} 100%)`,
          border: `1px solid ${C.primaryBorder}`,
          borderRadius: 16,
          display: "grid", gridTemplateColumns: "1fr auto",
          gap: 32, alignItems: "center",
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(20px)",
          transition: "all 0.6s 0.4s ease",
        }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: C.primary, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
              Full chain-of-custody
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: C.ink900, margin: "0 0 10px", fontFamily: "IBM Plex Mono, monospace", letterSpacing: "-0.02em" }}>
              Every run ships with a regulator-ready audit log.
            </h3>
            <p style={{ fontSize: 14.5, color: C.ink400, lineHeight: 1.65, margin: 0, fontFamily: "IBM Plex Sans, sans-serif" }}>
              URIS emits a timestamped event for every agent action — schema scan, policy directive, synthesis attempt, compliance gate. The resulting log is structured JSON you can attach directly to a DPA or compliance report.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
            {[
              { label: "Events per run",  value: "41+",   color: C.primary },
              { label: "Log format",      value: "JSON",  color: C.violet  },
              { label: "Retention",       value: "90d",   color: C.emerald },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "rgba(255,255,255,0.65)", borderRadius: 8, backdropFilter: "blur(8px)" }}>
                <span style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: C.ink400 }}>{s.label}</span>
                <span style={{ fontSize: 13, fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

type Framework = (typeof FRAMEWORKS)[number];

function ComplianceCard({ fw, delay, parentVisible }: { fw: Framework; delay: number; parentVisible: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "28px 24px",
        background: hovered ? fw.bg : C.surface,
        border: `1px solid ${hovered ? fw.border : C.ink100}`,
        borderRadius: 14,
        transition: "all 0.2s ease",
        opacity: parentVisible ? 1 : 0,
        transform: parentVisible ? "none" : "translateY(16px)",
        transitionDelay: `${delay + 0.1}s`,
        transitionDuration: "0.5s",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: fw.color, letterSpacing: "-0.02em" }}>{fw.name}</div>
          <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: C.ink200, marginTop: 3 }}>{fw.region}</div>
        </div>
        <div style={{ width: 10, height: 10, borderRadius: 99, background: fw.color, marginTop: 4, boxShadow: `0 0 8px ${fw.color}55` }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {fw.caps.map((cap: string) => (
          <div key={cap} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink600, fontFamily: "IBM Plex Sans, sans-serif" }}>
            <div style={{ width: 4, height: 4, borderRadius: 99, background: fw.color, flexShrink: 0, opacity: 0.7 }} />
            {cap}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FAQ
// ══════════════════════════════════════════════════════════════════════════════
const FAQS = [
  {
    q: "How is URIS different from a traditional anonymisation tool?",
    a: "Traditional tools modify real data — masking, suppressing, or generalising fields in the original dataset. URIS synthesises entirely new data that is statistically equivalent but contains zero real records. Re-identification is structurally impossible, not just improbable.",
  },
  {
    q: "What is an ADFI score?",
    a: "ADFI (Augmented Data Fidelity Index) measures how well the synthetic dataset preserves the statistical properties of the original — distributions, correlations, and marginal frequencies — while remaining non-re-identifiable. A score above 0.90 is considered production-ready.",
  },
  {
    q: "Can I bring my own compliance policy?",
    a: "Yes. The Pro and Enterprise plans include the DSL rule composer, where you can write custom directives using verbs like BLOCK, MASK, FLAG, GENERALISE, and DROP. Policies are versioned and stored alongside the run they were used for.",
  },
  {
    q: "Is the audit log accepted by regulators?",
    a: "The log is structured JSON containing a timestamped record of every agent action, directive applied, and QA check result. Several of our Enterprise customers have used it successfully in GDPR Data Protection Assessments and HIPAA audit submissions.",
  },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  const [ref, visible] = useReveal();
  return (
    <div style={{ background: C.surface, borderTop: `1px solid ${C.ink100}`, borderBottom: `1px solid ${C.ink100}` }}>
      <Section>
        <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(24px)", transition: "all 0.55s ease" }}>
          <SectionLabel>FAQ</SectionLabel>
          <SectionHeading sub="Common questions from data teams, privacy officers, and compliance leads.">
            Answers worth reading.
          </SectionHeading>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {FAQS.map((faq, i) => (
            <FAQItem key={i} faq={faq} isOpen={open === i} onToggle={() => setOpen(open === i ? null : i)} delay={i * 0.06} parentVisible={visible} />
          ))}
        </div>
      </Section>
    </div>
  );
}

type FAQ = (typeof FAQS)[number];

function FAQItem({ faq, isOpen, onToggle, delay, parentVisible }: { faq: FAQ; isOpen: boolean; onToggle: () => void; delay: number; parentVisible: boolean }) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: "20px 22px",
        background: isOpen ? C.primaryLight : C.ground,
        border: `1px solid ${isOpen ? C.primaryBorder : C.ink100}`,
        borderRadius: 12,
        cursor: "pointer",
        transition: "all 0.2s ease",
        opacity: parentVisible ? 1 : 0,
        transitionDelay: `${delay + 0.1}s`,
        transitionDuration: "0.5s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, justifyContent: "space-between" }}>
        <p style={{ fontSize: 14.5, fontWeight: 700, color: isOpen ? C.primary : C.ink900, margin: 0, fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.45, flex: 1 }}>
          {faq.q}
        </p>
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: isOpen ? C.primary : C.surface, border: `1px solid ${isOpen ? C.primary : C.ink100}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s ease",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d={isOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} stroke={isOpen ? "#fff" : C.ink400} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
      {isOpen && (
        <p style={{ fontSize: 13.5, color: C.ink400, lineHeight: 1.7, margin: "14px 0 0", fontFamily: "IBM Plex Sans, sans-serif" }}>
          {faq.a}
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FINAL CTA
// ══════════════════════════════════════════════════════════════════════════════
function CtaSection() {
  const [ref, visible] = useReveal(0.2);
  return (
    <Section>
      <div
        ref={ref}
        style={{
          background: `linear-gradient(135deg, ${C.primaryLight} 0%, ${C.violetLight} 50%, ${C.emeraldBg} 100%)`,
          border: `1px solid ${C.primaryBorder}`,
          borderRadius: 20,
          padding: "72px 64px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "scale(0.98) translateY(24px)",
          transition: "all 0.65s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Decorative grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: `linear-gradient(${C.primaryBorder} 1px, transparent 1px), linear-gradient(90deg, ${C.primaryBorder} 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          opacity: 0.35,
        }} />
        {/* Glow orbs */}
        <div style={{ position: "absolute", top: "-30%", left: "20%", width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, ${C.primaryGlow} 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-20%", right: "15%", width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.7)", border: `1px solid ${C.primaryBorder}`, borderRadius: 999, padding: "5px 14px", marginBottom: 24, backdropFilter: "blur(8px)" }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: C.emerald, boxShadow: `0 0 5px ${C.emerald}`, display: "inline-block", animation: "livePulse 1.4s ease infinite" }} />
            <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: C.primary, letterSpacing: "0.08em" }}>NOW IN PRIVATE BETA</span>
          </div>

          <h2 style={{ fontSize: 48, fontWeight: 800, color: C.ink900, margin: "0 0 18px", fontFamily: "IBM Plex Mono, monospace", lineHeight: 1.1, letterSpacing: "-0.03em" }}>
            Your first synthetic dataset,<br />
            <span style={{ background: `linear-gradient(90deg, ${C.primary}, ${C.violet})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              in under 60 seconds.
            </span>
          </h2>
          <p style={{ fontSize: 17, color: C.ink400, lineHeight: 1.65, margin: "0 auto 40px", maxWidth: 520, fontFamily: "IBM Plex Sans, sans-serif" }}>
            No infrastructure to set up. No compliance team required. Upload a file, attach a policy, and receive production-ready data.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
            <button style={{
              height: 50, padding: "0 32px", borderRadius: 12,
              border: "none", background: C.primary, color: "#fff",
              fontSize: 15, fontWeight: 700, fontFamily: "IBM Plex Sans, sans-serif",
              cursor: "pointer", boxShadow: `0 0 28px ${C.primaryGlow}`,
              display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = C.primaryHover; e.currentTarget.style.boxShadow = `0 0 40px rgba(103,106,241,0.35)`; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.primary; e.currentTarget.style.boxShadow = `0 0 28px ${C.primaryGlow}`; }}>
              Start for free
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6l6 6-6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <a href="#" style={{
              height: 50, padding: "0 26px", borderRadius: 12,
              border: `1px solid ${C.ink100}`, background: "rgba(255,255,255,0.7)",
              color: C.ink600, fontSize: 15, fontWeight: 600,
              fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
              textDecoration: "none", backdropFilter: "blur(8px)", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.primaryBorder; e.currentTarget.style.color = C.primary; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.ink100; e.currentTarget.style.color = C.ink600; }}>
              View Docs
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FOOTER
// ══════════════════════════════════════════════════════════════════════════════

function Footer() {
  return (
    <footer style={{ background: C.surface, borderTop: `1px solid ${C.ink100}`, padding: "56px 56px 36px", fontFamily: "IBM Plex Sans, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>

        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 48, paddingBottom: 48, borderBottom: `1px solid ${C.ink100}` }}>

          {/* Brand */}
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Image
                src="/uris-logo.svg"
                alt="URIS logo"
                width={30}
                height={30}
                style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0 }}
              />
              <span style={{ fontSize: 14, fontWeight: 800, color: C.ink900, letterSpacing: "-0.03em", fontFamily: "IBM Plex Mono, monospace" }}>URIS</span>
            </div>
            <p style={{ fontSize: 13.5, color: C.ink400, lineHeight: 1.7, margin: "0 0 20px" }}>
              Compliance-native synthetic data for teams that ship.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["GDPR", "CCPA", "HIPAA"].map(b => (
                <span key={b} style={{
                  fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700,
                  color: C.primary, background: C.primaryLight,
                  border: `1px solid ${C.primaryBorder}`,
                  borderRadius: 4, padding: "2px 8px", letterSpacing: "0.06em",
                }}>{b}</span>
              ))}
            </div>
          </div>

          {/* Social icons */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 4 }}>
            {[
              { label: "GitHub", path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" },
              { label: "X", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
              { label: "LinkedIn", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
            ].map(({ label, path }) => (
              <a key={label} href="#" aria-label={label} style={{
                width: 34, height: 34, borderRadius: 8,
                border: `1px solid ${C.ink100}`, background: C.ground,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.ink400, transition: "all 0.14s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.primaryBorder; e.currentTarget.style.color = C.primary; e.currentTarget.style.background = C.primaryLight; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.ink100; e.currentTarget.style.color = C.ink400; e.currentTarget.style.background = C.ground; }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d={path}/></svg>
              </a>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: C.ink200, margin: 0 }}>
            © 2026 URIS Technologies Inc. All rights reserved.
          </p>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            {["Privacy policy", "Terms of service", "DPA"].map(l => (
              <a key={l} href="#" style={{
                fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: C.ink200,
                textDecoration: "none", transition: "color 0.14s",
              }}
                onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => e.currentTarget.style.color = C.primary}
                onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) => e.currentTarget.style.color = C.ink200}>
                {l}
              </a>
            ))}
          </div>
        </div>

      </div>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT — paste after HeroPage's TrustStrip in the real file
// Or use as a standalone <LandingPageSections /> component
// ══════════════════════════════════════════════════════════════════════════════
export default function LandingPageSections() {
  return (
    <>
      <HowItWorksSection />
      <FeaturesSection />
      <ComplianceSection />
      <FAQSection />
      <CtaSection />
      <Footer />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes livePulse { 0%,100%{opacity:0.55;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
      `}</style>
    </>
  );
}