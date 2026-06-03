import React, { useState, useMemo, useEffect } from "react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

// ═══════════════════════════════════════════════════════════════════════
//  LATERNA — ELECTRON BEAM LAB
//  One apparatus, three sub-labs:
//    1. Magnetic deflection  (charge-to-mass ratio e/m)        ← this pass
//    2. Electric deflection  (sign of the electron's charge)   ← pass 2
//    3. Crossed fields       (velocity selector, Thomson)      ← pass 3
//
//  Apparatus geometry and every operating number are derived from first
//  principles and verified in em_verify_final.py. See em_apparatus_design.md.
// ═══════════════════════════════════════════════════════════════════════

// ── Fundamental constants (CODATA) ──────────────────────────────────────
const E_CHARGE = 1.602176634e-19;     // C
const M_ELECTRON = 9.1093837015e-31;  // kg
const C_LIGHT = 299792458.0;          // m/s
const MU_0 = 1.25663706212e-6;        // N/A²
const EM_RATIO_TRUE = E_CHARGE / M_ELECTRON;     // 1.7588e11 C/kg
const MC2_EV = M_ELECTRON * C_LIGHT * C_LIGHT / E_CHARGE;  // 510999 eV

// ── Apparatus (locked, verified design) ─────────────────────────────────
const R_COIL = 0.22;                   // m, Helmholtz coil radius
const N_TURNS = 170;                   // turns per coil
//  k = (4/5)^1.5 · μ₀ N / R = 0.6948 mT/A   (verified vs elliptic-integral field)
const R_BULB_CM = 13.0;                // 26 cm diameter sphere
//  Center-mounted gun: orbit far edge reaches 2r from center ⇒ fits to r ≈ 6.5 cm
const B_EARTH = 0.5e-4;                // T, Earth's field magnitude (0.5 G)

// Operating ranges
const V_MIN = 0, V_MAX = 1000;         // accelerating voltage; relativistic <0.1% here
const I_MIN = 0, I_MAX = 5.0;          // coil current

// Precision guidance (field uniformity, from verification):
//   ≤0.5% bias to r≈5.9 cm, ≤1% to r≈7.0 cm, ≤2% to r≈8.2 cm
const R_PRECISE_CM = 5.9;              // keep precision measurements within this

// Earth-field "weak field" caution: bias exceeds ~5% below this current
const I_EARTH_WARN = 3.0;

// ── Gas properties ──────────────────────────────────────────────────────
//   Neon : visible glow from 2p⁵3p states (585–703 nm), threshold ~18 eV
//   Helium (pass-later): n=3 triplets (~23 eV), blue-green
const GASES = {
  neon: {
    name: "Neon",
    vThreshold: 18,     // V, visible-beam floor
    vFull: 55,          // V, full brightness
    // beam palette (orange-red)
    glow: "#ff5530", mid: "#ff7a48", core: "#ffd0a8", hud: "#ffc090",
    label: "orange-red",
  },
  helium: {
    name: "Helium",
    vThreshold: 23,
    vFull: 70,
    glow: "#3affa0", mid: "#6effc0", core: "#d0ffe0", hud: "#a8ffd0",
    label: "blue-green",
  },
};

// ── Heater (cathode warm-up) ────────────────────────────────────────────
const HEATER_V_MIN = 5.0;              // V, bottom of indirect-heater window
const HEATER_V_MAX = 7.5;              // V, Leybold recommended operating value (ramp target)
const HEATER_TAU_MS = 1200;            // thermal time constant (≈4 s warm-up)
const HEATER_READY = 0.95;             // heaterPower fraction ⇒ "warm"

// ── Deflection plates (sub-labs 2 & 3) ──────────────────────────────────
const PLATE_L_CM = 4.0;                // plate length along the beam
const PLATE_D_CM = 2.0;                // plate separation (gap)
const VD_MIN = 0, VD_MAX = 150;        // deflection voltage range

// Crossed-fields (sub-lab 3): the velocity selector only lands a visible balance
// voltage when the coil current is LOW (high current → balance below the neon
// glow threshold; very low current → balance above 1 kV). Verified usable band:
const XF_I_MIN = 0.3, XF_I_MAX = 1.6;  // A — recommended selector current window

// Charge-bend convention. The plates are horizontal (top/bottom) because the
// beam is horizontal. This is the rotated form of "left −, right +":
//   left → top, right → bottom  ⇒  TOP plate negative, BOTTOM plate positive.
// The electron (negative) is pulled toward the + plate, so it bends DOWN.
// Flip this one flag to make the beam bend up (top +, bottom −) instead.
const BOTTOM_PLATE_POSITIVE = true;    // true ⇒ + on bottom ⇒ beam bends down

// ── Defaults ────────────────────────────────────────────────────────────
const V_DEFAULT = 0;
const I_DEFAULT = 0;

// ═══════════════════════════════════════════════════════════════════════
//  PHYSICS HELPERS
// ═══════════════════════════════════════════════════════════════════════
function bCenter(I) {
  // Helmholtz central field, exact textbook form (matches elliptic model to <0.1%)
  return Math.pow(4 / 5, 1.5) * MU_0 * N_TURNS * I / R_COIL;
}
function vClassical(V) {
  return Math.sqrt(2 * E_CHARGE * V / M_ELECTRON);
}
function rTheory(V, I, B_extra = 0) {
  const B = bCenter(I) + B_extra;
  if (B <= 0 || V <= 0) return Infinity;
  return M_ELECTRON * vClassical(V) / (E_CHARGE * B);
}

// ── Systematic-bias model (sub-lab 1) ───────────────────────────────────
//  Each effect multiplies the APPARENT e/m by an independent factor. They
//  compose multiplicatively (verified). All return (apparent e/m)/(true).
//
//  earthBias: worst case, ambient field opposes coil field → measured r is
//             smaller → e/m reads high. factor = (B/(B−B⊕))² = (1/(1−B⊕/B))².
function earthBiasFactor(I) {
  const B = bCenter(I);
  if (B <= 0) return Infinity;
  const f = B_EARTH / B;
  if (f >= 1) return Infinity;
  return Math.pow(1 / (1 - f), 2);
}
//  nonUniformBias: orbit of radius r samples B(r) < B₀; using B₀ biases high.
//  Approximated from the verified mid-plane fall-off of a Helmholtz pair at
//  R=22cm. Polynomial fit to B(r)/B₀ over r∈[0,12]cm (max resid <2e-4).
function fieldRatioAtR(r_cm) {
  // B(r)/B₀ on the mid-plane of the Helmholtz pair (R=22cm, N=170).
  // 3-term even-power fit to the exact elliptic-integral field; the x² term
  // vanishes by Helmholtz design. Matches exact bias to <0.002 points over
  // the full r ∈ [0,12] cm range.
  const x = r_cm / 100 / R_COIL;        // normalized radius ρ/R
  return 1 - 0.42988 * Math.pow(x, 4) - 0.42762 * Math.pow(x, 6) + 0.04635 * Math.pow(x, 8);
}
function nonUniformBiasFactor(r_cm) {
  const ratio = fieldRatioAtR(r_cm);
  if (ratio <= 0) return Infinity;
  return 1 / Math.pow(ratio, 2);
}
//  relBias: classical formula omits γ; apparent e/m reads LOW.
//  factor = 1/(1 + eV/2mc²).
function relBiasFactor(V) {
  return 1 / (1 + V / (2 * MC2_EV));
}

// ── Least-squares line (for the r² vs V/B² fit, sub-lab 1) ───────────────
function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let Sxx = 0, Sxy = 0;
  for (let i = 0; i < n; i++) {
    Sxx += Math.pow(xs[i] - xMean, 2);
    Sxy += (xs[i] - xMean) * (ys[i] - yMean);
  }
  if (Sxx === 0) return null;
  const slope = Sxy / Sxx;
  const intercept = yMean - slope * xMean;
  if (n < 3) return { slope, intercept, slopeSigma: NaN };
  let SSres = 0;
  for (let i = 0; i < n; i++) SSres += Math.pow(ys[i] - (slope * xs[i] + intercept), 2);
  const slopeSigma = Math.sqrt(SSres / (n - 2)) / Math.sqrt(Sxx);
  return { slope, intercept, slopeSigma };
}

// ── Crossed-fields helpers (sub-lab 3) ──────────────────────────────────
//  Velocity selector: the electric force eE balances the magnetic force evB
//  when v = E/B. The accelerated beam has v=√(2eV/m), so it passes straight
//  when the accelerating voltage equals:
//    V_balance = (m/2e)·(E/B)² = (m/2e)·(V_d /(d·B))²
function balanceVoltage(Vd, I) {
  const B = bCenter(I);
  if (B <= 0 || Vd <= 0) return Infinity;
  const E_field = Vd / (PLATE_D_CM / 100);
  const vBal = E_field / B;
  return M_ELECTRON / (2 * E_CHARGE) * vBal * vBal;
}

//  Full Lorentz trajectory through the crossed-field (plate) region, integrated
//  numerically — the path is neither a clean parabola nor a clean circle when
//  the fields are unbalanced. Screen coords (+x right, +y down), B out of page,
//  plates wired TOP +, BOTTOM − so the electric force opposes the magnetic one.
//  Returns { hit, frac, yExit_m, slope } in SI metres (yExit) and dimensionless slope.
function crossedTrajectory(V, Vd, I) {
  const B = bCenter(I);
  const E_field = Vd / (PLATE_D_CM / 100);   // V/m, top + → field points down (+y)
  const L = PLATE_L_CM / 100, halfGap = PLATE_D_CM / 200;
  const v0 = vClassical(V);
  if (v0 <= 0) return null;
  let x = 0, y = 0, vx = v0, vy = 0;
  const dt = Math.min(1e-13, L / v0 / 4000);
  let steps = 0;
  while (x < L && steps < 200000) {
    // a = (q/m)(E + v×B), q = −e.  E_y = +E_field (down); (v×B)=(vy B, −vx B,0)
    const ax = (-E_CHARGE * vy * B) / M_ELECTRON;
    const ay = (-E_CHARGE * E_field + E_CHARGE * vx * B) / M_ELECTRON;
    vx += ax * dt; vy += ay * dt;
    x += vx * dt; y += vy * dt;
    steps++;
    if (Math.abs(y) >= halfGap) return { hit: true, frac: x / L, yExit_m: y, slope: vy / vx };
  }
  return { hit: false, frac: 1, yExit_m: y, slope: vy / vx };
}

// ═══════════════════════════════════════════════════════════════════════
//  SHARED UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════
const ACCENT = "#E8650A";
const BORDER = "#E0E0E4";
const TEXT1 = "#2A2A2E";
const TEXT2 = "#6B6B70";
const FONT = "'Inter',sans-serif";
const MONO = "'JetBrains Mono',monospace";

function ParamSlider({ label, displayVal, value, min, max, step, onChange, unit, okRange, subLabel, disabled }) {
  const rw = { display: "flex", justifyContent: "space-between", fontSize: "11px", color: disabled ? "#b0b0b4" : TEXT2, fontFamily: FONT, fontWeight: 500 };
  const vl = { color: disabled ? "#b0b0b4" : TEXT1, fontFamily: MONO, fontSize: "11px", fontWeight: 600 };
  const sl = { width: "100%", marginTop: "4px", accentColor: ACCENT, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1 };
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={rw}>
        <span>{label}</span>
        <span style={vl}>{displayVal} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value))} style={sl} />
      {okRange && (() => {
        const [lo, hi] = okRange;
        const loPct = ((lo - min) / (max - min)) * 100;
        const hiPct = ((hi - min) / (max - min)) * 100;
        return (
          <div style={{ height: "4px", marginTop: "1px", background: "#e0e0e4", borderRadius: "2px", position: "relative", overflow: "hidden", opacity: disabled ? 0.35 : 1 }}>
            <div style={{ position: "absolute", left: `${loPct}%`, width: `${hiPct - loPct}%`, height: "100%", background: "#9bc99b" }} />
          </div>
        );
      })()}
      {subLabel && (
        <div style={{ fontSize: "10px", color: disabled ? "#c0c0c4" : TEXT2, marginTop: "3px", fontStyle: "italic", fontFamily: FONT }}>
          {subLabel}
        </div>
      )}
    </div>
  );
}

function MathText({ children }) {
  if (!children) return null;
  // Render a plain (non-math) text run, parsing **bold** and *italic*.
  const renderProse = (text, keyBase) => {
    // split on **bold** first, then *italic* within the non-bold pieces
    const boldSplit = text.split(/(\*\*[^*]+\*\*)/g);
    return boldSplit.map((bp, bi) => {
      if (bp.startsWith("**") && bp.endsWith("**")) {
        return <strong key={`${keyBase}-b${bi}`}>{bp.slice(2, -2)}</strong>;
      }
      const itSplit = bp.split(/(\*[^*]+\*)/g);
      return itSplit.map((ip, ii) => {
        if (ip.startsWith("*") && ip.endsWith("*") && ip.length > 2) {
          return <em key={`${keyBase}-i${bi}-${ii}`}>{ip.slice(1, -1)}</em>;
        }
        return <React.Fragment key={`${keyBase}-t${bi}-${ii}`}>{ip}</React.Fragment>;
      });
    });
  };
  const blockSplit = children.split(/(\$\$[^$]+\$\$)/g);
  return (
    <>
      {blockSplit.map((blockPart, bi) => {
        if (blockPart.startsWith("$$") && blockPart.endsWith("$$")) {
          return <BlockMath key={`b-${bi}`} math={blockPart.slice(2, -2)} />;
        }
        const inlineSplit = blockPart.split(/(\$[^$]+\$)/g);
        return inlineSplit.map((part, i) => {
          if (part.startsWith("$") && part.endsWith("$")) {
            return <InlineMath key={`b-${bi}-i-${i}`} math={part.slice(1, -1)} />;
          }
          return <React.Fragment key={`b-${bi}-t-${i}`}>{renderProse(part, `b-${bi}-t-${i}`)}</React.Fragment>;
        });
      })}
    </>
  );
}

