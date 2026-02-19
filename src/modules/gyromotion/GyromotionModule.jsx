/**
 * LATERNA — Module 1: Gyromotion (v2)
 * =====================================
 * Single Particle Motion in Uniform Magnetic Field
 * 
 * Physics: Boris pusher in SI units (validated against analytical)
 * Layout: 3D viewport (left) | compact control panel (right) | tabbed plot strip (bottom)
 * Tutorial: 5-step modal with skip option
 * 
 * Paste into App.jsx and run with: npm run dev
 * Requires: react, three (npm install three)
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ════════════════════════════════════════════════════════════
// 1. PHYSICAL CONSTANTS & PARTICLE DATA
// ════════════════════════════════════════════════════════════

const Q_E = 1.602176634e-19;
const M_E = 9.1093837015e-31;
const M_P = 1.67262192369e-27;
const EV_TO_J = Q_E;

const PARTICLES = {
  electron: { mass: M_E, charge: -Q_E, symbol: 'e⁻', color: '#2563eb', threeColor: 0x2563eb },
  proton:   { mass: M_P, charge:  Q_E, symbol: 'H⁺', color: '#dc2626', threeColor: 0xdc2626 },
};

// ════════════════════════════════════════════════════════════
// 2. PHYSICS FUNCTIONS (validated Python port)
// ════════════════════════════════════════════════════════════

function computePhysics(species, B0, energyEV, pitchDeg) {
  const p = PARTICLES[species];
  const m = p.mass;
  const q = p.charge;
  const v = Math.sqrt(2 * energyEV * EV_TO_J / m);
  const alpha = pitchDeg * Math.PI / 180;
  const vPerp = v * Math.sin(alpha);
  const vPar = v * Math.cos(alpha);
  const omegaCSigned = q * B0 / m;
  const omegaC = Math.abs(omegaCSigned);
  const fC = omegaC / (2 * Math.PI);
  const rL = (omegaC > 0 && vPerp > 0) ? m * vPerp / (Math.abs(q) * B0) : 0;
  const Tc = omegaC > 0 ? 2 * Math.PI / omegaC : Infinity;
  const zPerGyration = vPar * Tc;
  return { v, vPerp, vPar, omegaC, omegaCSigned, fC, rL, Tc, zPerGyration };
}

function borisStep(pos, vel, q, m, B0, dt) {
  const qdt2m = q * dt / (2 * m);
  const tz = qdt2m * B0;
  const tMag2 = tz * tz;
  const sz = 2 * tz / (1 + tMag2);
  const vmx = vel[0], vmy = vel[1], vmz = vel[2];
  const vpx = vmx + vmy * tz;
  const vpy = vmy - vmx * tz;
  const vpz = vmz;
  const vPlusx = vmx + vpy * sz;
  const vPlusy = vmy - vpx * sz;
  const vPlusz = vmz;
  return {
    pos: [pos[0] + vPlusx * dt, pos[1] + vPlusy * dt, pos[2] + vPlusz * dt],
    vel: [vPlusx, vPlusy, vPlusz],
  };
}

function getInitialConditions(species, B0, energyEV, pitchDeg) {
  const p = PARTICLES[species];
  const m = p.mass;
  const q = p.charge;
  const v = Math.sqrt(2 * energyEV * EV_TO_J / m);
  const alpha = pitchDeg * Math.PI / 180;
  const vPerp = v * Math.sin(alpha);
  const vPar = v * Math.cos(alpha);
  const omegaCSigned = q * B0 / m;
  const rL = (Math.abs(omegaCSigned) > 0 && vPerp > 0) ? m * vPerp / (Math.abs(q) * B0) : 0;
  const pos = [rL, 0, 0];
  const vyInit = rL > 0 ? -rL * omegaCSigned : 0;
  return { pos, vel: [0, vyInit, vPar] };
}

// ════════════════════════════════════════════════════════════
// 3. FORMATTING HELPERS
// ════════════════════════════════════════════════════════════

function fmtLength(meters) {
  const abs = Math.abs(meters);
  if (abs === 0) return '0';
  if (abs >= 1) return `${meters.toPrecision(3)} m`;
  if (abs >= 1e-2) return `${(meters * 1e2).toPrecision(3)} cm`;
  if (abs >= 1e-5) return `${(meters * 1e3).toPrecision(3)} mm`;
  return `${(meters * 1e6).toPrecision(3)} μm`;
}

function fmtFreq(hz) {
  if (hz >= 1e9) return `${(hz * 1e-9).toPrecision(4)} GHz`;
  if (hz >= 1e6) return `${(hz * 1e-6).toPrecision(4)} MHz`;
  if (hz >= 1e3) return `${(hz * 1e-3).toPrecision(4)} kHz`;
  return `${hz.toPrecision(3)} Hz`;
}

function fmtVelocity(ms) {
  const abs = Math.abs(ms);
  if (abs >= 1e6) return `${(ms * 1e-6).toPrecision(3)} ×10⁶ m/s`;
  if (abs >= 1e3) return `${(ms * 1e-3).toPrecision(3)} km/s`;
  return `${ms.toPrecision(3)} m/s`;
}

function fmtTime(s) {
  if (!isFinite(s)) return '∞';
  if (s >= 1) return `${s.toPrecision(3)} s`;
  if (s >= 1e-3) return `${(s * 1e3).toPrecision(3)} ms`;
  if (s >= 1e-6) return `${(s * 1e6).toPrecision(3)} μs`;
  if (s >= 1e-9) return `${(s * 1e9).toPrecision(3)} ns`;
  return `${(s * 1e12).toPrecision(3)} ps`;
}

// ════════════════════════════════════════════════════════════
// 4. SUBSCRIPT/SUPERSCRIPT HELPER COMPONENTS
// ════════════════════════════════════════════════════════════

const Sub = ({ children }) => <sub style={{ fontSize: '0.75em', verticalAlign: 'sub', lineHeight: 0 }}>{children}</sub>;
const Sup = ({ children }) => <sup style={{ fontSize: '0.75em', verticalAlign: 'super', lineHeight: 0 }}>{children}</sup>;

// Common formatted variable names
const RL = () => <span>r<Sub>L</Sub></span>;
const FC = () => <span>f<Sub>c</Sub></span>;
const TC = () => <span>T<Sub>c</Sub></span>;
const WC = () => <span>ω<Sub>c</Sub></span>;
const B0Label = () => <span>B<Sub>0</Sub></span>;
const VPerp = () => <span>v<Sub>⊥</Sub></span>;
const VPar = () => <span>v<Sub>∥</Sub></span>;
const DeltaZ = () => <span>Δz</span>;

// ════════════════════════════════════════════════════════════
// 5. TUTORIAL CONTENT
// ════════════════════════════════════════════════════════════

const TUTORIAL_STEPS = [
  {
    title: 'What is Gyromotion?',
    content: () => (
      <span>
        Charged particles in magnetic fields don't travel in straight lines — they spiral. 
        This is the most fundamental motion in plasma physics. It explains how fusion reactors 
        confine plasma, why auroras appear at Earth's poles, and how particles behave in space 
        and industrial plasmas. In this module, you'll explore this motion by controlling real 
        physical parameters in SI units.
      </span>
    ),
  },
  {
    title: 'The Lorentz Force',
    content: () => (
      <span>
        A magnetic field exerts a force <b>F</b> = q(<b>v</b>×<b>B</b>) on a moving charge. 
        This force is always perpendicular to the velocity — it bends the trajectory without 
        changing the particle's speed. The result is circular motion in the plane perpendicular 
        to <b>B</b>. Watch the electron trace out its helical path in the viewport.
      </span>
    ),
  },
  {
    title: () => <span>Larmor Radius & Cyclotron Frequency</span>,
    content: () => (
      <span>
        The gyration circle has radius <RL /> = m<VPerp />/|q|B (Larmor radius) and the particle 
        completes each orbit at frequency <WC /> = |q|B/m (cyclotron frequency). Try dragging 
        the <B0Label /> slider — watch the orange Larmor circle shrink as you increase the field, 
        and see the "you are here" dot move on the plots below.
      </span>
    ),
  },
  {
    title: 'Pitch Angle',
    content: () => (
      <span>
        The pitch angle α splits the velocity into components perpendicular 
        (<VPerp /> = v sin α) and parallel (<VPar /> = v cos α) to the magnetic field. 
        At α = 90° you get a pure circle with no axial motion. At α = 0° the particle 
        streams straight along <b>B</b> with no gyration. Try the extremes and everything in between.
      </span>
    ),
  },
  {
    title: 'Electron vs. Proton',
    content: () => (
      <span>
        Switch between electron (e⁻) and proton (H⁺) at the same energy. The proton orbit 
        is ~43× larger because <RL /> ∝ √m at fixed energy. The cyclotron frequency differs 
        by a factor of ~1836 (the mass ratio m<Sub>p</Sub>/m<Sub>e</Sub>). This is why electrons 
        and ions behave so differently in plasmas — they gyrate on completely different spatial 
        and temporal scales.
      </span>
    ),
  },
];

// ════════════════════════════════════════════════════════════
// 6. PLOT DEFINITIONS (3 tab groups)
// ════════════════════════════════════════════════════════════

const PLOT_TABS = [
  {
    id: 'rL',
    label: () => <span>r<Sub>L</Sub></span>,
    labelText: 'rL',
    plots: [
      {
        id: 'rL_vs_B', titleJSX: () => <span>r<Sub>L</Sub> vs B<Sub>0</Sub></span>,
        xLabel: 'B₀ [T]', yLabel: 'rL', color: '#E8650A', fmtY: fmtLength,
        compute: (sp, E, alpha) => {
          const xs = [], ys = [];
          for (let B = 0.01; B <= 1.005; B += 0.005) { xs.push(B); ys.push(computePhysics(sp, B, E, alpha).rL); }
          return { xs, ys };
        },
        getMarkerX: (B0) => B0,
        getMarkerY: (phys) => phys.rL,
      },
      {
        id: 'rL_vs_E', titleJSX: () => <span>r<Sub>L</Sub> vs Energy</span>,
        xLabel: 'E [eV]', yLabel: 'rL', color: '#16a34a', fmtY: fmtLength,
        compute: (sp, E, alpha, B0) => {
          const xs = [], ys = [];
          for (let e = 1; e <= 100; e += 0.5) { xs.push(e); ys.push(computePhysics(sp, B0, e, alpha).rL); }
          return { xs, ys };
        },
        getMarkerX: (_, E) => E,
        getMarkerY: (phys) => phys.rL,
      },
      {
        id: 'rL_vs_alpha', titleJSX: () => <span>r<Sub>L</Sub> vs α</span>,
        xLabel: 'α [°]', yLabel: 'rL', color: '#9333ea', fmtY: fmtLength,
        compute: (sp, E, alpha, B0) => {
          const xs = [], ys = [];
          for (let a = 0; a <= 90; a += 1) { xs.push(a); ys.push(computePhysics(sp, B0, E, a).rL); }
          return { xs, ys };
        },
        getMarkerX: (_, __, alpha) => alpha,
        getMarkerY: (phys) => phys.rL,
      },
    ],
  },
  {
    id: 'fc',
    label: () => <span>f<Sub>c</Sub></span>,
    labelText: 'fc',
    plots: [
      {
        id: 'fc_vs_B', titleJSX: () => <span>f<Sub>c</Sub> vs B<Sub>0</Sub></span>,
        xLabel: 'B₀ [T]', yLabel: 'fc', color: '#2563eb', fmtY: fmtFreq,
        compute: (sp, E, alpha) => {
          const xs = [], ys = [];
          for (let B = 0.01; B <= 1.005; B += 0.005) { xs.push(B); ys.push(computePhysics(sp, B, E, alpha).fC); }
          return { xs, ys };
        },
        getMarkerX: (B0) => B0,
        getMarkerY: (phys) => phys.fC,
      },
      {
        id: 'Tc_vs_B', titleJSX: () => <span>T<Sub>c</Sub> vs B<Sub>0</Sub></span>,
        xLabel: 'B₀ [T]', yLabel: 'Tc', color: '#0891b2', fmtY: fmtTime,
        compute: (sp, E, alpha) => {
          const xs = [], ys = [];
          for (let B = 0.01; B <= 1.005; B += 0.005) { xs.push(B); ys.push(computePhysics(sp, B, E, alpha).Tc); }
          return { xs, ys };
        },
        getMarkerX: (B0) => B0,
        getMarkerY: (phys) => phys.Tc,
      },
    ],
  },
  {
    id: 'vel',
    label: () => <span>v, Δz</span>,
    labelText: 'v, Δz',
    plots: [
      {
        id: 'vperp_vs_alpha', titleJSX: () => <span><VPerp /> vs α</span>,
        xLabel: 'α [°]', yLabel: 'v⊥', color: '#dc2626', fmtY: fmtVelocity,
        compute: (sp, E, alpha, B0) => {
          const xs = [], ys = [];
          for (let a = 0; a <= 90; a += 1) { xs.push(a); ys.push(computePhysics(sp, B0, E, a).vPerp); }
          return { xs, ys };
        },
        getMarkerX: (_, __, alpha) => alpha,
        getMarkerY: (phys) => phys.vPerp,
      },
      {
        id: 'vpar_vs_alpha', titleJSX: () => <span><VPar /> vs α</span>,
        xLabel: 'α [°]', yLabel: 'v∥', color: '#2563eb', fmtY: fmtVelocity,
        compute: (sp, E, alpha, B0) => {
          const xs = [], ys = [];
          for (let a = 0; a <= 90; a += 1) { xs.push(a); ys.push(computePhysics(sp, B0, E, a).vPar); }
          return { xs, ys };
        },
        getMarkerX: (_, __, alpha) => alpha,
        getMarkerY: (phys) => phys.vPar,
      },
      {
        id: 'dz_vs_alpha', titleJSX: () => <span>Δz/gyration vs α</span>,
        xLabel: 'α [°]', yLabel: 'Δz', color: '#0891b2', fmtY: fmtLength,
        compute: (sp, E, alpha, B0) => {
          const xs = [], ys = [];
          for (let a = 0; a <= 90; a += 1) { xs.push(a); ys.push(computePhysics(sp, B0, E, a).zPerGyration); }
          return { xs, ys };
        },
        getMarkerX: (_, __, alpha) => alpha,
        getMarkerY: (phys) => phys.zPerGyration,
      },
    ],
  },
];

// ════════════════════════════════════════════════════════════
// 7. CANVAS PLOT RENDERER
// ════════════════════════════════════════════════════════════

function drawPlot(canvas, plotDef, data, markerX, markerY) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const pad = { top: 8, right: 12, bottom: 34, left: 12 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, w, h);

  const { xs, ys } = data;
  if (!xs || xs.length < 2) return;

  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMax === yMin) { yMax = yMin + 1; }
  const yPad = (yMax - yMin) * 0.08;
  yMin = Math.min(...ys) >= 0 ? Math.max(0, yMin - yPad) : yMin - yPad;
  yMax += yPad;

  const toX = v => pad.left + (v - xMin) / (xMax - xMin) * pw;
  const toY = v => pad.top + ph - (v - yMin) / (yMax - yMin) * ph;

  // Grid
  ctx.strokeStyle = '#ECECEC';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const gy = pad.top + (ph / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(pad.left + pw, gy); ctx.stroke();
  }

  // Curve
  ctx.strokeStyle = plotDef.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  xs.forEach((x, i) => {
    const px = toX(x), py = toY(ys[i]);
    if (!isFinite(py)) return;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Marker
  if (markerX >= xMin && markerX <= xMax && isFinite(markerY)) {
    const mx = toX(markerX);
    const my = toY(markerY);

    // Dashed vertical
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(mx, pad.top); ctx.lineTo(mx, pad.top + ph); ctx.stroke();
    ctx.setLineDash([]);

    // Dot
    ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fillStyle = plotDef.color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }

  // X axis label
  ctx.fillStyle = '#999';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(plotDef.xLabel, pad.left + pw / 2, h - 4);

  // X axis ticks
  ctx.fillStyle = '#BBB';
  ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(fmtTickVal(xMin), pad.left, h - 16);
  ctx.textAlign = 'right';
  ctx.fillText(fmtTickVal(xMax), pad.left + pw, h - 16);

  // Current value (formatted)
  if (markerY !== undefined && isFinite(markerY) && plotDef.fmtY) {
    ctx.fillStyle = plotDef.color;
    ctx.font = 'bold 10px "SF Mono", "Fira Code", "Menlo", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(plotDef.fmtY(markerY), w - 6, 16);
  }
}

function fmtTickVal(v) {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toPrecision(2);
  if (Math.abs(v) >= 0.01) return v.toPrecision(2);
  return v.toExponential(0);
}

// ════════════════════════════════════════════════════════════
// 8. GLOBAL CSS (injected once)
// ════════════════════════════════════════════════════════════

const GLOBAL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; overflow: hidden; }

  /* Custom range slider */
  input[type="range"].laterna-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 20px; background: transparent;
    cursor: pointer; outline: none; margin: 0;
  }
  input[type="range"].laterna-slider::-webkit-slider-runnable-track {
    height: 4px; border-radius: 2px;
    background: #E0E0E0;
  }
  input[type="range"].laterna-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; border-radius: 50%;
    background: #E8650A; border: 2.5px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    margin-top: -6px; /* center on track */
    transition: transform 0.1s ease;
  }
  input[type="range"].laterna-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }
  input[type="range"].laterna-slider::-webkit-slider-thumb:active {
    transform: scale(1.05);
    box-shadow: 0 0 0 4px rgba(232,101,10,0.15);
  }
  input[type="range"].laterna-slider::-moz-range-track {
    height: 4px; border-radius: 2px; background: #E0E0E0; border: none;
  }
  input[type="range"].laterna-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%;
    background: #E8650A; border: 2.5px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  }
  input[type="range"].laterna-slider::-moz-range-progress {
    height: 4px; border-radius: 2px; background: #E8650A;
  }