function GuideModal({ steps, step, onStep, onClose, title }) {
  const s = steps[step];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#FFF", borderRadius: "10px", maxWidth: "560px", width: "90%", padding: "24px", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "10px", color: TEXT2, fontFamily: FONT, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {title ? title + " · " : ""}Step {step + 1} of {steps.length}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: TEXT2, fontSize: "20px", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: TEXT1, margin: "0 0 12px 0", fontFamily: FONT }}>{s.title}</h2>
        <div style={{ fontSize: "13px", color: TEXT1, lineHeight: "1.6", margin: "0 0 12px 0", fontFamily: FONT }}>
          <MathText>{s.desc}</MathText>
        </div>
        <div style={{ background: "#FFF3EB", borderLeft: `3px solid ${ACCENT}`, padding: "10px 12px", borderRadius: "4px", marginBottom: "16px" }}>
          <div style={{ fontSize: "10px", color: ACCENT, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Try it</div>
          <div style={{ fontSize: "12px", color: TEXT1, fontFamily: FONT, lineHeight: "1.55" }}>
            <MathText>{s.action}</MathText>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={onClose}
              style={{ padding: "8px 14px", border: "none", background: "none", color: TEXT2, cursor: "pointer", fontSize: "12px", fontFamily: FONT, fontWeight: 500 }}>
              Skip
            </button>
            <button onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0}
              style={{ padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: "6px", background: "#FFF", color: step === 0 ? "#CCC" : TEXT2, cursor: step === 0 ? "default" : "pointer", fontSize: "12px", fontFamily: FONT, fontWeight: 500 }}>
              ← Previous
            </button>
          </div>
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {steps.map((_, i) => (
              <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: i === step ? ACCENT : BORDER }} />
            ))}
          </div>
          {step < steps.length - 1 ? (
            <button onClick={() => onStep(step + 1)}
              style={{ padding: "8px 16px", border: `1px solid ${ACCENT}`, borderRadius: "6px", background: ACCENT, color: "#FFF", cursor: "pointer", fontSize: "12px", fontFamily: FONT, fontWeight: 600 }}>
              Next →
            </button>
          ) : (
            <button onClick={onClose}
              style={{ padding: "8px 16px", border: `1px solid ${ACCENT}`, borderRadius: "6px", background: ACCENT, color: "#FFF", cursor: "pointer", fontSize: "12px", fontFamily: FONT, fontWeight: 600 }}>
              Start experimenting
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  SYSTEMATIC-EFFECTS TREE  (parent select-all + independent children)
// ═══════════════════════════════════════════════════════════════════════
function Checkbox({ state, onClick, label, sublabel, accent }) {
  // state: "on" | "off" | "indeterminate"
  const box = {
    width: "15px", height: "15px", borderRadius: "3px", flexShrink: 0,
    border: `1.5px solid ${state === "off" ? "#b8b8be" : (accent || ACCENT)}`,
    background: state === "off" ? "#FFF" : (accent || ACCENT),
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", transition: "all 0.12s", marginTop: "1px",
  };
  return (
    <div onClick={onClick} style={{ display: "flex", gap: "8px", cursor: "pointer", marginBottom: sublabel ? "2px" : "7px", alignItems: "flex-start" }}>
      <div style={box}>
        {state === "on" && <span style={{ color: "#FFF", fontSize: "11px", fontWeight: 700, lineHeight: 1 }}>✓</span>}
        {state === "indeterminate" && <span style={{ color: "#FFF", fontSize: "12px", fontWeight: 700, lineHeight: 1 }}>–</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "12px", color: TEXT1, fontFamily: FONT, fontWeight: 500, lineHeight: "1.3" }}>{label}</div>
        {sublabel && <div style={{ fontSize: "10px", color: TEXT2, fontFamily: FONT, fontStyle: "italic", lineHeight: "1.35", marginBottom: "7px" }}>{sublabel}</div>}
      </div>
    </div>
  );
}

function EffectsTree({ effects, setEffects }) {
  const allOn = effects.earth && effects.nonunif && effects.rel;
  const allOff = !effects.earth && !effects.nonunif && !effects.rel;
  const parentState = allOn ? "on" : allOff ? "off" : "indeterminate";
  const toggleAll = () => {
    const target = !allOn;   // if all on → clear; otherwise → set all
    setEffects({ earth: target, nonunif: target, rel: target });
  };
  const toggle = (key) => setEffects({ ...effects, [key]: !effects[key] });
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "12px", background: allOff ? "#FAFAFB" : "#FFF8F3" }}>
      <Checkbox state={parentState} onClick={toggleAll}
        label={<span style={{ fontWeight: 700 }}>Realistic effects</span>}
        sublabel={allOff ? "Off — ideal apparatus (e/m comes out exact)" : "Systematic biases active — see breakdown below"} />
      <div style={{ borderLeft: `1.5px solid ${BORDER}`, marginLeft: "7px", paddingLeft: "12px", marginTop: "2px" }}>
        <Checkbox state={effects.earth ? "on" : "off"} onClick={() => toggle("earth")}
          label="Earth's magnetic field"
          sublabel="±0.5 G ambient — dominant error at low coil current" />
        <Checkbox state={effects.nonunif ? "on" : "off"} onClick={() => toggle("nonunif")}
          label="Field non-uniformity"
          sublabel="Large orbits sample a weaker field — biases e/m high" />
        <Checkbox state={effects.rel ? "on" : "off"} onClick={() => toggle("rel")}
          label="Relativistic correction"
          sublabel="Classical formula reads low; only visible past ~1 kV" />
      </div>
    </div>
  );
}

// Live per-effect bias breakdown. Pass the active factors; renders the
// multiplicative decomposition and the net. Collapses to one line if single.
function BiasBreakdown({ rows, net }) {
  if (rows.length === 0) return null;
  const fmt = (pct) => (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
  return (
    <div style={{ marginTop: "8px", padding: "10px 12px", background: "#FFF", border: `1px solid ${BORDER}`, borderRadius: "8px" }}>
      <div style={{ fontSize: "10px", color: TEXT2, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
        Systematic bias vs. true e/m
      </div>
      {rows.length > 1 && rows.map((r) => (
        <div key={r.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: FONT, color: TEXT2, marginBottom: "3px" }}>
          <span>{r.label}</span>
          <span style={{ fontFamily: MONO, color: r.pct >= 0 ? "#b03a2a" : "#2a6ab0", fontWeight: 600 }}>{fmt(r.pct)}</span>
        </div>
      ))}
      {rows.length > 1 && <div style={{ height: "1px", background: BORDER, margin: "5px 0" }} />}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", fontFamily: FONT, color: TEXT1, fontWeight: 600 }}>
        <span>{rows.length > 1 ? "Net (measured)" : rows[0].label}</span>
        <span style={{ fontFamily: MONO, color: net >= 0 ? "#b03a2a" : "#2a6ab0" }}>{fmt(net)}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  TOP-LEVEL SHELL  — landing + sub-lab router
// ═══════════════════════════════════════════════════════════════════════
const SUBLABS = [
  { id: "magnetic", n: 1, title: "Magnetic Deflection", tag: "Measure Charge-to-Mass ratio",
    blurb: "Bend the beam into a circle with a uniform magnetic field — the radius of its orbit gives e/m.",
    concept: "$e/m = 2V / (B^2 r^2)$", ready: true },
  { id: "electric", n: 2, title: "Electric Deflection", tag: "Sign of the charge",
    blurb: "Deflect the beam with an electric field between two plates — the direction it bends reveals the sign of its charge.",
    concept: "$\\tan\\theta = V_d L / (2 d V)$", ready: true },
  { id: "crossed", n: 3, title: "Crossed Fields", tag: "A Single Velocity",
    blurb: "Balance the electric and magnetic forces until the beam runs straight — the selected speed recovers e/m a second way.",
    concept: "$v = E / B$", ready: true },
];

export default function ElectronBeamLab() {
  const [view, setView] = useState("home");   // "home" | "magnetic" | "electric" | "crossed"

  if (view === "home") return <Landing onPick={setView} />;
  if (view === "magnetic") return <MagneticSubLab onHome={() => setView("home")} />;
  if (view === "electric") return <ElectricSubLab onHome={() => setView("home")} />;
  if (view === "crossed") return <CrossedSubLab onHome={() => setView("home")} />;
  // (all three sub-labs now built)
  return <ComingSoon view={view} onHome={() => setView("home")} />;
}

function Landing({ onPick }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F4F6", fontFamily: FONT, padding: "0" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #1a1d28 0%, #2a1f18 100%)", color: "#FFF", padding: "48px 40px 40px 40px" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", color: ACCENT, fontWeight: 700, marginBottom: "10px" }}>
            Laterna Virtual Lab
          </div>
          <h1 style={{ fontSize: "34px", fontWeight: 800, margin: "0 0 12px 0", letterSpacing: "-0.01em" }}>
            Electron Beam Lab
          </h1>
          <p style={{ fontSize: "15px", lineHeight: "1.6", color: "#c8c8d0", maxWidth: "640px", margin: 0 }}>
            A gas-filled glass bulb, set between a pair of Helmholtz coils and fitted with parallel deflecting plates.
            One apparatus, three experiments that first characterized the electron.
            A magnetic field bends the beam into a circular orbit, yielding its charge-to-mass ratio e/m;
            an electric field deflects it toward the positive plate, fixing the sign of its charge;
            and the two fields crossed select a single velocity — Thomson's method — to recover e/m a second way.
          </p>
          <div style={{ display: "flex", gap: "20px", marginTop: "22px", flexWrap: "wrap" }}>
            {[["Bulb", "26 cm Ø"], ["Gas", "Neon, Helium"], ["Coils", "R = 22 cm, N = 170"], ["Voltage", "0–1000 V"], ["Magnetic Field", "0–35 G"]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: "10px", color: "#8a8a96", textTransform: "uppercase", letterSpacing: "0.08em" }}>{k}</div>
                <div style={{ fontSize: "13px", color: "#e8e8ee", fontFamily: MONO, marginTop: "2px" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-lab cards */}
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "36px 40px 60px 40px" }}>
        <div style={{ fontSize: "12px", color: TEXT2, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "18px" }}>
          Choose an experiment
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
          {SUBLABS.map((sl) => (
            <div key={sl.id}
              onClick={() => sl.ready && onPick(sl.id)}
              style={{
                background: "#FFF", borderRadius: "12px", padding: "22px",
                border: `1px solid ${BORDER}`, position: "relative",
                cursor: sl.ready ? "pointer" : "default",
                opacity: sl.ready ? 1 : 0.62,
                transition: "transform 0.12s, box-shadow 0.12s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
              onMouseEnter={e => { if (sl.ready) { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(232,101,10,0.13)"; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: sl.ready ? "#FFF3EB" : "#F0F0F2", color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "15px", fontFamily: MONO }}>
                  {sl.n}
                </div>
                {!sl.ready && (
                  <span style={{ fontSize: "9.5px", color: TEXT2, background: "#F0F0F2", padding: "3px 8px", borderRadius: "10px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                    Coming soon
                  </span>
                )}
              </div>
              <div style={{ fontSize: "10px", color: ACCENT, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "4px" }}>
                {sl.tag}
              </div>
              <h3 style={{ fontSize: "17px", fontWeight: 700, color: TEXT1, margin: "0 0 8px 0" }}>{sl.title}</h3>
              <p style={{ fontSize: "12.5px", color: TEXT2, lineHeight: "1.55", margin: "0 0 14px 0" }}>{sl.blurb}</p>
              <div style={{ fontSize: "13px", color: TEXT1 }}><MathText>{sl.concept}</MathText></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "32px", fontSize: "11px", color: TEXT2, lineHeight: "1.6", textAlign: "center", fontStyle: "italic" }}>
          All three experiments use the same apparatus — only the fields you switch on change.
        </div>
      </div>
    </div>
  );
}

function ComingSoon({ view, onHome }) {
  const sl = SUBLABS.find(s => s.id === view);
  return (
    <div style={{ minHeight: "100vh", background: "#F4F4F6", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: "420px", padding: "40px" }}>
        <div style={{ fontSize: "10px", color: ACCENT, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Sub-lab {sl.n}</div>
        <h2 style={{ fontSize: "24px", fontWeight: 800, color: TEXT1, margin: "8px 0 12px 0" }}>{sl.title}</h2>
        <p style={{ fontSize: "14px", color: TEXT2, lineHeight: "1.6", marginBottom: "24px" }}>{sl.blurb}</p>
        <div style={{ fontSize: "12px", color: TEXT2, fontStyle: "italic", marginBottom: "28px" }}>This experiment is coming in the next build pass.</div>
        <button onClick={onHome} style={{ padding: "10px 22px", border: `1px solid ${ACCENT}`, borderRadius: "8px", background: ACCENT, color: "#FFF", cursor: "pointer", fontSize: "13px", fontFamily: FONT, fontWeight: 600 }}>
          ← Back to lab
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  SUB-LAB 1 — MAGNETIC DEFLECTION (e/m)
// ═══════════════════════════════════════════════════════════════════════
function MagneticSubLab({ onHome }) {
  const [gas, setGas] = useState("neon");
  const [V, setV] = useState(V_DEFAULT);
  const [I, setI] = useState(I_DEFAULT);
  const [heaterOn, setHeaterOn] = useState(false);
  const [heaterPower, setHeaterPower] = useState(0);
  const [effects, setEffects] = useState({ earth: false, nonunif: false, rel: false });
  const [dataPoints, setDataPoints] = useState([]);
  const [showFit, setShowFit] = useState(false);
  const [fitPerformed, setFitPerformed] = useState(false);  // latches once a fit is run; gates the single-shot reveal
  const [showGuide, setShowGuide] = useState(true);  // auto-open on load (Skip dismisses) — matches Gyromotion & DC Discharge
  const [guideStep, setGuideStep] = useState(0);

  const G = GASES[gas];

  // Heater warm-up ramp
  useEffect(() => {
    if (!heaterOn) { setHeaterPower(0); return; }
    const start = Date.now();
    const iv = setInterval(() => {
      const p = 1 - Math.exp(-(Date.now() - start) / HEATER_TAU_MS);
      if (p >= 0.995) { setHeaterPower(1); clearInterval(iv); }
      else setHeaterPower(p);
    }, 50);
    return () => clearInterval(iv);
  }, [heaterOn]);

  const heaterReady = heaterPower >= HEATER_READY;
  const beamFormed = heaterReady && V >= G.vThreshold;
  const beamOpacity = beamFormed ? Math.min(1, (V - G.vThreshold) / (G.vFull - G.vThreshold)) : 0;

  // ── True orbit radius (ideal physics) ──
  const B0 = bCenter(I);
  const r_ideal_m = rTheory(V, I);
  const r_ideal_cm = r_ideal_m * 100;

  // ── Apply active systematic effects to get the OBSERVED radius ──
  // Each bias multiplies apparent e/m; since e/m ∝ 1/r², the observed radius
  // scales by 1/sqrt(biasFactor). We render the observed beam.
  const biasRows = [];
  let netFactor = 1;
  if (effects.earth) {
    const f = earthBiasFactor(I);
    if (isFinite(f)) { biasRows.push({ key: "earth", label: "Earth field", pct: (f - 1) * 100 }); netFactor *= f; }
  }
  if (effects.nonunif) {
    const f = nonUniformBiasFactor(r_ideal_cm);
    if (isFinite(f)) { biasRows.push({ key: "nonunif", label: "Field non-unif.", pct: (f - 1) * 100 }); netFactor *= f; }
  }
  if (effects.rel) {
    const f = relBiasFactor(V);
    biasRows.push({ key: "rel", label: "Relativistic", pct: (f - 1) * 100 }); netFactor *= f;
  }
  const netPct = (netFactor - 1) * 100;
  // observed radius = ideal / sqrt(netFactor)   (apparent e/m higher ⇒ smaller r)
  const r_obs_cm = isFinite(netFactor) && netFactor > 0 ? r_ideal_cm / Math.sqrt(netFactor) : r_ideal_cm;

  // With a center-mounted gun the orbit's far edge sits 2r from the bulb
  // center, so it fits inside the glass when 2r ≤ R_bulb, i.e. r ≤ R_bulb/2.
  const orbitFits = beamFormed && I > 0 && r_obs_cm <= R_BULB_CM / 2;
  const beamMeasurable = orbitFits && r_obs_cm >= 0.5;

  // Single-shot e/m from the OBSERVED radius using the nominal B₀ (what a
  // student computes). With effects off this returns exactly EM_RATIO_TRUE.
  const emObserved = (beamMeasurable)
    ? 2 * V / (Math.pow(B0, 2) * Math.pow(r_obs_cm / 100, 2))
    : null;
  const emErrorPct = emObserved != null ? (emObserved / EM_RATIO_TRUE - 1) * 100 : null;

  const v_e = vClassical(V);

  // Data recording for the r² vs V/B² fit
  function recordPoint() {
    if (!beamMeasurable) return;
    const x = V / Math.pow(B0, 2);
    const y = Math.pow(r_obs_cm / 100, 2);
    setDataPoints([...dataPoints, { x, y, V, I, r_cm: r_obs_cm }]);
    setShowFit(false);   // new data invalidates the shown fit — student re-fits
  }
  function clearData() { setDataPoints([]); setShowFit(false); setFitPerformed(false); }

  // The fit is computed only when the student presses "Fit" (showFit = true).
  const fit = useMemo(() => {
    if (!showFit || dataPoints.length < 2) return null;
    const f = linearFit(dataPoints.map(p => p.x), dataPoints.map(p => p.y));
    if (!f) return null;
    // slope = 2/(e/m) ⇒ e/m = 2/slope
    const emFit = 2 / f.slope;
    const emFitSigma = isNaN(f.slopeSigma) ? NaN : 2 * f.slopeSigma / Math.pow(f.slope, 2);
    return { ...f, emFit, emFitSigma };
  }, [dataPoints, showFit]);

  // styles
  const sectionHeader = { fontSize: "10px", fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", margin: "14px 0 7px 0" };
  const readoutBox = { background: "#F5F5F7", borderRadius: "6px", padding: "8px 10px", marginBottom: "7px" };
  const readoutLabel = { fontSize: "10px", color: TEXT2, fontFamily: FONT, marginBottom: "2px" };
  const readoutValue = { fontSize: "13px", color: TEXT1, fontFamily: MONO, fontWeight: 600 };
  const bb = { padding: "7px 12px", border: `1px solid ${BORDER}`, borderRadius: "6px", background: "#FFF", color: TEXT2, fontSize: "12px", fontFamily: FONT, fontWeight: 500, cursor: "pointer" };
  const ba = { padding: "7px 12px", border: `1px solid ${ACCENT}`, borderRadius: "6px", background: ACCENT, color: "#FFF", fontSize: "12px", fontFamily: FONT, fontWeight: 600, cursor: "pointer" };

  return (
    <div style={{ height: "100vh", background: "#F4F4F6", fontFamily: FONT, display: "flex", overflow: "hidden" }}>
      {showGuide && <GuideModal steps={MAGNETIC_GUIDE} step={guideStep} onStep={setGuideStep} onClose={() => setShowGuide(false)} title="Magnetic Deflection" />}

      {/* ── Viewport + plot column ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        {/* Breadcrumb header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 20px", borderBottom: `1px solid ${BORDER}`, background: "#FFF" }}>
          <button onClick={onHome} style={{ ...bb, padding: "5px 12px" }}>← Lab</button>
          <div style={{ fontSize: "10px", color: TEXT2 }}>Electron Beam Lab</div>
          <div style={{ fontSize: "10px", color: "#c0c0c4" }}>/</div>
          <div style={{ fontSize: "12px", color: TEXT1, fontWeight: 600 }}>1 · Magnetic Deflection</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setGuideStep(0); setShowGuide(true); }} style={{ ...bb, padding: "5px 12px" }}>Guide</button>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", minHeight: 0 }}>
          <MagneticViewport
            gas={G} V={V} I={I} B0={B0}
            r_obs_cm={r_obs_cm} r_ideal_cm={r_ideal_cm}
            beamFormed={beamFormed} beamOpacity={beamOpacity} orbitFits={orbitFits}
            heaterOn={heaterOn} heaterPower={heaterPower} heaterReady={heaterReady}
            effects={effects} netPct={netPct}
          />
        </div>

        <div style={{ height: "240px", background: "#FFF", borderTop: `1px solid ${BORDER}`, display: "flex" }}>
          <FitPlot dataPoints={dataPoints}
            previewPoint={beamMeasurable ? { x: V / Math.pow(B0, 2), y: Math.pow(r_obs_cm / 100, 2) } : null}
            fit={fit} />
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div style={{ width: "300px", background: "#FFF", borderLeft: `1px solid ${BORDER}`, padding: "18px", overflowY: "auto", flexShrink: 0 }}>
        <h1 style={{ fontSize: "15px", fontWeight: 700, color: ACCENT, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>Magnetic Deflection</h1>
        <h2 style={{ fontSize: "10px", fontWeight: 500, color: TEXT2, margin: "2px 0 0 0" }}>Charge-to-mass ratio · J.J. Thomson</h2>

        <div style={{ height: "1px", background: BORDER, margin: "12px 0 4px 0" }} />

        {/* Gas selector */}
        <div style={sectionHeader}>Fill Gas</div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
          {Object.keys(GASES).map(key => (
            <button key={key} onClick={() => setGas(key)}
              style={{
                flex: 1, padding: "7px 4px",
                border: `1px solid ${gas === key ? ACCENT : BORDER}`, borderRadius: "6px",
                background: gas === key ? "#FFF3EB" : "#FFF", color: gas === key ? ACCENT : TEXT2,
                fontSize: "11px", fontFamily: FONT, fontWeight: gas === key ? 600 : 500, cursor: "pointer",
              }}>
              {GASES[key].name}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "10px", color: TEXT2, fontStyle: "italic", marginBottom: "4px", lineHeight: "1.4" }}>
          {G.name}: {G.label} beam, glows from ~{G.vThreshold} V
        </div>

        {/* Heater */}
        <div style={sectionHeader}>Electron Source</div>
        {(() => {
          const warming = heaterOn && !heaterReady;
          const ready = heaterOn && heaterReady;
          const bg = ready ? "#e8f5e9" : warming ? "#fff4e0" : "#fcebe7";
          const border = ready ? "#2a8c3a" : warming ? "#c8881a" : "#d33a2a";
          const fg = ready ? "#1a5a25" : warming ? "#7a5210" : "#a02818";
          const dot = ready ? "#2a8c3a" : warming ? "#e0a830" : "#d33a2a";
          const label = ready ? "ON" : warming ? `warming… ${Math.round(heaterPower * 100)}%` : "OFF";
          const heaterV = heaterPower * HEATER_V_MAX;
          return (
            <button onClick={() => setHeaterOn(!heaterOn)}
              style={{ ...bb, width: "100%", padding: "8px 12px", marginBottom: "2px", background: bg, borderColor: border, color: fg, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><span style={{ color: dot, marginRight: "6px", fontSize: "13px" }}>●</span>Cathode heater: {label}</span>
              {heaterOn && <span style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 600 }}>{heaterV.toFixed(1)} V</span>}
            </button>
          );
        })()}
        <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "6px", fontStyle: "italic" }}>
          Heater ramps 0 → {HEATER_V_MAX.toFixed(1)} V over warm-up (operating value; 5–7.5 V window)
        </div>

        <ParamSlider label="Accelerating Voltage" displayVal={V.toFixed(0)}
          value={V} min={V_MIN} max={V_MAX} step={1} onChange={setV} unit="V"
          subLabel={`0–1000 V · ${G.name} glows above ~${G.vThreshold} V`} />

        <div style={readoutBox}>
          <div style={readoutLabel}>Beam speed v</div>
          <div style={readoutValue}>
            {!heaterOn ? "heater off" : !heaterReady ? "cathode warming…" : V === 0 ? "—" : `${(v_e / 1e6).toFixed(2)} × 10⁶ m/s`}
          </div>
        </div>

        {/* Coils */}
        <div style={sectionHeader}>Helmholtz Coils</div>
        <ParamSlider label="Coil Current" displayVal={I.toFixed(2)}
          value={I} min={I_MIN} max={I_MAX} step={0.01} onChange={setI} unit="A"
          subLabel={effects.earth && I > 0 && I < I_EARTH_WARN ? "⚠ weak field — Earth bias is large here" : `0–${I_MAX.toFixed(1)} A · B = ${(B0 * 1e4).toFixed(1)} G`} />
        <div style={readoutBox}>
          <div style={readoutLabel}>Central field B₀</div>
          <div style={readoutValue}>{(B0 * 1e4).toFixed(2)} G</div>
        </div>

        {/* Beam radius */}
        <div style={sectionHeader}>Beam Orbit</div>
        <div style={{ ...readoutBox, background: beamMeasurable || !beamFormed || I === 0 ? "#F5F5F7" : "#FFEBEB" }}>
          <div style={readoutLabel}>Orbit radius r</div>
          <div style={readoutValue}>
            {!heaterOn ? "heater off" :
             !heaterReady ? "cathode warming…" :
             V === 0 ? "source off" :
             !beamFormed ? "V too low — beam dark" :
             I === 0 ? "no field — straight beam" :
             !orbitFits ? "beam hits bulb wall" :
             r_obs_cm < 0.5 ? "orbit too tight" :
             `${r_obs_cm.toFixed(2)} cm`}
          </div>
          {orbitFits && r_obs_cm > R_PRECISE_CM && (
            <div style={{ fontSize: "10px", color: "#a85a18", marginTop: "3px", lineHeight: "1.35", fontStyle: "italic" }}>
              Large orbit — field non-uniformity grows beyond r ≈ {R_PRECISE_CM} cm.
            </div>
          )}
        </div>
        <div style={readoutBox}>
          <div style={readoutLabel}>Single-shot <InlineMath math="e/m = 2V/(B^2 r^2)" /></div>
          {fitPerformed ? (
            <>
              <div style={{ ...readoutValue, color: emErrorPct !== null && Math.abs(emErrorPct) < 1 ? "#2A8C3A" : TEXT1 }}>
                {emObserved != null ? `${(emObserved / 1e11).toFixed(3)} × 10¹¹ C/kg` : "—"}
              </div>
              {emErrorPct !== null && (
                <div style={{ fontSize: "10px", color: TEXT2, marginTop: "2px", fontFamily: MONO }}>
                  {emErrorPct >= 0 ? "+" : ""}{emErrorPct.toFixed(2)}% from accepted
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: "11px", color: "#a0a0a6", fontStyle: "italic", fontFamily: FONT, lineHeight: "1.4" }}>
              Hidden until you fit your data — measure <InlineMath math="e/m" /> from the slope first, then this reveals the single-shot value for comparison.
            </div>
          )}
        </div>

        {/* Systematic effects */}
        <div style={sectionHeader}>Realistic Effects</div>
        <EffectsTree effects={effects} setEffects={setEffects} />
        <BiasBreakdown rows={biasRows} net={netPct} />

        {/* Data */}
        <div style={sectionHeader}>Data</div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
          <button onClick={recordPoint} style={{ ...ba, flex: 1, opacity: beamMeasurable ? 1 : 0.4, cursor: beamMeasurable ? "pointer" : "not-allowed" }} disabled={!beamMeasurable}>Record point</button>
          <button onClick={clearData} style={bb}>Clear</button>
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
          <button onClick={() => { setShowFit(true); setFitPerformed(true); }}
            style={{ ...bb, flex: 1, borderColor: dataPoints.length >= 2 ? ACCENT : BORDER, color: dataPoints.length >= 2 ? ACCENT : "#c0c0c4", fontWeight: 600, opacity: dataPoints.length >= 2 ? 1 : 0.5, cursor: dataPoints.length >= 2 ? "pointer" : "not-allowed" }}
            disabled={dataPoints.length < 2}>
            Fit line
          </button>
          <div style={{ fontSize: "10px", color: TEXT2, fontFamily: MONO, flex: 1, textAlign: "right" }}>
            {dataPoints.length} point{dataPoints.length !== 1 ? "s" : ""}
          </div>
        </div>
        {dataPoints.length >= 2 && !showFit && (
          <div style={{ fontSize: "10px", color: TEXT2, fontStyle: "italic", marginBottom: "2px" }}>
            Press "Fit line" to fit your {dataPoints.length} points.
          </div>
        )}

        {fit && (
          <>
            <div style={sectionHeader}>Fitted e/m</div>
            <div style={readoutBox}>
              <div style={readoutLabel}>From slope of <InlineMath math="r^2" /> vs <InlineMath math="V/B^2" /></div>
              <div style={readoutValue}>
                {(fit.emFit / 1e11).toFixed(3)}{!isNaN(fit.emFitSigma) && ` ± ${(fit.emFitSigma / 1e11).toFixed(3)}`} × 10¹¹ C/kg
              </div>
              <div style={{ fontSize: "10px", color: TEXT2, marginTop: "2px", fontFamily: MONO }}>
                {((fit.emFit - EM_RATIO_TRUE) / EM_RATIO_TRUE * 100).toFixed(2)}% from accepted
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  MAGNETIC VIEWPORT — center gun firing right, full circular orbit, neon/He beam
// ═══════════════════════════════════════════════════════════════════════
function MagneticViewport({ gas, V, I, B0, r_obs_cm, r_ideal_cm, beamFormed, beamOpacity,
                            orbitFits, heaterOn, heaterPower, heaterReady, effects, netPct }) {
  const W = 760, H = 560;
  const bulb_cx = W / 2;
  const bulb_cy = H / 2 - 6;
  const cmToPx = 17;                  // 13 cm bulb radius → 221 px
  const bulb_r = R_BULB_CM * cmToPx;

  // Source stub enters from the LEFT wall to the emitter at the bulb center; the
  // emitter fires the beam to the RIGHT (+x). With B out of the page the magnetic
  // force on the electron points DOWN (+y in screen), so the orbit's center sits
  // directly BELOW the emitter and the beam curls down through the middle of the
  // bulb. (Horizontal-beam orientation, shared across all three sub-labs.)
  const emitter_x = bulb_cx;
  const emitter_y = bulb_cy;
  const stub_left_x = bulb_cx - bulb_r;   // left wall
  const stub_h = 10;

  const r_px = r_obs_cm * cmToPx;
  const orbit_cx = emitter_x;
  const orbit_cy = emitter_y + r_px;      // center below emitter → beam curls down

  // Coils flank the bulb left/right
  const coil_left_x = bulb_cx - bulb_r - 42;
  const coil_right_x = bulb_cx + bulb_r + 42;
  const coil_rx = 30;
  const coil_ry = bulb_r + 12;

  const filamentColor = (() => {
    const cold = [0x40, 0x38, 0x32], hot = [0xff, 0x8a, 0x3a], p = heaterPower;
    const rgb = cold.map((c, i) => Math.round(c + (hot[i] - c) * p));
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  })();

  const RINGS = [1, 2, 3, 4, 5, 6];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", maxHeight: "100%", background: "#0a0d16", borderRadius: "10px" }}>
      <defs>
        <radialGradient id="bulbGlass" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#1a2030" />
          <stop offset="70%" stopColor="#121622" />
          <stop offset="100%" stopColor="#0c0f18" />
        </radialGradient>
        <linearGradient id="copper2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a3818" />
          <stop offset="50%" stopColor="#c87038" />
          <stop offset="100%" stopColor="#7a3818" />
        </linearGradient>
        <clipPath id="bulbClip2"><circle cx={bulb_cx} cy={bulb_cy} r={bulb_r - 2} /></clipPath>
        <filter id="beamGlowA" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="beamGlowB" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id="filGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* Coils (dim — always powered in this sub-lab, brightness with I) */}
      <g opacity={0.85}>
        <ellipse cx={coil_left_x} cy={bulb_cy} rx={coil_rx} ry={coil_ry} fill="url(#copper2)" stroke="#5a2810" strokeWidth="1" />
        <ellipse cx={coil_left_x} cy={bulb_cy} rx={coil_rx - 11} ry={coil_ry - 11} fill="#0a0d16" stroke="#3a2010" strokeWidth="0.5" />
        <text x={coil_left_x} y={bulb_cy + coil_ry + 18} textAnchor="middle" fill="#999" fontFamily={FONT} fontSize="10">Coil 1 · <tspan fill="#d97a3a" fontFamily={MONO} fontWeight="bold">{I.toFixed(2)} A</tspan></text>

        <ellipse cx={coil_right_x} cy={bulb_cy} rx={coil_rx} ry={coil_ry} fill="url(#copper2)" stroke="#5a2810" strokeWidth="1" />
        <ellipse cx={coil_right_x} cy={bulb_cy} rx={coil_rx - 11} ry={coil_ry - 11} fill="#0a0d16" stroke="#3a2010" strokeWidth="0.5" />
        <text x={coil_right_x} y={bulb_cy + coil_ry + 18} textAnchor="middle" fill="#999" fontFamily={FONT} fontSize="10">Coil 2 · <tspan fill="#d97a3a" fontFamily={MONO} fontWeight="bold">{I.toFixed(2)} A</tspan></text>
      </g>

      {/* Bulb */}
      <circle cx={bulb_cx} cy={bulb_cy} r={bulb_r} fill="url(#bulbGlass)" stroke="#34405a" strokeWidth="2" />

      {/* Diameter measuring scale — runs DOWN from the emitter. The orbit passes
          through the emitter and its far edge lands at distance 2r straight below,
          so a scale ticked every 2 cm reads the radius where the beam's outer edge
          crosses it. */}
      <g clipPath="url(#bulbClip2)">
        <line x1={emitter_x} y1={emitter_y} x2={emitter_x} y2={emitter_y + 2 * 6.5 * cmToPx} stroke="#3a4658" strokeWidth="1" />
        {RINGS.map(r => {
          const ty = emitter_y + 2 * r * cmToPx;   // beam far edge lands here when orbit = r
          return (
            <g key={r}>
              <line x1={emitter_x - 4} y1={ty} x2={emitter_x + 4} y2={ty} stroke="#56667a" strokeWidth="1" />
              <text x={emitter_x + 9} y={ty + 3} textAnchor="start" fill="#7a8a9a" fontFamily={MONO} fontSize="10">{r}</text>
            </g>
          );
        })}
      </g>

      {/* Beam — full circle through the emitter, curling down through the bulb */}
      {beamFormed && I > 0 && orbitFits && (
        <g clipPath="url(#bulbClip2)" opacity={beamOpacity}>
          <circle cx={orbit_cx} cy={orbit_cy} r={r_px} fill="none" stroke={gas.glow} strokeWidth="10" opacity="0.32" filter="url(#beamGlowA)" />
          <circle cx={orbit_cx} cy={orbit_cy} r={r_px} fill="none" stroke={gas.mid} strokeWidth="4" opacity="0.7" filter="url(#beamGlowB)" />
          <circle cx={orbit_cx} cy={orbit_cy} r={r_px} fill="none" stroke={gas.core} strokeWidth="1.3" opacity="0.95" />
          {/* faint diameter guide: emitter → far edge makes "diameter = 2r" visible */}
          <line x1={emitter_x} y1={emitter_y} x2={emitter_x} y2={emitter_y + 2 * r_obs_cm * cmToPx} stroke={gas.core} strokeWidth="0.8" strokeDasharray="2,3" opacity="0.5" />
          {/* highlight where the beam's outer edge meets the scale (= diameter point) */}
          <circle cx={emitter_x} cy={emitter_y + 2 * r_obs_cm * cmToPx} r="3.2" fill={gas.core} stroke="#FFF" strokeWidth="0.6" />
        </g>
      )}
      {/* Straight beam when no field — fires right to the wall */}
      {beamFormed && I === 0 && (
        <g clipPath="url(#bulbClip2)" opacity={beamOpacity}>
          <line x1={emitter_x} y1={emitter_y} x2={bulb_cx + bulb_r} y2={emitter_y} stroke={gas.glow} strokeWidth="9" opacity="0.3" filter="url(#beamGlowA)" />
          <line x1={emitter_x} y1={emitter_y} x2={bulb_cx + bulb_r} y2={emitter_y} stroke={gas.mid} strokeWidth="3.5" opacity="0.7" filter="url(#beamGlowB)" />
          <line x1={emitter_x} y1={emitter_y} x2={bulb_cx + bulb_r} y2={emitter_y} stroke={gas.core} strokeWidth="1.2" opacity="0.95" />
        </g>
      )}

      {/* Electron source — stub from the LEFT wall + cathode inside a Wehnelt cup
          that opens to the RIGHT (the beam exit faces +x). The Wehnelt is held
          negative w.r.t. the cathode and focuses the beam through its aperture. */}
      <g clipPath="url(#bulbClip2)">
        {/* stub from the left wall to the back of the Wehnelt cup */}
        <rect x={stub_left_x} y={emitter_y - stub_h / 2} width={emitter_x - 20 - stub_left_x} height={stub_h} fill="#2a3548" stroke="#556680" strokeWidth="0.6" />
        <rect x={stub_left_x} y={emitter_y - stub_h / 2 + 1.5} width={emitter_x - 20 - stub_left_x} height="1.8" fill="#6a7488" opacity="0.55" />

        {/* Wehnelt cup opening to the RIGHT, aperture at right-center */}
        <path d={`M${emitter_x},${emitter_y - 19}
                  L${emitter_x - 20},${emitter_y - 19}
                  L${emitter_x - 20},${emitter_y + 19}
                  L${emitter_x},${emitter_y + 19}`}
          fill="#1a2030" stroke="#aeb8c8" strokeWidth="1.4" strokeLinejoin="round" />
        {/* right lips framing the exit aperture */}
        <line x1={emitter_x} y1={emitter_y - 19} x2={emitter_x} y2={emitter_y - 5} stroke="#aeb8c8" strokeWidth="1.4" strokeLinecap="round" />
        <line x1={emitter_x} y1={emitter_y + 5} x2={emitter_x} y2={emitter_y + 19} stroke="#aeb8c8" strokeWidth="1.4" strokeLinecap="round" />

        {/* filament (cathode) inside the cup — vertical sawtooth, centered with clearance */}
        {(() => {
          const fx = emitter_x - 13;     // sits well inside the deeper cup
          const amp = 5;                 // horizontal swing of the zigzag
          const wire = `M${fx},${emitter_y - 12} L${fx + amp},${emitter_y - 8} L${fx},${emitter_y - 4} L${fx + amp},${emitter_y} L${fx},${emitter_y + 4} L${fx + amp},${emitter_y + 8} L${fx},${emitter_y + 12}`;
          return (
            <g>
              {heaterPower > 0 && (
                <>
                  <ellipse cx={emitter_x - 10} cy={emitter_y} rx="11" ry="18" fill="#ff8030" opacity={0.16 * heaterPower} filter="url(#filGlow)" />
                  <path d={wire} fill="none" stroke="#ffb060" strokeWidth="2.6" strokeLinecap="round" opacity={0.55 * heaterPower} filter="url(#filGlow)" />
                </>
              )}
              <path d={wire} fill="none" stroke={filamentColor} strokeWidth="1.2" strokeLinecap="round" />
              {heaterPower > 0 && <path d={wire} fill="none" stroke="#ffe8b0" strokeWidth="0.5" strokeLinecap="round" opacity={0.9 * heaterPower} />}
            </g>
          );
        })()}

        {/* emission glow at the aperture when the beam is on */}
        {beamFormed && (
          <>
            <circle cx={emitter_x} cy={emitter_y} r="4.5" fill={gas.mid} opacity={0.5 * beamOpacity} filter="url(#beamGlowB)" />
            <circle cx={emitter_x} cy={emitter_y} r="2" fill={gas.core} opacity={0.9 * beamOpacity} />
          </>
        )}

        {/* label */}
        <text x={emitter_x - 10} y={emitter_y - 25} textAnchor="middle" fill="#8a94a4" fontFamily={FONT} fontSize="9" fontStyle="italic">Wehnelt</text>
      </g>

      {/* HUD — top-left, tucked into the corner above the left coil */}
      <g fontFamily={MONO} fontSize="11">
        <text x="14" y="22" fill="#bbb">V = {V.toFixed(0)} V</text>
        <text x="14" y="38" fill="#bbb">I = {I.toFixed(2)} A</text>
        <text x="14" y="54" fill={orbitFits ? gas.hud : "#ffb088"}>
          r = {!beamFormed ? "—" : I === 0 ? "∞" : !orbitFits ? "off-screen" : r_obs_cm.toFixed(2) + " cm"}
        </text>
      </g>

      {/* B-field indicator — top-right, tucked into the corner above the right coil */}
      {I > 0 && (
        <g>
          <text x={W - 14} y={22} textAnchor="end" fontFamily={MONO} fontSize="11" fill="#d97a3a" fontWeight="bold">B = {(B0 * 1e4).toFixed(2)} G</text>
          <text x={W - 14} y={38} textAnchor="end" fontFamily={FONT} fontSize="9.5" fill="#788" fontStyle="italic">(out of page)</text>
        </g>
      )}

      {/* Effects-active banner (sits above the status-hint line) */}
      {(effects.earth || effects.nonunif || effects.rel) && beamFormed && I > 0 && orbitFits && (
        <text x={bulb_cx} y={H - 34} textAnchor="middle" fontFamily={FONT} fontSize="11.5" fill={netPct >= 0 ? "#ff8a6a" : "#6aa8ff"} fontStyle="italic">
          realistic effects on — measured e/m biased {netPct >= 0 ? "+" : ""}{netPct.toFixed(1)}%
        </text>
      )}

      {/* Status hints */}
      {!heaterOn && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#ff9a70" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Turn on the cathode heater to emit electrons.</text>}
      {heaterOn && !heaterReady && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#e0a830" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Cathode warming… ({Math.round(heaterPower * 100)}%)</text>}
      {heaterReady && V === 0 && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#7d6" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Raise the accelerating voltage to fire the beam.</text>}
      {heaterReady && V > 0 && !beamFormed && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#bda06a" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Voltage too low — {gas.name} won't glow yet.</text>}
      {beamFormed && I === 0 && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#7d6" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Increase the coil current to bend the beam into a circle.</text>}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  FIT PLOT — r² vs V/B²  (slope = 2/(e/m))
// ═══════════════════════════════════════════════════════════════════════
function FitPlot({ dataPoints, previewPoint, fit }) {
  const W = 1100, H = 200, padL = 88, padR = 28, padT = 16, padB = 42;
  const xs = [...dataPoints.map(p => p.x), ...(previewPoint ? [previewPoint.x] : [])];
  const ys = [...dataPoints.map(p => p.y), ...(previewPoint ? [previewPoint.y] : [])];
  const xDataMax = Math.max(...xs, 1e-6);
  const yDataMax = Math.max(...ys, 1e-6);
  // Include the fit's y-intercept in the range so a negative intercept is visible too.
  const interc = fit ? fit.intercept : 0;
  const xMax = xDataMax * 1.08;
  const yMax = Math.max(yDataMax, interc) * 1.12;
  // Small negative margin on both axes so the origin sits *inside* the plot
  // (not jammed in the corner) — makes "passes through origin?" legible.
  const xMin = -0.08 * xMax;
  const yMin = Math.min(-0.08 * yMax, interc * 1.15);
  const sx = x => padL + ((x - xMin) / (xMax - xMin)) * (W - padL - padR);
  const sy = y => (H - padB) - ((y - yMin) / (yMax - yMin)) * (H - padT - padB);
  const x0 = sx(0), y0 = sy(0);

  return (
    <div style={{ flex: 1, padding: "14px 20px", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ fontSize: "11px", color: TEXT2, fontWeight: 600, marginBottom: "4px", fontFamily: FONT }}>
        Linear fit · <InlineMath math="r^2" /> vs <InlineMath math="V/B^2" /> · slope = <InlineMath math="2/(e/m)" />
        {fit && <span style={{ marginLeft: "12px", fontFamily: MONO, color: ACCENT }}>e/m = {(fit.emFit / 1e11).toFixed(3)} × 10¹¹ C/kg</span>}
        {fit && Math.abs(fit.intercept) > 5e-5 && (
          <span style={{ marginLeft: "12px", fontFamily: MONO, color: "#b03a2a", fontSize: "10px" }}>
            intercept ≠ 0 → current-dependent bias detected
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", flex: 1, minHeight: 0 }}>
        {/* positive-side gridlines + numeric ticks (data region only; negative side is unphysical) */}
        {(() => {
          const nTicks = 5;
          const out = [];
          for (let i = 0; i <= nTicks; i++) {
            const fx = i / nTicks;
            const xv = fx * xMax, yv = fx * yMax;
            const px = sx(xv), py = sy(yv);
            out.push(<line key={`gx${i}`} x1={px} y1={padT} x2={px} y2={H - padB} stroke="#eef0f2" strokeWidth="1" />);
            out.push(<text key={`tx${i}`} x={px} y={H - padB + 16} textAnchor="middle" fontFamily={MONO} fontSize="11" fill={TEXT2}>{xv === 0 ? "0" : xv.toExponential(1)}</text>);
            out.push(<line key={`gy${i}`} x1={padL} y1={py} x2={W - padR} y2={py} stroke="#eef0f2" strokeWidth="1" />);
            if (i > 0) out.push(<text key={`ty${i}`} x={padL - 8} y={py + 4} textAnchor="end" fontFamily={MONO} fontSize="11" fill={TEXT2}>{yv.toExponential(1)}</text>);
          }
          return out;
        })()}

        {/* plot frame */}
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="none" stroke="#dfe2e6" strokeWidth="1" />

        {/* emphasized axes THROUGH the origin */}
        <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke="#9aa0a8" strokeWidth="1.5" />
        <line x1={x0} y1={padT} x2={x0} y2={H - padB} stroke="#9aa0a8" strokeWidth="1.5" />
        {/* origin marker */}
        <circle cx={x0} cy={y0} r="2.5" fill="#9aa0a8" />
        <text x={x0 - 5} y={y0 + 14} textAnchor="end" fontFamily={MONO} fontSize="10" fill={TEXT2}>0</text>

        {/* axis titles */}
        <text x={(padL + W - padR) / 2} y={H - 6} textAnchor="middle" fontFamily={MONO} fontSize="12" fill={TEXT1}>V / B²  (V·T⁻²)</text>
        <text x={22} y={(padT + H - padB) / 2} textAnchor="middle" fontFamily={MONO} fontSize="12" fill={TEXT1} transform={`rotate(-90 22 ${(padT + H - padB) / 2})`}>r²  (m²)</text>

        {/* fit line — extrapolated across the full visible range so its origin-crossing shows */}
        {fit && (
          <>
            <line x1={sx(xMin)} y1={sy(fit.slope * xMin + fit.intercept)} x2={sx(xMax)} y2={sy(fit.slope * xMax + fit.intercept)} stroke={ACCENT} strokeWidth="2" opacity="0.85" />
            {/* mark the y-intercept (where the line crosses x = 0) */}
            <circle cx={x0} cy={sy(fit.intercept)} r="3.5" fill="#FFF" stroke={ACCENT} strokeWidth="1.5" />
            {Math.abs(fit.intercept) > 5e-5 && (
              <line x1={x0} y1={sy(0)} x2={x0} y2={sy(fit.intercept)} stroke="#b03a2a" strokeWidth="1" strokeDasharray="2,2" opacity="0.7" />
            )}
          </>
        )}

        {/* data + preview */}
        {dataPoints.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={ACCENT} />)}
        {previewPoint && <circle cx={sx(previewPoint.x)} cy={sy(previewPoint.y)} r="4" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="2,2" />}

        {dataPoints.length === 0 && !previewPoint && (
          <text x={(padL + W - padR) / 2} y={(padT + H - padB) / 2} textAnchor="middle" fontFamily={FONT} fontSize="14" fill="#b0b0b6" fontStyle="italic">
            Record points at different V and I, then press "Fit line"
          </text>
        )}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  GUIDE CONTENT — Magnetic sub-lab
// ═══════════════════════════════════════════════════════════════════════
const MAGNETIC_GUIDE = [
  {
    title: "What you're measuring",
    desc: "The charge-to-mass ratio $e/m$ is one of the defining constants of the electron — the number J.J. Thomson measured in 1897 to show the electron is a universal particle far lighter than any atom. Here you measure it by bending an electron beam into a circle with a magnetic field. The beam comes from a heated cathode sitting inside a *Wehnelt cylinder* — a cup held slightly negative that squeezes the electrons through a small aperture into a thin, focused beam.",
    action: "Turn on the cathode heater (top of the panel) and wait a few seconds for it to warm up. Then raise the accelerating voltage until the neon beam appears.",
  },
  {
    title: "Accelerate, then bend",
    desc: "An accelerating voltage $V$ gives each electron kinetic energy $eV = \\tfrac12 m v^2$, so $v = \\sqrt{2eV/m}$. In a magnetic field $B$ perpendicular to its motion, the electron feels a force $evB$ that is always perpendicular to $v$ — so it moves in a circle of radius $r = mv/(eB)$.",
    action: "With the beam visible, increase the coil current. The straight beam curls into a circle. Read its radius where the beam's outer edge crosses the scale through the gun — the scale reads radius directly (it's calibrated to the beam's diameter, which is 2r).",
  },
  {
    title: "Solving for e/m",
    desc: "Combining $eV = \\tfrac12 m v^2$ with $r = mv/(eB)$ and eliminating $v$ gives the working equation: $$e/m = \\dfrac{2V}{B^2 r^2}$$ Every quantity on the right is something you set or measure, so each beam circle is one measurement of $e/m$.",
    action: "Read the single-shot $e/m$ in the panel. With realistic effects off, it lands exactly on $1.7588\\times10^{11}$ C/kg.",
  },
  {
    title: "The better way: a linear fit",
    desc: "A single measurement carries the error of one radius reading. Rearranging gives $r^2 = \\dfrac{2}{e/m}\\cdot \\dfrac{V}{B^2}$ — a straight line through the origin whose slope is $2/(e/m)$. Recording many $(V, I)$ points and fitting the line averages out reading error.",
    action: "Record points and press \"Fit line\" to read $e/m$ from the slope. Here's a subtle trap worth discovering: if you switch on a systematic effect but take all your data at the *same coil current*, the biased points still fall on a clean line through the origin — the error hides entirely in a wrong slope. The fit looks perfect but $e/m$ is off. To expose the bias as a non-zero intercept, you must *vary the current* across your points.",
  },
  {
    title: "The fill gas is just the light source",
    desc: "You see the beam because fast electrons excite the gas, which glows. Neon's lines are orange-red and switch on near 18 V; helium's are blue-green and need about 23 V. Crucially, the gas changes only the *glow* — the beam dynamics, and therefore $e/m$, are identical for both.",
    action: "Switch the fill gas between neon and helium. Watch the color change and the onset voltage shift — but the measured $e/m$ stays the same.",
  },
  {
    title: "Real apparatus: the systematic effects",
    desc: "A real tube isn't ideal. Three effects bias the measurement, and you can switch each on independently: **Earth's field** adds to the coil field (worst at low current), **field non-uniformity** makes large orbits read high, and the **relativistic correction** makes the classical formula read slightly low at high voltage. They compose multiplicatively — and relativity pulls opposite to the other two.",
    action: "Turn on Earth's field at low coil current and watch the bias balloon in the panel — then raise the current and watch it shrink. Because the Earth-field bias depends on current, a fit taken across *different* currents reveals it as a non-zero intercept; a fit at fixed current hides it in the slope. Toggle all three effects and watch the breakdown propagate.",
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  SUB-LAB 2 — ELECTRIC DEFLECTION (sign of the charge)
// ═══════════════════════════════════════════════════════════════════════
//  An electric field between two horizontal plates deflects the beam. The
//  deflection angle  tanθ = V_d·L/(2·d·V)  is INDEPENDENT of e/m — so this
//  experiment can't measure the charge-to-mass ratio, but the DIRECTION of
//  the bend (toward the + plate) proves the electron's charge is negative.
// ═══════════════════════════════════════════════════════════════════════
function ElectricSubLab({ onHome }) {
  const [gas, setGas] = useState("neon");
  const [V, setV] = useState(V_DEFAULT);
  const [Vd, setVd] = useState(0);
  const [heaterOn, setHeaterOn] = useState(false);
  const [heaterPower, setHeaterPower] = useState(0);
  const [showGuide, setShowGuide] = useState(true);  // auto-open on load (Skip dismisses) — matches Gyromotion & DC Discharge
  const [guideStep, setGuideStep] = useState(0);

  const G = GASES[gas];

  useEffect(() => {
    if (!heaterOn) { setHeaterPower(0); return; }
    const start = Date.now();
    const iv = setInterval(() => {
      const p = 1 - Math.exp(-(Date.now() - start) / HEATER_TAU_MS);
      if (p >= 0.995) { setHeaterPower(1); clearInterval(iv); }
      else setHeaterPower(p);
    }, 50);
    return () => clearInterval(iv);
  }, [heaterOn]);

  const heaterReady = heaterPower >= HEATER_READY;
  const beamFormed = heaterReady && V >= G.vThreshold;
  const beamOpacity = beamFormed ? Math.min(1, (V - G.vThreshold) / (G.vFull - G.vThreshold)) : 0;

  // ── Deflection physics (independent of e/m) ──
  const L = PLATE_L_CM / 100, d = PLATE_D_CM / 100;
  const tanTheta = (V > 0) ? Vd * L / (2 * d * V) : 0;
  const thetaDeg = Math.atan(tanTheta) * 180 / Math.PI;
  // deflection at plate exit (m); if ≥ d/2 the beam strikes a plate
  const yExit = (V > 0) ? Vd * L * L / (4 * d * V) : 0;
  const hitsPlate = beamFormed && Vd > 0 && yExit >= d / 2;
  const fraction = hitsPlate ? Math.sqrt((d / 2) / (yExit || 1)) : 1;  // fraction of plate length before impact
  const beamThrough = beamFormed && !hitsPlate;

  const v_e = vClassical(V);

  // styles (shared vocabulary)
  const sectionHeader = { fontSize: "10px", fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", margin: "14px 0 7px 0" };
  const readoutBox = { background: "#F5F5F7", borderRadius: "6px", padding: "8px 10px", marginBottom: "7px" };
  const readoutLabel = { fontSize: "10px", color: TEXT2, fontFamily: FONT, marginBottom: "2px" };
  const readoutValue = { fontSize: "13px", color: TEXT1, fontFamily: MONO, fontWeight: 600 };
  const bb = { padding: "7px 12px", border: `1px solid ${BORDER}`, borderRadius: "6px", background: "#FFF", color: TEXT2, fontSize: "12px", fontFamily: FONT, fontWeight: 500, cursor: "pointer" };

  const topPlateSign = BOTTOM_PLATE_POSITIVE ? "−" : "+";
  const bottomPlateSign = BOTTOM_PLATE_POSITIVE ? "+" : "−";
  const bendWord = BOTTOM_PLATE_POSITIVE ? "down" : "up";

  return (
    <div style={{ height: "100vh", background: "#F4F4F6", fontFamily: FONT, display: "flex", overflow: "hidden" }}>
      {showGuide && <GuideModal steps={ELECTRIC_GUIDE} step={guideStep} onStep={setGuideStep} onClose={() => setShowGuide(false)} title="Electric Deflection" />}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 20px", borderBottom: `1px solid ${BORDER}`, background: "#FFF" }}>
          <button onClick={onHome} style={{ ...bb, padding: "5px 12px" }}>← Lab</button>
          <div style={{ fontSize: "10px", color: TEXT2 }}>Electron Beam Lab</div>
          <div style={{ fontSize: "10px", color: "#c0c0c4" }}>/</div>
          <div style={{ fontSize: "12px", color: TEXT1, fontWeight: 600 }}>2 · Electric Deflection</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setGuideStep(0); setShowGuide(true); }} style={{ ...bb, padding: "5px 12px" }}>Guide</button>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", minHeight: 0 }}>
          <ElectricViewport
            gas={G} V={V} Vd={Vd}
            tanTheta={tanTheta} yExit={yExit} hitsPlate={hitsPlate} fraction={fraction}
            beamFormed={beamFormed} beamOpacity={beamOpacity} beamThrough={beamThrough}
            heaterOn={heaterOn} heaterPower={heaterPower} heaterReady={heaterReady}
          />
        </div>

        {/* Insight strip below the viewport (this sub-lab has no plot) */}
        <div style={{ height: "240px", background: "#FFF", borderTop: `1px solid ${BORDER}`, padding: "18px 28px", display: "flex", gap: "28px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: ACCENT, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
              What the bend tells you
            </div>
            <div style={{ fontSize: "13px", color: TEXT1, lineHeight: "1.6", maxWidth: "560px" }}>
              The beam bends <strong>{bendWord}</strong>, toward the <strong>{bottomPlateSign === "+" ? "bottom" : "top"} (positive) plate</strong>. A particle pulled toward the positive plate must carry <strong>negative</strong> charge — this is how we know the electron's sign. Notice the deflection formula <InlineMath math="\tan\theta = V_d L/(2dV)" /> contains no <InlineMath math="e/m" />: electric deflection reveals the <em>sign</em> of the charge, but not the charge-to-mass ratio.
            </div>
          </div>
          <div style={{ width: "260px", flexShrink: 0 }}>
            <div style={{ ...readoutBox, background: "#FFF8F3", border: `1px solid #f0d8c4` }}>
              <div style={readoutLabel}>Deflection angle θ</div>
              <div style={readoutValue}>{beamThrough && Vd > 0 ? `${thetaDeg.toFixed(1)}°` : hitsPlate ? "— beam blocked" : "—"}</div>
              <div style={{ fontSize: "10px", color: TEXT2, marginTop: "3px", fontFamily: MONO }}>
                <InlineMath math="\tan\theta = V_d L/(2dV)" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ width: "300px", background: "#FFF", borderLeft: `1px solid ${BORDER}`, padding: "18px", overflowY: "auto", flexShrink: 0 }}>
        <h1 style={{ fontSize: "15px", fontWeight: 700, color: ACCENT, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>Electric Deflection</h1>
        <h2 style={{ fontSize: "10px", fontWeight: 500, color: TEXT2, margin: "2px 0 0 0" }}>Sign of the electron's charge</h2>

        <div style={{ height: "1px", background: BORDER, margin: "12px 0 4px 0" }} />

        <div style={sectionHeader}>Fill Gas</div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
          {Object.keys(GASES).map(key => (
            <button key={key} onClick={() => setGas(key)}
              style={{ flex: 1, padding: "7px 4px", border: `1px solid ${gas === key ? ACCENT : BORDER}`, borderRadius: "6px",
                background: gas === key ? "#FFF3EB" : "#FFF", color: gas === key ? ACCENT : TEXT2,
                fontSize: "11px", fontFamily: FONT, fontWeight: gas === key ? 600 : 500, cursor: "pointer" }}>
              {GASES[key].name}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "10px", color: TEXT2, fontStyle: "italic", marginBottom: "4px", lineHeight: "1.4" }}>
          {G.name}: {G.label} beam, glows from ~{G.vThreshold} V
        </div>

        <div style={sectionHeader}>Electron Source</div>
        {(() => {
          const warming = heaterOn && !heaterReady;
          const ready = heaterOn && heaterReady;
          const bg = ready ? "#e8f5e9" : warming ? "#fff4e0" : "#fcebe7";
          const border = ready ? "#2a8c3a" : warming ? "#c8881a" : "#d33a2a";
          const fg = ready ? "#1a5a25" : warming ? "#7a5210" : "#a02818";
          const dot = ready ? "#2a8c3a" : warming ? "#e0a830" : "#d33a2a";
          const label = ready ? "ON" : warming ? `warming… ${Math.round(heaterPower * 100)}%` : "OFF";
          const heaterV = heaterPower * HEATER_V_MAX;
          return (
            <button onClick={() => setHeaterOn(!heaterOn)}
              style={{ ...bb, width: "100%", padding: "8px 12px", marginBottom: "2px", background: bg, borderColor: border, color: fg, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><span style={{ color: dot, marginRight: "6px", fontSize: "13px" }}>●</span>Cathode heater: {label}</span>
              {heaterOn && <span style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 600 }}>{heaterV.toFixed(1)} V</span>}
            </button>
          );
        })()}

        <ParamSlider label="Accelerating Voltage" displayVal={V.toFixed(0)}
          value={V} min={V_MIN} max={V_MAX} step={1} onChange={setV} unit="V"
          subLabel={`0–1000 V · ${G.name} glows above ~${G.vThreshold} V`} />
        <div style={readoutBox}>
          <div style={readoutLabel}>Beam speed v</div>
          <div style={readoutValue}>
            {!heaterOn ? "heater off" : !heaterReady ? "cathode warming…" : V === 0 ? "—" : `${(v_e / 1e6).toFixed(2)} × 10⁶ m/s`}
          </div>
        </div>

        <div style={sectionHeader}>Deflection Plates</div>
        <ParamSlider label="Plate Voltage" displayVal={Vd.toFixed(0)}
          value={Vd} min={VD_MIN} max={VD_MAX} step={1} onChange={setVd} unit="V"
          subLabel={`Top plate ${topPlateSign} · bottom plate ${bottomPlateSign} · ${PLATE_L_CM}×${PLATE_D_CM} cm`} />
        <div style={{ ...readoutBox, background: hitsPlate ? "#FFEBEB" : "#F5F5F7" }}>
          <div style={readoutLabel}>Beam status</div>
          <div style={{ ...readoutValue, color: hitsPlate ? "#b03a2a" : TEXT1 }}>
            {!heaterOn ? "heater off" :
             !heaterReady ? "cathode warming…" :
             V === 0 ? "source off" :
             !beamFormed ? "V too low — beam dark" :
             Vd === 0 ? "undeflected (straight)" :
             hitsPlate ? "strikes plate — blocked" :
             `deflected ${thetaDeg.toFixed(1)}° ${bendWord}`}
          </div>
          {hitsPlate && (
            <div style={{ fontSize: "10px", color: "#a85a18", marginTop: "3px", lineHeight: "1.35", fontStyle: "italic" }}>
              Deflection exceeds the {(PLATE_D_CM / 2).toFixed(0)} cm half-gap — lower the plate voltage or raise the accelerating voltage.
            </div>
          )}
        </div>

        <div style={sectionHeader}>Charge Sign</div>
        <div style={{ ...readoutBox, background: "#FFF8F3", border: `1px solid #f0d8c4` }}>
          <div style={{ fontSize: "12px", color: TEXT1, fontFamily: FONT, lineHeight: "1.5" }}>
            {beamThrough && Vd > 0
              ? <span>Beam pulled <strong>{bendWord}</strong>, toward the <strong>+</strong> plate ⇒ charge is <strong>negative</strong>.</span>
              : <span style={{ color: TEXT2, fontStyle: "italic" }}>Apply a plate voltage to see which way the beam bends.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  ELECTRIC VIEWPORT — horizontal beam, top/bottom plates, parabolic bend
// ═══════════════════════════════════════════════════════════════════════
function ElectricViewport({ gas, V, Vd, tanTheta, yExit, hitsPlate, fraction,
                            beamFormed, beamOpacity, beamThrough,
                            heaterOn, heaterPower, heaterReady }) {
  const W = 760, H = 560;
  const bulb_cx = W / 2, bulb_cy = H / 2 - 6;
  const cmToPx = 17;
  const bulb_r = R_BULB_CM * cmToPx;

  const emitter_x = bulb_cx, emitter_y = bulb_cy;
  const stub_left_x = bulb_cx - bulb_r;
  const stub_h = 10;

  // Plate geometry (to the right of the gun)
  const plate_x0 = emitter_x + 2.2 * cmToPx;
  const plate_x1 = plate_x0 + PLATE_L_CM * cmToPx;
  const halfgap = (PLATE_D_CM / 2) * cmToPx;
  const plate_top_y = emitter_y - halfgap;
  const plate_bot_y = emitter_y + halfgap;

  // sign of vertical deflection in screen coords (+y = down). Bottom plate +
  // pulls the (negative) electron down ⇒ +y.
  const sgn = BOTTOM_PLATE_POSITIVE ? 1 : -1;

  // Build the beam path: straight (gun→plate entry), parabola (in plates),
  // straight (exit→wall). All y measured from emitter_y, downward positive.
  const yExit_px = yExit * 100 * cmToPx;     // |deflection| at plate exit (px)
  const beamPath = (() => {
    if (!beamFormed) return null;
    const pts = [`M ${emitter_x},${emitter_y}`];
    pts.push(`L ${plate_x0},${emitter_y}`);          // straight into the plates
    if (Vd === 0) {
      pts.push(`L ${bulb_cx + bulb_r},${emitter_y}`); // straight through to wall
      return pts.join(" ");
    }
    if (hitsPlate) {
      // parabola until it strikes a plate at fraction f of the plate length
      const f = Math.max(0.04, Math.min(1, fraction));
      const N = 14;
      for (let i = 1; i <= N; i++) {
        const t = (i / N) * f;
        const x = plate_x0 + t * (plate_x1 - plate_x0);
        const y = emitter_y + sgn * yExit_px * t * t;  // parabola ∝ t²
        pts.push(`L ${x},${y}`);
      }
      return pts.join(" ");
    }
    // full parabola through the plates
    const N = 16;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const x = plate_x0 + t * (plate_x1 - plate_x0);
      const y = emitter_y + sgn * yExit_px * t * t;
      pts.push(`L ${x},${y}`);
    }
    // straight after the plates, at the exit slope, to the wall
    const xEnd = bulb_cx + bulb_r;
    const yEnd = emitter_y + sgn * (yExit_px + tanTheta * (xEnd - plate_x1));
    pts.push(`L ${xEnd},${yEnd}`);
    return pts.join(" ");
  })();

  const filamentColor = (() => {
    const cold = [0x40, 0x38, 0x32], hot = [0xff, 0x8a, 0x3a], p = heaterPower;
    const rgb = cold.map((c, i) => Math.round(c + (hot[i] - c) * p));
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  })();

  const coil_left_x = bulb_cx - bulb_r - 42, coil_right_x = bulb_cx + bulb_r + 42;
  const coil_rx = 30, coil_ry = bulb_r + 12;

  const topSign = BOTTOM_PLATE_POSITIVE ? "−" : "+";
  const botSign = BOTTOM_PLATE_POSITIVE ? "+" : "−";
  const platesLive = beamFormed && Vd > 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", maxHeight: "100%", background: "#0a0d16", borderRadius: "10px" }}>
      <defs>
        <radialGradient id="bulbGlassE" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#1a2030" /><stop offset="70%" stopColor="#121622" /><stop offset="100%" stopColor="#0c0f18" />
        </radialGradient>
        <linearGradient id="copperE" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a3818" /><stop offset="50%" stopColor="#c87038" /><stop offset="100%" stopColor="#7a3818" />
        </linearGradient>
        <clipPath id="bulbClipE"><circle cx={bulb_cx} cy={bulb_cy} r={bulb_r - 2} /></clipPath>
        <filter id="beamGlowAE" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" /></filter>
        <filter id="beamGlowBE" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6" /></filter>
        <filter id="filGlowE" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4" /></filter>
      </defs>

      {/* Coils — present but UNPOWERED in this sub-lab (no magnetic field) */}
      <g opacity={0.4}>
        <ellipse cx={coil_left_x} cy={bulb_cy} rx={coil_rx} ry={coil_ry} fill="url(#copperE)" stroke="#5a2810" strokeWidth="1" />
        <ellipse cx={coil_left_x} cy={bulb_cy} rx={coil_rx - 11} ry={coil_ry - 11} fill="#0a0d16" stroke="#3a2010" strokeWidth="0.5" />
        <text x={coil_left_x} y={bulb_cy + coil_ry + 18} textAnchor="middle" fill="#777" fontFamily={FONT} fontSize="10">Coil 1 · off</text>
        <ellipse cx={coil_right_x} cy={bulb_cy} rx={coil_rx} ry={coil_ry} fill="url(#copperE)" stroke="#5a2810" strokeWidth="1" />
        <ellipse cx={coil_right_x} cy={bulb_cy} rx={coil_rx - 11} ry={coil_ry - 11} fill="#0a0d16" stroke="#3a2010" strokeWidth="0.5" />
        <text x={coil_right_x} y={bulb_cy + coil_ry + 18} textAnchor="middle" fill="#777" fontFamily={FONT} fontSize="10">Coil 2 · off</text>
      </g>

      {/* Bulb */}
      <circle cx={bulb_cx} cy={bulb_cy} r={bulb_r} fill="url(#bulbGlassE)" stroke="#34405a" strokeWidth="2" />

      {/* Deflection plates */}
      <g clipPath="url(#bulbClipE)">
        {/* faint centerline showing the beam enters on-axis, equidistant from both plates */}
        <line x1={plate_x0} y1={emitter_y} x2={plate_x1} y2={emitter_y} stroke="#3a4658" strokeWidth="0.6" strokeDasharray="3,4" opacity="0.45" />
        {/* top plate */}
        <rect x={plate_x0} y={plate_top_y - 4} width={plate_x1 - plate_x0} height="4" rx="1.5"
          fill={platesLive ? (topSign === "+" ? "#c43a2a" : "#2a5ab0") : "#3a4356"}
          stroke={platesLive ? (topSign === "+" ? "#e06a55" : "#5a8ad8") : "#56607a"} strokeWidth="0.8" />
        <text x={(plate_x0 + plate_x1) / 2} y={plate_top_y - 8} textAnchor="middle"
          fill={platesLive ? (topSign === "+" ? "#ff8a6a" : "#7aa8ff") : "#7a8498"} fontFamily={MONO} fontSize="13" fontWeight="bold">{topSign}</text>
        {/* bottom plate */}
        <rect x={plate_x0} y={plate_bot_y} width={plate_x1 - plate_x0} height="4" rx="1.5"
          fill={platesLive ? (botSign === "+" ? "#c43a2a" : "#2a5ab0") : "#3a4356"}
          stroke={platesLive ? (botSign === "+" ? "#e06a55" : "#5a8ad8") : "#56607a"} strokeWidth="0.8" />
        <text x={(plate_x0 + plate_x1) / 2} y={plate_bot_y + 16} textAnchor="middle"
          fill={platesLive ? (botSign === "+" ? "#ff8a6a" : "#7aa8ff") : "#7a8498"} fontFamily={MONO} fontSize="13" fontWeight="bold">{botSign}</text>
        {/* field hint lines between plates when live */}
        {platesLive && [0.25, 0.5, 0.75].map((f, i) => {
          const x = plate_x0 + f * (plate_x1 - plate_x0);
          return <line key={i} x1={x} y1={plate_top_y + 2} x2={x} y2={plate_bot_y - 2} stroke="#46506a" strokeWidth="0.6" strokeDasharray="2,3" opacity="0.5" />;
        })}
      </g>

      {/* Beam */}
      {beamPath && (
        <g clipPath="url(#bulbClipE)" opacity={beamOpacity}>
          <path d={beamPath} fill="none" stroke={gas.glow} strokeWidth="9" opacity="0.3" filter="url(#beamGlowAE)" />
          <path d={beamPath} fill="none" stroke={gas.mid} strokeWidth="3.5" opacity="0.7" filter="url(#beamGlowBE)" />
          <path d={beamPath} fill="none" stroke={gas.core} strokeWidth="1.3" opacity="0.95" />
          {/* impact flash if the beam strikes a plate */}
          {hitsPlate && (() => {
            const f = Math.max(0.04, Math.min(1, fraction));
            const x = plate_x0 + f * (plate_x1 - plate_x0);
            const y = emitter_y + sgn * yExit_px * f * f;
            return <circle cx={x} cy={y} r="4" fill="#ffd0a8" opacity="0.9" filter="url(#beamGlowBE)" />;
          })()}
        </g>
      )}

      {/* Electron source — same gun as sub-lab 1 (stub from left, Wehnelt firing right) */}
      <g clipPath="url(#bulbClipE)">
        <rect x={stub_left_x} y={emitter_y - stub_h / 2} width={emitter_x - 20 - stub_left_x} height={stub_h} fill="#2a3548" stroke="#556680" strokeWidth="0.6" />
        <rect x={stub_left_x} y={emitter_y - stub_h / 2 + 1.5} width={emitter_x - 20 - stub_left_x} height="1.8" fill="#6a7488" opacity="0.55" />
        <path d={`M${emitter_x},${emitter_y - 19} L${emitter_x - 20},${emitter_y - 19} L${emitter_x - 20},${emitter_y + 19} L${emitter_x},${emitter_y + 19}`}
          fill="#1a2030" stroke="#aeb8c8" strokeWidth="1.4" strokeLinejoin="round" />
        <line x1={emitter_x} y1={emitter_y - 19} x2={emitter_x} y2={emitter_y - 5} stroke="#aeb8c8" strokeWidth="1.4" strokeLinecap="round" />
        <line x1={emitter_x} y1={emitter_y + 5} x2={emitter_x} y2={emitter_y + 19} stroke="#aeb8c8" strokeWidth="1.4" strokeLinecap="round" />
        {(() => {
          const fx = emitter_x - 13, amp = 5;
          const wire = `M${fx},${emitter_y - 12} L${fx + amp},${emitter_y - 8} L${fx},${emitter_y - 4} L${fx + amp},${emitter_y} L${fx},${emitter_y + 4} L${fx + amp},${emitter_y + 8} L${fx},${emitter_y + 12}`;
          return (
            <g>
              {heaterPower > 0 && (<>
                <ellipse cx={emitter_x - 10} cy={emitter_y} rx="11" ry="18" fill="#ff8030" opacity={0.16 * heaterPower} filter="url(#filGlowE)" />
                <path d={wire} fill="none" stroke="#ffb060" strokeWidth="2.6" strokeLinecap="round" opacity={0.55 * heaterPower} filter="url(#filGlowE)" />
              </>)}
              <path d={wire} fill="none" stroke={filamentColor} strokeWidth="1.2" strokeLinecap="round" />
              {heaterPower > 0 && <path d={wire} fill="none" stroke="#ffe8b0" strokeWidth="0.5" strokeLinecap="round" opacity={0.9 * heaterPower} />}
            </g>
          );
        })()}
        {beamFormed && (<>
          <circle cx={emitter_x} cy={emitter_y} r="4.5" fill={gas.mid} opacity={0.5 * beamOpacity} filter="url(#beamGlowBE)" />
          <circle cx={emitter_x} cy={emitter_y} r="2" fill={gas.core} opacity={0.9 * beamOpacity} />
        </>)}
        <text x={emitter_x - 10} y={emitter_y - 25} textAnchor="middle" fill="#8a94a4" fontFamily={FONT} fontSize="9" fontStyle="italic">Wehnelt</text>
      </g>

      {/* HUD */}
      <g fontFamily={MONO} fontSize="11">
        <text x="14" y="22" fill="#bbb">V = {V.toFixed(0)} V</text>
        <text x="14" y="38" fill="#bbb">V<tspan baselineShift="sub" fontSize="8">d</tspan> = {Vd.toFixed(0)} V</text>
        <text x="14" y="54" fill={hitsPlate ? "#ffb088" : gas.hud}>
          θ = {beamThrough && Vd > 0 ? (Math.atan(tanTheta) * 180 / Math.PI).toFixed(1) + "°" : hitsPlate ? "blocked" : "—"}
        </text>
      </g>

      {/* Status hints */}
      {!heaterOn && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#ff9a70" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Turn on the cathode heater to emit electrons.</text>}
      {heaterOn && !heaterReady && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#e0a830" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Cathode warming… ({Math.round(heaterPower * 100)}%)</text>}
      {heaterReady && V === 0 && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#7d6" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Raise the accelerating voltage to fire the beam.</text>}
      {heaterReady && V > 0 && !beamFormed && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#bda06a" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Voltage too low — {gas.name} won't glow yet.</text>}
      {beamFormed && Vd === 0 && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#7d6" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Apply a plate voltage to deflect the beam.</text>}
      {beamFormed && Vd > 0 && !hitsPlate && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#9aa" fontFamily={FONT} fontSize="11.5" fontStyle="italic">beam bends toward the + plate → negative charge</text>}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  GUIDE CONTENT — Electric sub-lab
// ═══════════════════════════════════════════════════════════════════════
const ELECTRIC_GUIDE = [
  {
    title: "A different way to bend the beam",
    desc: "In the first experiment a magnetic field curved the beam into a circle. Here you use an *electric* field instead — the field between two parallel plates. The same neon tube, the same gun; only the deflecting field is different.",
    action: "Turn on the heater, raise the accelerating voltage until the beam appears, then add a plate voltage and watch the beam bend.",
  },
  {
    title: "Why the beam bends",
    desc: "Between the plates is a uniform field $E = V_d/d$. It pushes the electron sideways the whole time the electron is between the plates, so the path is a *parabola* — exactly like a sideways projectile under gravity. Once the beam leaves the plates the force stops and it flies straight again.",
    action: "Increase the plate voltage and watch the parabola steepen. Notice the beam travels straight, curves through the plates, then straightens.",
  },
  {
    title: "The direction reveals the charge's sign",
    desc: "The electron bends *toward the positive plate*. Only a negatively-charged particle does that — a positive one would bend the other way. This is the heart of Thomson's argument that cathode rays are negative particles.",
    action: "Note which plate is positive and confirm the beam bends toward it. Flip your mental model: a positive charge would bend away.",
  },
  {
    title: "This experiment can't measure e/m",
    desc: "The deflection angle works out to $\\tan\\theta = \\dfrac{V_d L}{2 d V}$ — built only from the voltages and the plate geometry. The electron's $e$ and $m$ cancel completely. So electric deflection pins down the *sign* of the charge, but for the charge-to-mass *ratio* you need the magnetic experiment. (The crossed-fields experiment combines both.)",
    action: "Try different accelerating voltages at the same plate voltage. The bend changes, but it never tells you e/m — only geometry and voltages set it.",
  },
  {
    title: "Push it too far and the beam is lost",
    desc: "If the plate voltage is large compared with the accelerating voltage, the electron is deflected more than the half-gap before it clears the plates — it crashes into a plate and never reaches the screen. Real deflection tubes have exactly this limit.",
    action: "Crank the plate voltage up at a low accelerating voltage until the beam strikes a plate, then raise the accelerating voltage to push it back through.",
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  SUB-LAB 3 — CROSSED FIELDS (velocity selector · Thomson's method)
// ═══════════════════════════════════════════════════════════════════════
//  Both fields on at once. Electric force (plates) opposes magnetic force
//  (coils). Only electrons with v = E/B pass straight through; faster ones
//  bend one way, slower ones the other. At balance the selected speed plus
//  the accelerating voltage recover e/m exactly (Thomson's method).
//
//  Plates here are wired TOP +, BOTTOM − (opposite of sub-lab 2) so that the
//  upward electric force can oppose the downward magnetic force — that's how
//  a velocity selector must be wired. B is out of the page, as in sub-lab 1.
// ═══════════════════════════════════════════════════════════════════════
function CrossedSubLab({ onHome }) {
  const [gas, setGas] = useState("neon");
  const [V, setV] = useState(V_DEFAULT);
  const [Vd, setVd] = useState(0);
  const [I, setI] = useState(0);
  const [heaterOn, setHeaterOn] = useState(false);
  const [heaterPower, setHeaterPower] = useState(0);
  const [showGuide, setShowGuide] = useState(true);  // auto-open on load (Skip dismisses) — matches Gyromotion & DC Discharge
  const [guideStep, setGuideStep] = useState(0);
  const [dataPoints, setDataPoints] = useState([]);
  const [showFit, setShowFit] = useState(false);
  const [fitPerformed, setFitPerformed] = useState(false);

  const G = GASES[gas];

  useEffect(() => {
    if (!heaterOn) { setHeaterPower(0); return; }
    const start = Date.now();
    const iv = setInterval(() => {
      const p = 1 - Math.exp(-(Date.now() - start) / HEATER_TAU_MS);
      if (p >= 0.995) { setHeaterPower(1); clearInterval(iv); }
      else setHeaterPower(p);
    }, 50);
    return () => clearInterval(iv);
  }, [heaterOn]);

  const heaterReady = heaterPower >= HEATER_READY;
  const beamFormed = heaterReady && V >= G.vThreshold;
  const beamOpacity = beamFormed ? Math.min(1, (V - G.vThreshold) / (G.vFull - G.vThreshold)) : 0;

  const B0 = bCenter(I);
  const fieldsBoth = beamFormed && Vd > 0 && I > 0;

  // Trajectory through the plates (full Lorentz integration)
  const traj = beamFormed ? crossedTrajectory(V, Vd, I) : null;
  const hitsPlate = traj ? traj.hit : false;
  const beamThrough = beamFormed && !hitsPlate;

  // Balance: the selected speed v=E/B vs the actual beam speed v(V).
  const vBeam = vClassical(V);
  const E_field = Vd / (PLATE_D_CM / 100);
  const vSelect = (B0 > 0) ? E_field / B0 : Infinity;     // speed that would pass straight
  const Vbal = balanceVoltage(Vd, I);
  // "balanced" when the accelerating voltage is within 2% of the exact balance
  // voltage (consistent feel across operating points, hittable on the slider).
  const balanced = fieldsBoth && beamThrough && isFinite(Vbal) && Math.abs(V - Vbal) / Vbal < 0.02;

  // Thomson recovery: at balance, v = E/B is the measured speed, and
  // e/m = v²/(2V). Only meaningful when balanced.
  const emThomson = balanced ? (vSelect * vSelect) / (2 * V) : null;
  const emErrPct = emThomson != null ? (emThomson / EM_RATIO_TRUE - 1) * 100 : null;

  // ── Data recording for the V vs (E/B)² fit ──
  //  At balance, V = (1/(2·e/m))·(E/B)². Recording (x=(E/B)², y=V) across
  //  several balanced configs gives a line through the origin whose slope is
  //  1/(2·e/m). Points recorded OFF balance are still well-defined but do NOT
  //  satisfy this relation, so they scatter off the line — that scatter is the
  //  lesson: only balanced measurements land on the fit.
  function recordPoint() {
    if (!fieldsBoth || hitsPlate || !isFinite(vSelect)) return;
    const x = vSelect * vSelect;   // (E/B)²
    const y = V;                   // accelerating voltage
    setDataPoints([...dataPoints, { x, y, V, Vd, I, balanced }]);
    setShowFit(false);
  }
  function clearData() { setDataPoints([]); setShowFit(false); setFitPerformed(false); }

  const fit = useMemo(() => {
    if (!showFit || dataPoints.length < 2) return null;
    const f = linearFit(dataPoints.map(p => p.x), dataPoints.map(p => p.y));
    if (!f) return null;
    // slope = 1/(2·e/m)  ⇒  e/m = 1/(2·slope)
    const emFit = 1 / (2 * f.slope);
    const emFitSigma = isNaN(f.slopeSigma) ? NaN : f.slopeSigma / (2 * f.slope * f.slope);
    return { ...f, emFit, emFitSigma };
  }, [dataPoints, showFit]);

  // live preview point (where the current config would plot)
  const previewPoint = (fieldsBoth && !hitsPlate && isFinite(vSelect))
    ? { x: vSelect * vSelect, y: V } : null;

  // direction of net deflection for status text (screen +y = down)
  const driftWord = !fieldsBoth ? "" : (traj && traj.slope > 0.01 ? "down (magnetic wins)" : traj && traj.slope < -0.01 ? "up (electric wins)" : "straight");

  const sectionHeader = { fontSize: "10px", fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", margin: "14px 0 7px 0" };
  const readoutBox = { background: "#F5F5F7", borderRadius: "6px", padding: "8px 10px", marginBottom: "7px" };
  const readoutLabel = { fontSize: "10px", color: TEXT2, fontFamily: FONT, marginBottom: "2px" };
  const readoutValue = { fontSize: "13px", color: TEXT1, fontFamily: MONO, fontWeight: 600 };
  const bb = { padding: "7px 12px", border: `1px solid ${BORDER}`, borderRadius: "6px", background: "#FFF", color: TEXT2, fontSize: "12px", fontFamily: FONT, fontWeight: 500, cursor: "pointer" };

  return (
    <div style={{ height: "100vh", background: "#F4F4F6", fontFamily: FONT, display: "flex", overflow: "hidden" }}>
      {showGuide && <GuideModal steps={CROSSED_GUIDE} step={guideStep} onStep={setGuideStep} onClose={() => setShowGuide(false)} title="Crossed Fields" />}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 20px", borderBottom: `1px solid ${BORDER}`, background: "#FFF" }}>
          <button onClick={onHome} style={{ ...bb, padding: "5px 12px" }}>← Lab</button>
          <div style={{ fontSize: "10px", color: TEXT2 }}>Electron Beam Lab</div>
          <div style={{ fontSize: "10px", color: "#c0c0c4" }}>/</div>
          <div style={{ fontSize: "12px", color: TEXT1, fontWeight: 600 }}>3 · Crossed Fields</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setGuideStep(0); setShowGuide(true); }} style={{ ...bb, padding: "5px 12px" }}>Guide</button>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", minHeight: 0 }}>
          <CrossedViewport
            gas={G} V={V} Vd={Vd} I={I} B0={B0}
            traj={traj} hitsPlate={hitsPlate} beamThrough={beamThrough} balanced={balanced}
            beamFormed={beamFormed} beamOpacity={beamOpacity} fieldsBoth={fieldsBoth}
            heaterOn={heaterOn} heaterPower={heaterPower} heaterReady={heaterReady}
          />
        </div>

        {/* Fit plot strip — V vs (E/B)²; balanced points land on the line */}
        <div style={{ height: "240px", background: "#FFF", borderTop: `1px solid ${BORDER}`, display: "flex" }}>
          <CrossedFitPlot dataPoints={dataPoints} previewPoint={previewPoint} previewBalanced={balanced} fit={fit} />
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ width: "300px", background: "#FFF", borderLeft: `1px solid ${BORDER}`, padding: "18px", overflowY: "auto", flexShrink: 0 }}>
        <h1 style={{ fontSize: "15px", fontWeight: 700, color: ACCENT, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>Crossed Fields</h1>
        <h2 style={{ fontSize: "10px", fontWeight: 500, color: TEXT2, margin: "2px 0 0 0" }}>Velocity selector · Thomson's method</h2>

        <div style={{ height: "1px", background: BORDER, margin: "12px 0 4px 0" }} />

        <div style={sectionHeader}>Fill Gas</div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
          {Object.keys(GASES).map(key => (
            <button key={key} onClick={() => setGas(key)}
              style={{ flex: 1, padding: "7px 4px", border: `1px solid ${gas === key ? ACCENT : BORDER}`, borderRadius: "6px",
                background: gas === key ? "#FFF3EB" : "#FFF", color: gas === key ? ACCENT : TEXT2,
                fontSize: "11px", fontFamily: FONT, fontWeight: gas === key ? 600 : 500, cursor: "pointer" }}>
              {GASES[key].name}
            </button>
          ))}
        </div>

        <div style={sectionHeader}>Electron Source</div>
        {(() => {
          const warming = heaterOn && !heaterReady;
          const ready = heaterOn && heaterReady;
          const bg = ready ? "#e8f5e9" : warming ? "#fff4e0" : "#fcebe7";
          const border = ready ? "#2a8c3a" : warming ? "#c8881a" : "#d33a2a";
          const fg = ready ? "#1a5a25" : warming ? "#7a5210" : "#a02818";
          const dot = ready ? "#2a8c3a" : warming ? "#e0a830" : "#d33a2a";
          const label = ready ? "ON" : warming ? `warming… ${Math.round(heaterPower * 100)}%` : "OFF";
          const heaterV = heaterPower * HEATER_V_MAX;
          return (
            <button onClick={() => setHeaterOn(!heaterOn)}
              style={{ ...bb, width: "100%", padding: "8px 12px", marginBottom: "2px", background: bg, borderColor: border, color: fg, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><span style={{ color: dot, marginRight: "6px", fontSize: "13px" }}>●</span>Cathode heater: {label}</span>
              {heaterOn && <span style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 600 }}>{heaterV.toFixed(1)} V</span>}
            </button>
          );
        })()}

        <ParamSlider label="Accelerating Voltage" displayVal={V.toFixed(0)}
          value={V} min={V_MIN} max={V_MAX} step={1} onChange={setV} unit="V"
          subLabel={`0–1000 V · sets the beam speed`} />
        <div style={readoutBox}>
          <div style={readoutLabel}>Beam speed v (from V)</div>
          <div style={readoutValue}>
            {!heaterOn ? "heater off" : !heaterReady ? "cathode warming…" : V === 0 ? "—" : `${(vBeam / 1e6).toFixed(2)} × 10⁶ m/s`}
          </div>
        </div>

        <div style={sectionHeader}>Electric Field (plates)</div>
        <ParamSlider label="Plate Voltage" displayVal={Vd.toFixed(0)}
          value={Vd} min={VD_MIN} max={VD_MAX} step={1} onChange={setVd} unit="V"
          subLabel={`Top + · bottom − · electric force pushes beam up`} />

        <div style={sectionHeader}>Magnetic Field (coils)</div>
        <ParamSlider label="Coil Current" displayVal={I.toFixed(2)}
          value={I} min={I_MIN} max={I_MAX} step={0.01} onChange={setI} unit="A"
          subLabel={fieldsBoth && (Vbal < V_MIN || Vbal > V_MAX) ? "⚠ balance is off-scale at this current" : `B = ${(B0 * 1e4).toFixed(1)} G · magnetic force pushes beam down`} />
        <div style={{ fontSize: "10px", color: TEXT2, fontStyle: "italic", marginBottom: "4px", lineHeight: "1.4" }}>
          The selector only balances in a visible window near {XF_I_MIN}–{XF_I_MAX} A. Outside it, the balance voltage runs off-scale.
        </div>

        <div style={sectionHeader}>Balance</div>
        <div style={{ ...readoutBox, background: balanced ? "#e8f5e9" : hitsPlate ? "#FFEBEB" : "#F5F5F7" }}>
          <div style={readoutLabel}>Beam status</div>
          <div style={{ ...readoutValue, color: balanced ? "#1a5a25" : hitsPlate ? "#b03a2a" : TEXT1 }}>
            {!heaterOn ? "heater off" :
             !heaterReady ? "cathode warming…" :
             V === 0 ? "source off" :
             !beamFormed ? "V too low — beam dark" :
             !fieldsBoth ? "turn on both fields" :
             hitsPlate ? "strikes plate — blocked" :
             balanced ? "BALANCED — straight through" :
             `drifting ${driftWord}`}
          </div>
          {fieldsBoth && !balanced && !hitsPlate && isFinite(Vbal) && Vbal >= V_MIN && Vbal <= V_MAX && (
            <div style={{ fontSize: "10px", color: "#a85a18", marginTop: "3px", lineHeight: "1.35", fontStyle: "italic" }}>
              Balance at V ≈ {Vbal.toFixed(0)} V for this plate voltage and current — set the accelerating voltage there.
            </div>
          )}
        </div>
        <div style={readoutBox}>
          <div style={readoutLabel}>Selected speed <InlineMath math="v = E/B" /></div>
          <div style={readoutValue}>{!fieldsBoth ? "— need both fields" : `${(vSelect / 1e6).toFixed(2)} × 10⁶ m/s`}</div>
        </div>

        {/* Data → fit workflow (mirrors the magnetic sub-lab) */}
        <div style={sectionHeader}>Data — V vs (E/B)²</div>
        <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "7px", lineHeight: "1.45", fontStyle: "italic" }}>
          Record a point at any setting, but only <em>balanced</em> points obey <InlineMath math="V = \tfrac{1}{2(e/m)}(E/B)^2" /> — the rest scatter off the line.
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
          <button onClick={recordPoint}
            style={{ ...bb, flex: 1, border: `1px solid ${ACCENT}`, background: ACCENT, color: "#FFF", fontWeight: 600, opacity: (fieldsBoth && !hitsPlate) ? 1 : 0.4, cursor: (fieldsBoth && !hitsPlate) ? "pointer" : "not-allowed" }}
            disabled={!fieldsBoth || hitsPlate}>Record point</button>
          <button onClick={clearData} style={bb}>Clear</button>
        </div>
        <div style={{ display: "flex", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
          <button onClick={() => { setShowFit(true); setFitPerformed(true); }}
            style={{ ...bb, flex: 1, borderColor: dataPoints.length >= 2 ? ACCENT : BORDER, color: dataPoints.length >= 2 ? ACCENT : "#c0c0c4", fontWeight: 600, opacity: dataPoints.length >= 2 ? 1 : 0.5, cursor: dataPoints.length >= 2 ? "pointer" : "not-allowed" }}
            disabled={dataPoints.length < 2}>Fit line</button>
          <div style={{ fontSize: "10px", color: TEXT2, fontFamily: MONO, flex: 1, textAlign: "right" }}>
            {dataPoints.length} point{dataPoints.length !== 1 ? "s" : ""}
          </div>
        </div>

        {fit && (
          <>
            <div style={sectionHeader}>Fitted e/m</div>
            <div style={{ ...readoutBox, background: "#FFF8F3", border: `1px solid #f0d8c4` }}>
              <div style={readoutLabel}>From slope of V vs (E/B)² — <InlineMath math="e/m = 1/(2\,\mathrm{slope})" /></div>
              <div style={readoutValue}>
                {(fit.emFit / 1e11).toFixed(3)}{!isNaN(fit.emFitSigma) && ` ± ${(fit.emFitSigma / 1e11).toFixed(3)}`} × 10¹¹ C/kg
              </div>
              <div style={{ fontSize: "10px", color: TEXT2, marginTop: "2px", fontFamily: MONO }}>
                {((fit.emFit - EM_RATIO_TRUE) / EM_RATIO_TRUE * 100).toFixed(2)}% from accepted
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  CROSSED VIEWPORT — both fields live, integrated trajectory
// ═══════════════════════════════════════════════════════════════════════
function CrossedViewport({ gas, V, Vd, I, B0, traj, hitsPlate, beamThrough, balanced,
                           beamFormed, beamOpacity, fieldsBoth,
                           heaterOn, heaterPower, heaterReady }) {
  const W = 760, H = 560;
  const bulb_cx = W / 2, bulb_cy = H / 2 - 6;
  const cmToPx = 17;
  const bulb_r = R_BULB_CM * cmToPx;
  const emitter_x = bulb_cx, emitter_y = bulb_cy;
  const stub_left_x = bulb_cx - bulb_r, stub_h = 10;

  const plate_x0 = emitter_x + 2.2 * cmToPx;
  const plate_x1 = plate_x0 + PLATE_L_CM * cmToPx;
  const halfgap = (PLATE_D_CM / 2) * cmToPx;
  const plate_top_y = emitter_y - halfgap;
  const plate_bot_y = emitter_y + halfgap;

  const coil_left_x = bulb_cx - bulb_r - 42, coil_right_x = bulb_cx + bulb_r + 42;
  const coil_rx = 30, coil_ry = bulb_r + 12;

  // Build the beam path by sampling the same Lorentz integration used for state,
  // re-running it here to get intermediate points for drawing.
  const beamPath = (() => {
    if (!beamFormed) return null;
    const pts = [`M ${emitter_x},${emitter_y}`, `L ${plate_x0},${emitter_y}`];
    if (!fieldsBoth) {
      // only one (or no) field — still integrate; if neither, straight to wall
      if (Vd === 0 && I === 0) { pts.push(`L ${bulb_cx + bulb_r},${emitter_y}`); return pts.join(" "); }
    }
    // sample the in-plate trajectory
    const B = bCenter(I);
    const E_field = Vd / (PLATE_D_CM / 100);
    const L = PLATE_L_CM / 100, halfGap_m = PLATE_D_CM / 200;
    const v0 = vClassical(V);
    let x = 0, y = 0, vx = v0, vy = 0;
    const dt = Math.min(1e-13, L / v0 / 4000);
    let steps = 0, struck = false;
    const sample = 80; let nextSample = L / sample;
    while (x < L && steps < 200000) {
      const ax = (-E_CHARGE * vy * B) / M_ELECTRON;
      const ay = (-E_CHARGE * E_field + E_CHARGE * vx * B) / M_ELECTRON;
      vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt; steps++;
      if (Math.abs(y) >= halfGap_m) {
        const px = plate_x0 + (x / L) * (plate_x1 - plate_x0);
        const py = emitter_y + y * 100 * cmToPx;
        pts.push(`L ${px},${py}`); struck = true; break;
      }
      if (x >= nextSample) {
        const px = plate_x0 + (x / L) * (plate_x1 - plate_x0);
        const py = emitter_y + y * 100 * cmToPx;
        pts.push(`L ${px},${py}`); nextSample += L / sample;
      }
    }
    if (!struck) {
      // straight after the plates at exit slope, to the wall
      const yExit_px = y * 100 * cmToPx;
      const slope = vy / vx;
      const xEnd = bulb_cx + bulb_r;
      const yEnd = emitter_y + yExit_px + slope * (xEnd - plate_x1);
      pts.push(`L ${plate_x1},${emitter_y + yExit_px}`);
      pts.push(`L ${xEnd},${yEnd}`);
    }
    return pts.join(" ");
  })();

  const filamentColor = (() => {
    const cold = [0x40, 0x38, 0x32], hot = [0xff, 0x8a, 0x3a], p = heaterPower;
    const rgb = cold.map((c, i) => Math.round(c + (hot[i] - c) * p));
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  })();

  const platesLive = beamFormed && Vd > 0;
  const coilsLive = I > 0;
  // crossed-fields wiring: TOP +, BOTTOM −
  const topSign = "+", botSign = "−";

  // impact point (if struck)
  const impact = (() => {
    if (!hitsPlate || !traj) return null;
    const px = plate_x0 + traj.frac * (plate_x1 - plate_x0);
    const py = emitter_y + traj.yExit_m * 100 * cmToPx;
    return { px, py };
  })();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", maxHeight: "100%", background: "#0a0d16", borderRadius: "10px" }}>
      <defs>
        <radialGradient id="bulbGlassX" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#1a2030" /><stop offset="70%" stopColor="#121622" /><stop offset="100%" stopColor="#0c0f18" />
        </radialGradient>
        <linearGradient id="copperX" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a3818" /><stop offset="50%" stopColor="#c87038" /><stop offset="100%" stopColor="#7a3818" />
        </linearGradient>
        <clipPath id="bulbClipX"><circle cx={bulb_cx} cy={bulb_cy} r={bulb_r - 2} /></clipPath>
        <filter id="beamGlowAX" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" /></filter>
        <filter id="beamGlowBX" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6" /></filter>
        <filter id="filGlowX" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4" /></filter>
      </defs>

      {/* Coils — LIVE in this sub-lab (brightness tracks current) */}
      <g opacity={coilsLive ? 0.9 : 0.4}>
        <ellipse cx={coil_left_x} cy={bulb_cy} rx={coil_rx} ry={coil_ry} fill="url(#copperX)" stroke="#5a2810" strokeWidth="1" />
        <ellipse cx={coil_left_x} cy={bulb_cy} rx={coil_rx - 11} ry={coil_ry - 11} fill="#0a0d16" stroke="#3a2010" strokeWidth="0.5" />
        <text x={coil_left_x} y={bulb_cy + coil_ry + 18} textAnchor="middle" fill={coilsLive ? "#999" : "#777"} fontFamily={FONT} fontSize="10">Coil 1 · {coilsLive ? <tspan fill="#d97a3a" fontFamily={MONO} fontWeight="bold">{I.toFixed(2)} A</tspan> : "off"}</text>
        <ellipse cx={coil_right_x} cy={bulb_cy} rx={coil_rx} ry={coil_ry} fill="url(#copperX)" stroke="#5a2810" strokeWidth="1" />
        <ellipse cx={coil_right_x} cy={bulb_cy} rx={coil_rx - 11} ry={coil_ry - 11} fill="#0a0d16" stroke="#3a2010" strokeWidth="0.5" />
        <text x={coil_right_x} y={bulb_cy + coil_ry + 18} textAnchor="middle" fill={coilsLive ? "#999" : "#777"} fontFamily={FONT} fontSize="10">Coil 2 · {coilsLive ? <tspan fill="#d97a3a" fontFamily={MONO} fontWeight="bold">{I.toFixed(2)} A</tspan> : "off"}</text>
      </g>

      <circle cx={bulb_cx} cy={bulb_cy} r={bulb_r} fill="url(#bulbGlassX)" stroke="#34405a" strokeWidth="2" />

      {/* Plates (top +, bottom −) */}
      <g clipPath="url(#bulbClipX)">
        <line x1={plate_x0} y1={emitter_y} x2={plate_x1} y2={emitter_y} stroke="#3a4658" strokeWidth="0.6" strokeDasharray="3,4" opacity="0.45" />
        <rect x={plate_x0} y={plate_top_y - 4} width={plate_x1 - plate_x0} height="4" rx="1.5"
          fill={platesLive ? "#c43a2a" : "#3a4356"} stroke={platesLive ? "#e06a55" : "#56607a"} strokeWidth="0.8" />
        <text x={(plate_x0 + plate_x1) / 2} y={plate_top_y - 8} textAnchor="middle" fill={platesLive ? "#ff8a6a" : "#7a8498"} fontFamily={MONO} fontSize="13" fontWeight="bold">{topSign}</text>
        <rect x={plate_x0} y={plate_bot_y} width={plate_x1 - plate_x0} height="4" rx="1.5"
          fill={platesLive ? "#2a5ab0" : "#3a4356"} stroke={platesLive ? "#5a8ad8" : "#56607a"} strokeWidth="0.8" />
        <text x={(plate_x0 + plate_x1) / 2} y={plate_bot_y + 16} textAnchor="middle" fill={platesLive ? "#7aa8ff" : "#7a8498"} fontFamily={MONO} fontSize="13" fontWeight="bold">{botSign}</text>
      </g>

      {/* Force arrows at the beam when both fields on (E up, B down) */}
      {fieldsBoth && beamThrough && (
        <g clipPath="url(#bulbClipX)" opacity="0.8">
          {/* electric force up (toward + top) */}
          <line x1={plate_x0 - 14} y1={emitter_y} x2={plate_x0 - 14} y2={emitter_y - 16} stroke="#e06a55" strokeWidth="1.5" markerEnd="url(#arrUp)" />
          {/* magnetic force down */}
          <line x1={plate_x0 - 14} y1={emitter_y} x2={plate_x0 - 14} y2={emitter_y + 16} stroke="#5a8ad8" strokeWidth="1.5" markerEnd="url(#arrDn)" />
        </g>
      )}
      <defs>
        <marker id="arrUp" markerWidth="7" markerHeight="7" refX="3.5" refY="6" orient="auto"><path d="M3.5,0 L7,7 L0,7 Z" fill="#e06a55" /></marker>
        <marker id="arrDn" markerWidth="7" markerHeight="7" refX="3.5" refY="1" orient="auto"><path d="M3.5,7 L0,0 L7,0 Z" fill="#5a8ad8" /></marker>
      </defs>

      {/* Beam */}
      {beamPath && (
        <g clipPath="url(#bulbClipX)" opacity={beamOpacity}>
          <path d={beamPath} fill="none" stroke={gas.glow} strokeWidth="9" opacity="0.3" filter="url(#beamGlowAX)" />
          <path d={beamPath} fill="none" stroke={gas.mid} strokeWidth="3.5" opacity="0.7" filter="url(#beamGlowBX)" />
          <path d={beamPath} fill="none" stroke={gas.core} strokeWidth="1.3" opacity="0.95" />
          {impact && <circle cx={impact.px} cy={impact.py} r="4" fill="#ffd0a8" opacity="0.9" filter="url(#beamGlowBX)" />}
        </g>
      )}

      {/* Balance flash — subtle green halo along the straight beam when selected */}
      {balanced && (
        <g clipPath="url(#bulbClipX)" opacity="0.5">
          <line x1={plate_x1} y1={emitter_y} x2={bulb_cx + bulb_r} y2={emitter_y} stroke="#7be29b" strokeWidth="2.5" opacity="0.4" filter="url(#beamGlowBX)" />
        </g>
      )}

      {/* Electron source */}
      <g clipPath="url(#bulbClipX)">
        <rect x={stub_left_x} y={emitter_y - stub_h / 2} width={emitter_x - 20 - stub_left_x} height={stub_h} fill="#2a3548" stroke="#556680" strokeWidth="0.6" />
        <rect x={stub_left_x} y={emitter_y - stub_h / 2 + 1.5} width={emitter_x - 20 - stub_left_x} height="1.8" fill="#6a7488" opacity="0.55" />
        <path d={`M${emitter_x},${emitter_y - 19} L${emitter_x - 20},${emitter_y - 19} L${emitter_x - 20},${emitter_y + 19} L${emitter_x},${emitter_y + 19}`}
          fill="#1a2030" stroke="#aeb8c8" strokeWidth="1.4" strokeLinejoin="round" />
        <line x1={emitter_x} y1={emitter_y - 19} x2={emitter_x} y2={emitter_y - 5} stroke="#aeb8c8" strokeWidth="1.4" strokeLinecap="round" />
        <line x1={emitter_x} y1={emitter_y + 5} x2={emitter_x} y2={emitter_y + 19} stroke="#aeb8c8" strokeWidth="1.4" strokeLinecap="round" />
        {(() => {
          const fx = emitter_x - 13, amp = 5;
          const wire = `M${fx},${emitter_y - 12} L${fx + amp},${emitter_y - 8} L${fx},${emitter_y - 4} L${fx + amp},${emitter_y} L${fx},${emitter_y + 4} L${fx + amp},${emitter_y + 8} L${fx},${emitter_y + 12}`;
          return (
            <g>
              {heaterPower > 0 && (<>
                <ellipse cx={emitter_x - 10} cy={emitter_y} rx="11" ry="18" fill="#ff8030" opacity={0.16 * heaterPower} filter="url(#filGlowX)" />
                <path d={wire} fill="none" stroke="#ffb060" strokeWidth="2.6" strokeLinecap="round" opacity={0.55 * heaterPower} filter="url(#filGlowX)" />
              </>)}
              <path d={wire} fill="none" stroke={filamentColor} strokeWidth="1.2" strokeLinecap="round" />
              {heaterPower > 0 && <path d={wire} fill="none" stroke="#ffe8b0" strokeWidth="0.5" strokeLinecap="round" opacity={0.9 * heaterPower} />}
            </g>
          );
        })()}
        {beamFormed && (<>
          <circle cx={emitter_x} cy={emitter_y} r="4.5" fill={gas.mid} opacity={0.5 * beamOpacity} filter="url(#beamGlowBX)" />
          <circle cx={emitter_x} cy={emitter_y} r="2" fill={gas.core} opacity={0.9 * beamOpacity} />
        </>)}
        <text x={emitter_x - 10} y={emitter_y - 25} textAnchor="middle" fill="#8a94a4" fontFamily={FONT} fontSize="9" fontStyle="italic">Wehnelt</text>
      </g>

      {/* HUD */}
      <g fontFamily={MONO} fontSize="11">
        <text x="14" y="22" fill="#bbb">V = {V.toFixed(0)} V</text>
        <text x="14" y="38" fill="#bbb">V<tspan baselineShift="sub" fontSize="8">d</tspan> = {Vd.toFixed(0)} V</text>
        <text x="14" y="54" fill="#bbb">I = {I.toFixed(2)} A</text>
      </g>
      {coilsLive && (
        <g>
          <text x={W - 14} y={22} textAnchor="end" fontFamily={MONO} fontSize="11" fill="#d97a3a" fontWeight="bold">B = {(B0 * 1e4).toFixed(2)} G</text>
          <text x={W - 14} y={38} textAnchor="end" fontFamily={FONT} fontSize="9.5" fill="#788" fontStyle="italic">(out of page)</text>
        </g>
      )}

      {/* Balance banner */}
      {balanced && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#7be29b" fontFamily={FONT} fontSize="12.5" fontStyle="italic" fontWeight="bold">⚖ balanced — only v = E/B passes straight through</text>}

      {/* Status hints */}
      {!heaterOn && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#ff9a70" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Turn on the cathode heater to emit electrons.</text>}
      {heaterOn && !heaterReady && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#e0a830" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Cathode warming… ({Math.round(heaterPower * 100)}%)</text>}
      {heaterReady && V === 0 && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#7d6" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Raise the accelerating voltage to fire the beam.</text>}
      {heaterReady && V > 0 && !beamFormed && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#bda06a" fontFamily={FONT} fontSize="12" fontStyle="italic">▸ Voltage too low — {gas.name} won't glow yet.</text>}
      {beamFormed && !fieldsBoth && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#7d6" fontFamily={FONT} fontSize="11.5" fontStyle="italic">▸ Turn on BOTH the plate voltage and the coil current to cross the fields.</text>}
      {fieldsBoth && !balanced && !hitsPlate && <text x={bulb_cx} y={H - 14} textAnchor="middle" fill="#9aa" fontFamily={FONT} fontSize="11.5" fontStyle="italic">tune the accelerating voltage until the beam runs straight</text>}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  CROSSED FIT PLOT — V vs (E/B)²  (slope = 1/(2·e/m); balanced points on line)
// ═══════════════════════════════════════════════════════════════════════
function CrossedFitPlot({ dataPoints, previewPoint, previewBalanced, fit }) {
  const W = 1100, H = 200, padL = 92, padR = 28, padT = 16, padB = 42;
  const xs = [...dataPoints.map(p => p.x), ...(previewPoint ? [previewPoint.x] : [])];
  const ys = [...dataPoints.map(p => p.y), ...(previewPoint ? [previewPoint.y] : [])];
  const xMax = Math.max(...xs, 1e10) * 1.08;
  const yMax = Math.max(...ys, 1) * 1.12;
  const xMin = -0.08 * xMax, yMin = -0.08 * yMax;
  const sx = x => padL + ((x - xMin) / (xMax - xMin)) * (W - padL - padR);
  const sy = y => (H - padB) - ((y - yMin) / (yMax - yMin)) * (H - padT - padB);
  const x0 = sx(0), y0 = sy(0);

  return (
    <div style={{ flex: 1, padding: "14px 20px", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ fontSize: "11px", color: TEXT2, fontWeight: 600, marginBottom: "4px", fontFamily: FONT }}>
        Linear fit · V vs <InlineMath math="(E/B)^2" /> · slope = <InlineMath math="1/(2\,e/m)" />
        {fit && <span style={{ marginLeft: "12px", fontFamily: MONO, color: ACCENT }}>e/m = {(fit.emFit / 1e11).toFixed(3)} × 10¹¹ C/kg</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", flex: 1, minHeight: 0 }}>
        {(() => {
          const nTicks = 5, out = [];
          for (let i = 0; i <= nTicks; i++) {
            const fx = i / nTicks, xv = fx * xMax, yv = fx * yMax, px = sx(xv), py = sy(yv);
            out.push(<line key={`gx${i}`} x1={px} y1={padT} x2={px} y2={H - padB} stroke="#eef0f2" strokeWidth="1" />);
            out.push(<text key={`tx${i}`} x={px} y={H - padB + 16} textAnchor="middle" fontFamily={MONO} fontSize="11" fill={TEXT2}>{xv === 0 ? "0" : xv.toExponential(1)}</text>);
            out.push(<line key={`gy${i}`} x1={padL} y1={py} x2={W - padR} y2={py} stroke="#eef0f2" strokeWidth="1" />);
            if (i > 0) out.push(<text key={`ty${i}`} x={padL - 8} y={py + 4} textAnchor="end" fontFamily={MONO} fontSize="11" fill={TEXT2}>{yv.toFixed(0)}</text>);
          }
          return out;
        })()}
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="none" stroke="#dfe2e6" strokeWidth="1" />
        <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke="#9aa0a8" strokeWidth="1.5" />
        <line x1={x0} y1={padT} x2={x0} y2={H - padB} stroke="#9aa0a8" strokeWidth="1.5" />
        <circle cx={x0} cy={y0} r="2.5" fill="#9aa0a8" />
        <text x={x0 - 5} y={y0 + 14} textAnchor="end" fontFamily={MONO} fontSize="10" fill={TEXT2}>0</text>
        <text x={(padL + W - padR) / 2} y={H - 6} textAnchor="middle" fontFamily={MONO} fontSize="12" fill={TEXT1}>(E / B)²  (m²·s⁻²)</text>
        <text x={24} y={(padT + H - padB) / 2} textAnchor="middle" fontFamily={MONO} fontSize="12" fill={TEXT1} transform={`rotate(-90 24 ${(padT + H - padB) / 2})`}>V  (volts)</text>

        {fit && (
          <line x1={sx(xMin)} y1={sy(fit.slope * xMin + fit.intercept)} x2={sx(xMax)} y2={sy(fit.slope * xMax + fit.intercept)} stroke={ACCENT} strokeWidth="2" opacity="0.85" />
        )}

        {/* recorded points — drawn identically regardless of balance state (the
            line is the only teacher: balanced points fall on it, others scatter) */}
        {dataPoints.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={ACCENT} />)}
        {previewPoint && <circle cx={sx(previewPoint.x)} cy={sy(previewPoint.y)} r="4" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="2,2" />}

        {dataPoints.length === 0 && !previewPoint && (
          <text x={(padL + W - padR) / 2} y={(padT + H - padB) / 2} textAnchor="middle" fontFamily={FONT} fontSize="14" fill="#b0b0b6" fontStyle="italic">
            Balance the beam, record points, then press "Fit line"
          </text>
        )}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  GUIDE CONTENT — Crossed Fields
// ═══════════════════════════════════════════════════════════════════════
const CROSSED_GUIDE = [
  {
    title: "Two forces, one beam",
    desc: "This experiment runs the magnetic field *and* the electric field at the same time, wired so they push the beam in *opposite* directions. The magnetic force pushes one way; the electric force pushes the other. This is exactly the apparatus J.J. Thomson used in 1897.",
    action: "Turn on the heater and raise the accelerating voltage until the beam appears. Then switch on *both* the plate voltage and the coil current.",
  },
  {
    title: "Only one speed survives",
    desc: "The electric force $eE$ is the same for every electron. But the magnetic force $evB$ depends on *speed*. So there is exactly one speed where they cancel: $eE = evB \\Rightarrow v = E/B$. Faster electrons feel too much magnetic force and bend one way; slower electrons are dominated by the electric force and bend the other. Only the matched speed flies straight.",
    action: "With both fields on, sweep the accelerating voltage up and down. Watch the beam swing from bending one way, through dead-straight, to bending the other.",
  },
  {
    title: "Straight means selected",
    desc: "When the beam runs perfectly straight, you know its speed exactly: $v = E/B = V_d/(d\\,B)$ — built only from things you set. This is a *velocity selector*: it picks one speed out of the beam and tells you what that speed is.",
    action: "Tune the accelerating voltage until the beam is straight. Read the selected speed in the panel — that's the velocity selector at work.",
  },
  {
    title: "Recovering e/m — Thomson's method",
    desc: "Now you have two facts about the same electrons: their speed $v = E/B$ (from balance) and the voltage that accelerated them, $eV = \\tfrac12 m v^2$. Combine them and the charge-to-mass ratio falls out. Rearranged for a fit, the balance condition reads $$V = \\dfrac{1}{2(e/m)}\\left(\\dfrac{E}{B}\\right)^2$$ so plotting the accelerating voltage $V$ against $(E/B)^2$ for several *balanced* settings gives a straight line through the origin whose slope is $1/(2\\,e/m)$.",
    action: "Balance the beam, press *Record point*, then change the plate voltage or current, re-balance, and record again. After a few balanced points press *Fit line* — the slope gives $e/m$. Points you record while the beam is *not* balanced won't lie on the line.",
  },
  {
    title: "Why you must keep the current low",
    desc: "Here's the catch that trips people up: the balance only lands at a *visible* accelerating voltage when the coil current is fairly *low*. Crank the current up and the balance voltage drops below the gas's glow threshold; turn it too low and the balance shoots past 1000 V. This is the opposite instinct from the first experiment, where more current gave a tighter, cleaner circle.",
    action: "Try to balance at high current — notice the balance voltage falls out of the visible range. Then drop to a few tenths of an amp and find the balance comfortably on-scale.",
  },
];