`;

// ════════════════════════════════════════════════════════════
// 9. MAIN COMPONENT
// ════════════════════════════════════════════════════════════

export default function GyromotionModule() {
  const [species, setSpecies] = useState('electron');
  const [B0, setB0] = useState(0.1);
  const [energyEV, setEnergyEV] = useState(10);
  const [pitchDeg, setPitchDeg] = useState(45);
  const [playing, setPlaying] = useState(true);
  const [showPlots, setShowPlots] = useState(false);
  const [plotTab, setPlotTab] = useState('rL');
  const [ghostEnabled, setGhostEnabled] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showTutorial, setShowTutorial] = useState(true);

  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animFrameRef = useRef(null);
  const trajectoryRef = useRef(null);
  const ghostTrailRef = useRef(null);
  const larmorCircleRef = useRef(null);
  const particleDotRef = useRef(null);
  const plotCanvasRefs = useRef([]);
  const simStateRef = useRef({ pos: [0, 0, 0], vel: [0, 0, 0], points: [], step: 0 });
  const paramsRef = useRef({ species, B0, energyEV, pitchDeg });
  const playingRef = useRef(playing);
  const prevParamsRef = useRef(null);
  const cssInjectedRef = useRef(false);

  useEffect(() => { playingRef.current = playing; }, [playing]);

  useEffect(() => {
    const oldParams = paramsRef.current;
    paramsRef.current = { species, B0, energyEV, pitchDeg };
    if (ghostEnabled && prevParamsRef.current &&
        (oldParams.species !== species || oldParams.B0 !== B0 ||
         oldParams.energyEV !== energyEV || oldParams.pitchDeg !== pitchDeg)) {
      saveGhostTrail();
    }
    prevParamsRef.current = { species, B0, energyEV, pitchDeg };
    resetSimulation();
  }, [species, B0, energyEV, pitchDeg]);

  const physics = useMemo(
    () => computePhysics(species, B0, energyEV, pitchDeg),
    [species, B0, energyEV, pitchDeg]
  );

  // ---- Simulation ----
  const resetSimulation = useCallback(() => {
    const p = paramsRef.current;
    const ic = getInitialConditions(p.species, p.B0, p.energyEV, p.pitchDeg);
    simStateRef.current = { pos: ic.pos, vel: ic.vel, points: [ic.pos.slice()], step: 0 };
    if (controlsRef.current) controlsRef.current.target.z = 0;
    updateTrajectoryLine();
    updateLarmorCircle();
    updateParticleDot();
  }, []);

  const saveGhostTrail = useCallback(() => {
    const ghost = ghostTrailRef.current;
    if (!ghost) return;
    const points = simStateRef.current.points;
    if (points.length < 2) return;
    const prev = prevParamsRef.current;
    const prevPhys = computePhysics(prev.species, prev.B0, prev.energyEV, prev.pitchDeg);
    const scale = prevPhys.rL > 0 ? 1 / prevPhys.rL : 1;
    const positions = new Float32Array(points.length * 3);
    points.forEach((pt, i) => {
      positions[i * 3] = pt[0] * scale;
      positions[i * 3 + 1] = pt[1] * scale;
      positions[i * 3 + 2] = pt[2] * scale;
    });
    ghost.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    ghost.geometry.setDrawRange(0, points.length);
    ghost.geometry.computeBoundingSphere();
    ghost.visible = true;
    ghost.material.color.set(PARTICLES[prev.species].threeColor);
  }, []);

  const clearGhostTrail = useCallback(() => {
    if (ghostTrailRef.current) ghostTrailRef.current.visible = false;
  }, []);

  // ---- Three.js object updates ----
  const updateTrajectoryLine = useCallback(() => {
    const line = trajectoryRef.current;
    if (!line) return;
    const points = simStateRef.current.points;
    const p = paramsRef.current;
    const phys = computePhysics(p.species, p.B0, p.energyEV, p.pitchDeg);
    const scale = phys.rL > 0 ? 1 / phys.rL : (phys.Tc * phys.vPar > 0 ? 1 / (phys.Tc * phys.vPar) : 1);
    const n = Math.min(points.length, 50000);
    const positions = line.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      positions[i * 3] = points[i][0] * scale;
      positions[i * 3 + 1] = points[i][1] * scale;
      positions[i * 3 + 2] = points[i][2] * scale;
    }
    line.geometry.setDrawRange(0, n);
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.material.color.set(PARTICLES[p.species].threeColor);
  }, []);

  const updateLarmorCircle = useCallback(() => {
    const circle = larmorCircleRef.current;
    if (!circle) return;
    const p = paramsRef.current;
    const phys = computePhysics(p.species, p.B0, p.energyEV, p.pitchDeg);
    const segments = 64;
    const positions = circle.geometry.attributes.position.array;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      positions[i * 3] = Math.cos(theta);
      positions[i * 3 + 1] = Math.sin(theta);
      positions[i * 3 + 2] = 0;
    }
    circle.geometry.attributes.position.needsUpdate = true;
    circle.geometry.computeBoundingSphere();
    const pts = simStateRef.current.points;
    const scale = phys.rL > 0 ? 1 / phys.rL : 1;
    if (pts.length > 0) circle.position.set(0, 0, pts[pts.length - 1][2] * scale);
    circle.visible = phys.rL > 0;
  }, []);

  const updateParticleDot = useCallback(() => {
    const dot = particleDotRef.current;
    if (!dot) return;
    const pts = simStateRef.current.points;
    const p = paramsRef.current;
    const phys = computePhysics(p.species, p.B0, p.energyEV, p.pitchDeg);
    const scale = phys.rL > 0 ? 1 / phys.rL : (phys.Tc * phys.vPar > 0 ? 1 / (phys.Tc * phys.vPar) : 1);
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      dot.position.set(last[0] * scale, last[1] * scale, last[2] * scale);
    }
    dot.material.color.set(PARTICLES[p.species].threeColor);
  }, []);

  // ---- Three.js setup ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (!cssInjectedRef.current) {
      const styleEl = document.createElement('style');
      styleEl.textContent = GLOBAL_CSS;
      document.head.appendChild(styleEl);
      cssInjectedRef.current = true;
    }

    const w = mount.clientWidth, h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#FAFAFA');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000);
    camera.position.set(4, 3, 5);
    camera.lookAt(0, 0, 2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 2);
    controls.update();
    controlsRef.current = controls;

    // Axes
    const axisGroup = new THREE.Group();
    const axisLen = 2.5;
    const axisColors = [0xcc3333, 0x33aa33, 0x3366cc];
    const axisLabels = ['X', 'Y', 'Z'];
    const dirs = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];

    dirs.forEach((dir, i) => {
      const geoP = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(axisLen)]);
      axisGroup.add(new THREE.Line(geoP, new THREE.LineBasicMaterial({ color: axisColors[i], opacity: 0.5, transparent: true })));
      const geoN = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(-axisLen)]);
      const matN = new THREE.LineDashedMaterial({ color: axisColors[i], opacity: 0.25, transparent: true, dashSize: 0.15, gapSize: 0.1 });
      const lineN = new THREE.Line(geoN, matN); lineN.computeLineDistances();
      axisGroup.add(lineN);

      [1, -1].forEach(sign => {
        const c = document.createElement('canvas'); c.width = 48; c.height = 48;
        const cx = c.getContext('2d');
        cx.fillStyle = ['#cc3333','#33aa33','#3366cc'][i];
        cx.font = 'bold 30px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText((sign > 0 ? '+' : '−') + axisLabels[i], 24, 24);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.6 }));
        sp.scale.set(0.5, 0.5, 1);
        sp.position.copy(dir.clone().multiplyScalar(sign * (axisLen + 0.3)));
        axisGroup.add(sp);
      });
    });

    // B label
    const bc = document.createElement('canvas'); bc.width = 72; bc.height = 28;
    const bx = bc.getContext('2d'); bx.fillStyle = '#3366cc'; bx.font = 'bold 18px sans-serif';
    bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.fillText('B ↑', 36, 14);
    const bSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0.5 }));
    bSp.scale.set(0.8, 0.3, 1); bSp.position.set(0, 0, axisLen + 0.7);
    axisGroup.add(bSp);
    scene.add(axisGroup);

    // Origin
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xaaaaaa, opacity: 0.4, transparent: true })
    ));

    // Grid
    const grid = new THREE.GridHelper(6, 12, 0xdddddd, 0xeeeeee);
    grid.rotation.x = Math.PI / 2; grid.material.opacity = 0.25; grid.material.transparent = true;
    scene.add(grid);

    // Trajectory line
    const maxPts = 50000;
    const trajGeo = new THREE.BufferGeometry();
    trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 3), 3));
    trajGeo.setDrawRange(0, 0);
    const trajLine = new THREE.Line(trajGeo, new THREE.LineBasicMaterial({ color: 0x2563eb }));
    scene.add(trajLine); trajectoryRef.current = trajLine;

    // Ghost trail
    const ghostGeo = new THREE.BufferGeometry();
    ghostGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 3), 3));
    ghostGeo.setDrawRange(0, 0);
    const ghostLine = new THREE.Line(ghostGeo, new THREE.LineBasicMaterial({ color: 0x888888, opacity: 0.25, transparent: true }));
    ghostLine.visible = false; scene.add(ghostLine); ghostTrailRef.current = ghostLine;

    // Larmor circle
    const circGeo = new THREE.BufferGeometry();
    circGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(65 * 3), 3));
    const circMat = new THREE.LineDashedMaterial({ color: 0xE8650A, opacity: 0.7, transparent: true, dashSize: 0.12, gapSize: 0.06 });
    const circLine = new THREE.Line(circGeo, circMat); circLine.computeLineDistances();
    scene.add(circLine); larmorCircleRef.current = circLine;

    // Particle dot
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x2563eb })
    );
    scene.add(dot); particleDotRef.current = dot;

    scene.add(new THREE.AmbientLight(0xffffff, 1));

    resetSimulation();

    // Animation
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (playingRef.current) {
        const p = paramsRef.current;
        const phys = computePhysics(p.species, p.B0, p.energyEV, p.pitchDeg);
        const particle = PARTICLES[p.species];
        const dt = phys.Tc / 900;
        const subSteps = 10;
        const sim = simStateRef.current;
        for (let s = 0; s < subSteps; s++) {
          const result = borisStep(sim.pos, sim.vel, particle.charge, particle.mass, p.B0, dt);
          sim.pos = result.pos; sim.vel = result.vel; sim.step++;
          if (sim.points.length < 50000) sim.points.push(sim.pos.slice());
        }
        updateTrajectoryLine(); updateLarmorCircle(); updateParticleDot();
        larmorCircleRef.current.computeLineDistances();

        // Camera z-tracking
        const pts = sim.points;
        if (pts.length > 0) {
          const sc = phys.rL > 0 ? 1 / phys.rL : (phys.Tc * phys.vPar > 0 ? 1 / (phys.Tc * phys.vPar) : 1);
          controls.target.z += (pts[pts.length - 1][2] * sc - controls.target.z) * 0.05;
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObs = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObs.observe(mount);

    return () => {
      resizeObs.disconnect();
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ---- Update plots when parameters or tab change ----
  useEffect(() => {
    if (!showPlots) return;
    const tab = PLOT_TABS.find(t => t.id === plotTab);
    if (!tab) return;
    tab.plots.forEach((plotDef, i) => {
      const canvas = plotCanvasRefs.current[i];
      if (!canvas) return;
      const data = plotDef.compute(species, energyEV, pitchDeg, B0);
      const mx = plotDef.getMarkerX(B0, energyEV, pitchDeg);
      const my = plotDef.getMarkerY(physics);
      drawPlot(canvas, plotDef, data, mx, my);
    });
  }, [species, B0, energyEV, pitchDeg, showPlots, plotTab, physics]);

  useEffect(() => { if (!ghostEnabled) clearGhostTrail(); }, [ghostEnabled]);

  const handleReset = () => { clearGhostTrail(); resetSimulation(); setPlaying(true); };

  const activeTab = PLOT_TABS.find(t => t.id === plotTab);

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={S.container}>
      <div style={S.main}>
        {/* VIEWPORT */}
        <div style={S.viewport} ref={mountRef}>
          <div style={S.badge}>B = {B0.toFixed(2)} T along +Z</div>
          <div style={S.scaleBadge}>⊘ <RL /> = {fmtLength(physics.rL)}</div>
          <button style={S.plotToggleBtn} onClick={() => setShowPlots(s => !s)}>
            {showPlots ? 'Hide Plots' : 'Show Plots'}
          </button>
        </div>

        {/* PANEL */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}>Module 1: Gyromotion</div>
            <div style={S.panelSub}>Uniform <b>B</b> field — Single particle motion</div>
          </div>

          {/* Species */}
          <div style={S.section}>
            <div style={S.secLabel}>Particle Species</div>
            <div style={S.toggleRow}>
              {['electron', 'proton'].map(sp => (
                <button key={sp} onClick={() => setSpecies(sp)}
                  style={{
                    ...S.toggleBtn,
                    background: species === sp ? (sp === 'electron' ? '#EBF2FF' : '#FFF1F1') : '#FAFAFA',
                    color: species === sp ? PARTICLES[sp].color : '#999',
                    fontWeight: species === sp ? 600 : 400,
                    borderColor: species === sp ? (sp === 'electron' ? '#c5d8f8' : '#f5c5c5') : '#E0E0E0',
                  }}
                >
                  {sp === 'electron' ? <>Electron (e<Sup>−</Sup>)</> : <>Proton (H<Sup>+</Sup>)</>}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div style={S.section}>
            <div style={S.secLabel}>Parameters</div>
            <SliderRow label={<><B0Label /> (magnetic field)</>} value={`${B0.toFixed(2)} T`}
              min={0.01} max={1} step={0.01} val={B0} onChange={setB0} />
            <SliderRow label="Energy" value={`${energyEV.toFixed(0)} eV`}
              min={1} max={100} step={1} val={energyEV} onChange={setEnergyEV} />
            <SliderRow label="Pitch angle α" value={`${pitchDeg}°`}
              min={0} max={90} step={1} val={pitchDeg} onChange={setPitchDeg} />
          </div>

          {/* Derived */}
          <div style={S.section}>
            <div style={S.secLabel}>Derived Quantities</div>
            <Readout label={<>Larmor radius <RL /></>} value={fmtLength(physics.rL)} />
            <Readout label={<>Cyclotron freq <FC /></>} value={fmtFreq(physics.fC)} />
            <Readout label={<>Cyclotron period <TC /></>} value={fmtTime(physics.Tc)} />
            <Readout label={<><VPerp /> (perpendicular)</>} value={fmtVelocity(physics.vPerp)} />
            <Readout label={<><VPar /> (parallel)</>} value={fmtVelocity(physics.vPar)} />
            <Readout label={<>Δz per gyration</>} value={physics.zPerGyration > 0 ? fmtLength(physics.zPerGyration) : '0'} />
          </div>

          {/* Ghost */}
          <div style={S.section}>
            <label style={S.checkLabel}>
              <input type="checkbox" checked={ghostEnabled} onChange={e => setGhostEnabled(e.target.checked)} />
              <span style={{ marginLeft: 6 }}>Ghost trail (compare on change)</span>
            </label>
          </div>

          {/* Controls */}
          <div style={S.btnRow}>
            <button style={S.btnPrimary} onClick={() => setPlaying(p => !p)}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button style={S.btnSecondary} onClick={handleReset}>↺ Reset</button>
            <button style={S.btnSecondary} onClick={() => { setShowTutorial(true); setTutorialStep(0); }}>
              ? Guide
            </button>
          </div>
        </div>
      </div>

      {/* PLOT STRIP */}
      {showPlots && (
        <div style={S.plotArea}>
          <div style={S.plotTabs}>
            {PLOT_TABS.map(tab => (
              <button key={tab.id} onClick={() => setPlotTab(tab.id)}
                style={{
                  ...S.plotTabBtn,
                  background: plotTab === tab.id ? '#fff' : 'transparent',
                  color: plotTab === tab.id ? '#E8650A' : '#888',
                  fontWeight: plotTab === tab.id ? 600 : 400,
                  borderBottom: plotTab === tab.id ? '2px solid #E8650A' : '2px solid transparent',
                }}
              >
                {tab.label()}
              </button>
            ))}
          </div>
          <div style={S.plotRow}>
            {activeTab && activeTab.plots.map((plotDef, i) => (
              <div key={plotDef.id} style={S.plotCell}>
                <div style={S.plotTitle}>{plotDef.titleJSX()}</div>
                <canvas ref={el => plotCanvasRefs.current[i] = el} style={S.plotCanvas} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TUTORIAL MODAL */}
      {showTutorial && tutorialStep >= 0 && tutorialStep < TUTORIAL_STEPS.length && (
        <div style={S.overlay} onClick={() => setShowTutorial(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalStep}>Step {tutorialStep + 1} of {TUTORIAL_STEPS.length}</div>
            <h3 style={S.modalTitle}>
              {typeof TUTORIAL_STEPS[tutorialStep].title === 'function'
                ? TUTORIAL_STEPS[tutorialStep].title()
                : TUTORIAL_STEPS[tutorialStep].title}
            </h3>
            <div style={S.modalBody}>
              {TUTORIAL_STEPS[tutorialStep].content()}
            </div>
            <div style={S.modalFoot}>
              <div style={S.dots}>
                {TUTORIAL_STEPS.map((_, i) => (
                  <div key={i} style={{ ...S.dot, background: i === tutorialStep ? '#E8650A' : '#ddd' }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button style={S.modalSkip} onClick={() => setShowTutorial(false)}>Skip</button>
                {tutorialStep > 0 && (
                  <button style={S.modalBtnSec} onClick={() => setTutorialStep(s => s - 1)}>Back</button>
                )}
                {tutorialStep < TUTORIAL_STEPS.length - 1 ? (
                  <button style={S.modalBtnPri} onClick={() => setTutorialStep(s => s + 1)}>Next</button>
                ) : (
                  <button style={S.modalBtnPri} onClick={() => setShowTutorial(false)}>Start Exploring</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════

function SliderRow({ label, value, min, max, step, val, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontSize: 12, color: '#444', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: '"SF Mono","Fira Code","Menlo",monospace', color: '#E8650A', fontWeight: 600 }}>{value}</span>
      </div>
      <input type="range" className="laterna-slider"
        min={min} max={max} step={step} value={val}
        onChange={e => onChange(+e.target.value)}
      />
    </div>
  );
}

function Readout({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid #F5F5F7' }}>
      <span style={{ color: '#777' }}>{label}</span>
      <span style={{ fontFamily: '"SF Mono","Fira Code","Menlo",monospace', fontWeight: 500, color: '#1A1A2E' }}>{value}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════

const S = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    background: '#F5F5F7', color: '#1A1A2E', overflow: 'hidden',
  },
  main: { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
  viewport: { flex: 1, position: 'relative', background: '#FAFAFA', minWidth: 0 },

  badge: {
    position: 'absolute', top: 14, left: 14,
    background: 'rgba(255,255,255,0.92)', borderRadius: 6, padding: '5px 10px',
    fontSize: 11, color: '#666', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    pointerEvents: 'none', backdropFilter: 'blur(4px)',
  },
  scaleBadge: {
    position: 'absolute', bottom: 14, left: 14,
    background: 'rgba(255,255,255,0.92)', borderRadius: 6, padding: '5px 10px',
    fontSize: 11, fontFamily: '"SF Mono","Fira Code","Menlo",monospace',
    color: '#333', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    pointerEvents: 'none', backdropFilter: 'blur(4px)',
  },
  plotToggleBtn: {
    position: 'absolute', bottom: 14, right: 14,
    background: 'rgba(255,255,255,0.95)', border: '1px solid #E0E0E0', borderRadius: 6,
    padding: '5px 14px', fontSize: 11, cursor: 'pointer', color: '#555',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', backdropFilter: 'blur(4px)',
  },

  panel: {
    width: 280, minWidth: 280, borderLeft: '1px solid #E5E5E8',
    background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column',
  },
  panelHead: { padding: '14px 16px 10px', borderBottom: '1px solid #EEEEF0' },
  panelTitle: { fontSize: 15, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.3 },
  panelSub: { fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 },

  section: { padding: '10px 16px', borderBottom: '1px solid #F2F2F4' },
  secLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#AAA', marginBottom: 8 },

  toggleRow: { display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden' },
  toggleBtn: {
    flex: 1, padding: '7px 0', border: '1px solid #E0E0E0', cursor: 'pointer',
    fontSize: 12, textAlign: 'center', background: '#FAFAFA', color: '#888',
    transition: 'all 0.15s',
  },

  checkLabel: { display: 'flex', alignItems: 'center', fontSize: 12, color: '#666', cursor: 'pointer' },

  btnRow: { display: 'flex', gap: 6, padding: '12px 16px', borderTop: '1px solid #EEEEF0', marginTop: 'auto' },
  btnPrimary: {
    flex: 1, padding: '7px 0', border: 'none', borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: '#E8650A', color: '#fff',
  },
  btnSecondary: {
    flex: 1, padding: '7px 0', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
    background: '#fff', color: '#555',
  },

  // Plot area
  plotArea: {
    borderTop: '1px solid #E5E5E8', background: '#fff',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
  },
  plotTabs: {
    display: 'flex', gap: 0, borderBottom: '1px solid #ECECEC',
    padding: '0 16px',
  },
  plotTabBtn: {
    padding: '8px 18px', border: 'none', cursor: 'pointer',
    fontSize: 12, background: 'transparent', color: '#888',
    borderBottom: '2px solid transparent', transition: 'all 0.15s',
  },
  plotRow: {
    display: 'flex', height: 180, overflow: 'hidden',
  },
  plotCell: {
    flex: 1, borderRight: '1px solid #F0F0F2', display: 'flex',
    flexDirection: 'column', minWidth: 0, padding: '0 0 8px',
  },
  plotTitle: {
    fontSize: 10, fontWeight: 600, color: '#555', textAlign: 'center',
    padding: '4px 0 2px', lineHeight: 1, flexShrink: 0,
  },
  plotCanvas: { flex: 1, width: '100%', display: 'block', minHeight: 0 },

  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(2px)',
  },
  modal: {
    background: '#fff', borderRadius: 12, padding: '24px 28px',
    maxWidth: 520, width: '92%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  modalStep: { fontSize: 10, fontWeight: 700, color: '#E8650A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#1A1A2E', margin: '0 0 10px', lineHeight: 1.3 },
  modalBody: { fontSize: 14, color: '#444', lineHeight: 1.7, margin: '0 0 18px' },
  modalFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  dots: { display: 'flex', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: '50%', transition: 'background 0.2s' },
  modalSkip: {
    padding: '6px 14px', border: 'none', borderRadius: 6,
    fontSize: 12, cursor: 'pointer', background: 'transparent', color: '#AAA',
  },
  modalBtnSec: {
    padding: '7px 18px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#555',
  },
  modalBtnPri: {
    padding: '7px 20px', border: 'none', borderRadius: 6,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#E8650A', color: '#fff',
  },
};
