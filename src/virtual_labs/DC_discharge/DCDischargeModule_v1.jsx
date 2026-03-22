/**
 * LATERNA — Virtual Lab 1: DC Discharge & Paschen's Law (v6)
 * ============================================================
 * Styles matched to GyromotionModule.jsx exactly.
 * Helmholtz coil magnetic pinch, extended P & d ranges,
 * pressure-dependent discharge morphology with low-P striations.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ════════════════════════════════════════════════════════════
// 1. PHYSICS ENGINE
// ════════════════════════════════════════════════════════════

const GASES = {
  air: { name: 'Air', formula: 'N₂/O₂', A: 15.0, B: 365.0, color: '#d4a0e0', colorName: 'pinkish violet', glowRGB: [212, 160, 224] },
  N2:  { name: 'Nitrogen', formula: 'N₂', A: 12.0, B: 342.0, color: '#ff6b8a', colorName: 'pink-red', glowRGB: [255, 107, 138] },
  Ar:  { name: 'Argon', formula: 'Ar', A: 11.5, B: 176.0, color: '#7b4dff', colorName: 'blue-purple', glowRGB: [123, 77, 255] },
  He:  { name: 'Helium', formula: 'He', A: 2.8, B: 77.0, color: '#ffd4b8', colorName: 'peachy pink', glowRGB: [255, 212, 184] },
  Ne:  { name: 'Neon', formula: 'Ne', A: 4.4, B: 111.0, color: '#ff4400', colorName: 'red-orange', glowRGB: [255, 68, 0] },
};

const EU = Math.E;
function computeGamma(A, B, Vt) { return 1 / (Math.exp(Vt * A / (EU * B)) - 1); }
const SS_T = { air: 327, N2: 310, Ar: 137, He: 156, Ne: 245 };
const CU_T = { air: 360, N2: 340, Ar: 155, He: 175, Ne: 270 };
const CATHODES = {
  stainless_steel: { name: 'Stainless Steel', gamma: Object.fromEntries(Object.entries(SS_T).map(([k, v]) => [k, computeGamma(GASES[k].A, GASES[k].B, v)])) },
  copper: { name: 'Copper', gamma: Object.fromEntries(Object.entries(CU_T).map(([k, v]) => [k, computeGamma(GASES[k].A, GASES[k].B, v)])) },
};

function paschenVb(pd, gk, ck) {
  const { A, B } = GASES[gk]; const g = CATHODES[ck].gamma[gk];
  const lt = Math.log(1 + 1 / g);
  if (A * pd <= lt) return Infinity;
  const d = Math.log(A * pd) - Math.log(lt);
  return d <= 0 ? Infinity : B * pd / d;
}
function paschenMin(gk, ck) {
  const { A, B } = GASES[gk]; const g = CATHODES[ck].gamma[gk];
  const lt = Math.log(1 + 1 / g);
  return { pdMin: (EU / A) * lt, vMin: (EU * B / A) * lt };
}

// ════════════════════════════════════════════════════════════
// 2. DISCHARGE PROFILE — pressure-dependent morphology
// ════════════════════════════════════════════════════════════

function ss(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

function dischargeProfileAt(frac, pressure) {
  const pN = Math.max(0.01, Math.min(20, pressure));
  // At low P cathode features spread; at high P they compress
  const cSpread = 0.8 + 0.5 / (1 + pN * 0.5);

  // Cathode glow: very narrow, right at cathode
  const cathodeGlow = 0.7 * Math.exp(-Math.pow((frac - 0.02 * cSpread) / (0.010 * cSpread), 2));

  // Cathode dark space: SMALL — only ~2-5% gap before negative glow
  // (emerges naturally from spacing between cathodeGlow and negativeGlow peaks)

  // Negative glow: brightest, compact, at ~6-10% of gap
  const ngCenter = 0.05 + 0.03 * cSpread;
  const negativeGlow = 1.0 * Math.exp(-Math.pow((frac - ngCenter) / (0.022 * cSpread), 2));

  // Faraday dark space: larger than cathode DS — at ~12-20%
  // (naturally wider gap between negativeGlow tail and positive column start)

  // Positive column: fills from ~20% to ~93% — right up to anode glow
  const pcBright = 0.35 + 0.25 * ss(0.5, 5, pN);
  const fDS = ngCenter + 0.022 * cSpread * 3;
  const pcS = fDS + 0.05;
  const pcE = 0.93; // extends close to anode
  const pcEdge = 0.02 + 0.02 / (1 + pN * 0.3);
  let pc = pcBright * ss(pcS - pcEdge, pcS + pcEdge, frac) * (1 - ss(pcE - pcEdge, pcE + pcEdge, frac));

  // Striations at LOW pressure (paper: positive column breaks into bands)
  if (pN < 0.5 && frac > pcS && frac < pcE) {
    const str = 0.12 * Math.sin(frac * (18 - pN * 10) * Math.PI) * ss(0, 0.5, 0.5 - pN);
    pc = Math.max(0, pc + str);
  }

  // Anode glow: thin bright band right at anode, immediately after positive column
  const anodeGlow = 0.65 * Math.exp(-Math.pow((frac - 0.97) / 0.018, 2));

  const intensity = Math.max(0, Math.min(1, cathodeGlow + negativeGlow + pc + anodeGlow));
  // Color mix: 0 = cathode (blue/violet), 1 = column (pink/red)
  const colorMix = ss(fDS - 0.02, fDS + 0.06, frac);
  return { intensity, colorMix };
}

function getColors(rgb) {
  const [r, g, b] = rgb;
  return {
    cathode: [~~(r * 0.45), ~~(g * 0.35), Math.min(255, ~~(b * 1.3 + 70))],
    column: [Math.min(255, ~~(r * 1.2 + 50)), ~~(g * 0.65), ~~(b * 0.55)],
  };
}
function lerp(a, b, t) { return [~~(a[0] + (b[0] - a[0]) * t), ~~(a[1] + (b[1] - a[1]) * t), ~~(a[2] + (b[2] - a[2]) * t)]; }

const LABELS = [
  { name: 'Aston DS', f: 0.005 }, { name: 'Cath. Glow', f: 0.02 }, { name: 'Cath. DS', f: 0.04 },
  { name: 'Neg. Glow', f: 0.07 }, { name: 'Faraday DS', f: 0.14 },
  { name: 'Positive Column', f: 0.55 }, { name: 'Anode Glow', f: 0.97 },
];

// ════════════════════════════════════════════════════════════
// 3. TUBE CANVAS
// ════════════════════════════════════════════════════════════

function TubeCanvas({ width, height, gasKey, pressure, voltage, distance, cathodeKey, bField, showLabels }) {
  const canvasRef = useRef(null);
  const gas = GASES[gasKey];
  const vb = paschenVb(pressure * distance, gasKey, cathodeKey);
  let glow = 0;
  if (isFinite(vb) && vb > 0) {
    const r = voltage / vb;
    if (r >= 1) glow = Math.min(1, 0.65 + 0.35 * Math.min(1, (r - 1) / 0.3));
    else if (r > 0.88) glow = 0.06 * ((r - 0.88) / 0.12);
  }

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0f1017';
    ctx.fillRect(0, 0, width, height);

    // Tube geometry
    const TL = 90, TR = width - 90;
    const TT = height * 0.22, TB = height * 0.78;
    const TW = TR - TL, TH = TB - TT, TCY = (TT + TB) / 2;

    // Tube glass
    const rad = 14;
    ctx.beginPath();
    ctx.moveTo(TL + rad, TT); ctx.lineTo(TR - rad, TT);
    ctx.arcTo(TR, TT, TR, TT + rad, rad); ctx.lineTo(TR, TB - rad);
    ctx.arcTo(TR, TB, TR - rad, TB, rad); ctx.lineTo(TL + rad, TB);
    ctx.arcTo(TL, TB, TL, TB - rad, rad); ctx.lineTo(TL, TT + rad);
    ctx.arcTo(TL, TT, TL + rad, TT, rad); ctx.closePath();
    ctx.fillStyle = '#0c0e16'; ctx.fill();
    ctx.strokeStyle = 'rgba(180,190,210,0.35)'; ctx.lineWidth = 2; ctx.stroke();

    // Glass reflection
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TL + 12, TT + 4); ctx.lineTo(TR - 12, TT + 4); ctx.stroke();

    // Helmholtz coils — two rings at ±5cm from tube center
    const tubeMidPx = (TL + TR) / 2;
    const pxPerCm = TW / 60; // approximate: tube represents ~60cm
    const coilSep = 5 * pxPerCm; // 5cm each side = 10cm total separation
    const coilPositions = [tubeMidPx - coilSep, tubeMidPx + coilSep];
    const coilW = 8, coilExt = 14; // coil ring width and extension beyond tube
    coilPositions.forEach(cx => {
      // Coil ring (visible even when B=0 as hardware)
      const coilAlpha = bField > 0 ? 0.7 : 0.25;
      ctx.fillStyle = `rgba(180,120,60,${coilAlpha})`;
      ctx.fillRect(cx - coilW / 2, TT - coilExt, coilW, TH + 2 * coilExt);
      // Copper wire texture lines
      ctx.strokeStyle = `rgba(200,150,80,${coilAlpha * 0.5})`;
      ctx.lineWidth = 0.5;
      for (let y = TT - coilExt + 2; y < TB + coilExt; y += 3) {
        ctx.beginPath(); ctx.moveTo(cx - coilW / 2, y); ctx.lineTo(cx + coilW / 2, y); ctx.stroke();
      }
      // Coil outline
      ctx.strokeStyle = `rgba(140,90,40,${coilAlpha})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - coilW / 2, TT - coilExt, coilW, TH + 2 * coilExt);
    });
    // B field label between coils
    if (bField > 0) {
      ctx.fillStyle = 'rgba(232,180,80,0.6)';
      ctx.font = '9px "SF Mono","Fira Code","Menlo",monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`B = ${bField.toFixed(3)} T`, tubeMidPx, TT - coilExt - 5);
    }

    // Electrodes
    const elW = 10, elH = TH - 20;
    const cathX = TL + 16;
    const maxGap = TW - 75, minGap = 20;
    const gapFrac = (distance - 0.5) / 49.5;
    const gapPx = minGap + gapFrac * (maxGap - minGap);
    const anodeX = cathX + elW + gapPx;

    // Cathode
    let cg = ctx.createLinearGradient(cathX, 0, cathX + elW, 0);
    cg.addColorStop(0, '#4a4e58'); cg.addColorStop(0.5, '#6e7380'); cg.addColorStop(1, '#555a64');
    ctx.fillStyle = cg; ctx.fillRect(cathX, TCY - elH / 2, elW, elH);
    ctx.fillStyle = 'rgba(180,190,210,0.25)'; ctx.fillRect(cathX + elW - 1, TCY - elH / 2, 1, elH);

    // Anode + plunger
    let ag = ctx.createLinearGradient(anodeX, 0, anodeX + elW, 0);
    ag.addColorStop(0, '#555a64'); ag.addColorStop(0.5, '#7a808c'); ag.addColorStop(1, '#60656e');
    ctx.fillStyle = ag; ctx.fillRect(anodeX, TCY - elH / 2, elW, elH);
    ctx.fillStyle = 'rgba(180,190,210,0.25)'; ctx.fillRect(anodeX, TCY - elH / 2, 1, elH);
    // Plunger rod
    const plL = anodeX + elW, plR = TR - 8;
    if (plR > plL + 5) {
      ctx.fillStyle = '#3a3e48'; ctx.fillRect(plL, TCY - 2, plR - plL, 4);
      ctx.fillStyle = '#2a2e38'; ctx.fillRect(plR - 3, TCY - 6, 6, 12);
      ctx.strokeStyle = 'rgba(180,190,210,0.25)'; ctx.lineWidth = 1;
      ctx.strokeRect(plR - 3, TCY - 6, 6, 12);
    }

    // Labels above tube
    ctx.font = 'bold 11px "SF Mono","Fira Code","Menlo",monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#E8650A'; ctx.fillText('HV −', cathX + elW / 2, TT - 12);
    ctx.fillStyle = '#4aba6a'; ctx.fillText('GND', anodeX + elW / 2, TT - 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(cathX + elW / 2, TT - 6); ctx.lineTo(cathX + elW / 2, TT); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(anodeX + elW / 2, TT - 6); ctx.lineTo(anodeX + elW / 2, TT); ctx.stroke();
    ctx.setLineDash([]);

    // Distance arrow below tube
    const arrY = TB + 18, arrL = cathX + elW + 2, arrR = anodeX - 2, arrM = (arrL + arrR) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(arrL, arrY); ctx.lineTo(arrR, arrY); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.moveTo(arrL, arrY); ctx.lineTo(arrL + 5, arrY - 3); ctx.lineTo(arrL + 5, arrY + 3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(arrR, arrY); ctx.lineTo(arrR - 5, arrY - 3); ctx.lineTo(arrR - 5, arrY + 3); ctx.closePath(); ctx.fill();
    ctx.font = '10px "SF Mono","Fira Code","Menlo",monospace';
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`d = ${distance.toFixed(1)} cm`, arrM, arrY + 14);

    // ── Discharge rendering ──
    const dL = cathX + elW + 2, dR = anodeX - 2, dW = dR - dL;
    if (glow > 0.005 && dW > 5) {
      const cols = getColors(gas.glowRGB);
      const stripH = TH - 20;
      const step = 3;

      // Coil pixel positions for spatially varying pinch
      const coilCenter = (coilPositions[0] + coilPositions[1]) / 2;
      const coilHalfSep = (coilPositions[1] - coilPositions[0]) / 2;

      for (let px = 0; px < dW; px += step) {
        const frac = (px + step / 2) / dW;
        const { intensity: bI, colorMix: cm } = dischargeProfileAt(frac, pressure);
        const inten = bI * glow;
        if (inten > 0.005) {
          const x = dL + px, sw = Math.min(step, dW - px);

          // Position-dependent pinch: B field strongest at coils, falls off toward electrodes
          // Model: B(x) ~ B0 * exp(-(dist_from_center / coilHalfSep)^2 * 0.5)
          // pinch ~ 1/sqrt(1 + B_local/0.01)
          let localPinch = 1.0;
          if (bField > 0 && coilHalfSep > 0) {
            const xPx = dL + px;
            const distFromCenter = Math.abs(xPx - coilCenter);
            // Gaussian falloff: strongest at coil positions, weakest at electrodes
            const bLocal = bField * Math.exp(-Math.pow(distFromCenter / (coilHalfSep * 1.2), 2));
            localPinch = 1.0 / Math.sqrt(1 + bLocal / 0.01);
          }

          const pH = stripH * localPinch;
          const pT = TCY - pH / 2;

          const [cr, cg2, cb] = lerp(cols.cathode, cols.column, cm);
          const gr = ctx.createLinearGradient(0, pT, 0, pT + pH);
          gr.addColorStop(0, `rgba(${cr},${cg2},${cb},0)`);
          gr.addColorStop(0.12, `rgba(${cr},${cg2},${cb},${inten * 0.1})`);
          gr.addColorStop(0.30, `rgba(${cr},${cg2},${cb},${inten * 0.55})`);
          gr.addColorStop(0.50, `rgba(${cr},${cg2},${cb},${inten * 0.95})`);
          gr.addColorStop(0.70, `rgba(${cr},${cg2},${cb},${inten * 0.55})`);
          gr.addColorStop(0.88, `rgba(${cr},${cg2},${cb},${inten * 0.1})`);
          gr.addColorStop(1, `rgba(${cr},${cg2},${cb},0)`);
          ctx.fillStyle = gr; ctx.fillRect(x, pT, sw, pH);
        }
      }

      // Ambient
      const av = lerp(cols.cathode, cols.column, 0.6);
      const amb = ctx.createLinearGradient(0, TCY - TH * 0.6, 0, TCY + TH * 0.6);
      amb.addColorStop(0, `rgba(${av[0]},${av[1]},${av[2]},0)`);
      amb.addColorStop(0.5, `rgba(${av[0]},${av[1]},${av[2]},${glow * 0.04})`);
      amb.addColorStop(1, `rgba(${av[0]},${av[1]},${av[2]},0)`);
      ctx.fillStyle = amb; ctx.fillRect(TL, TT, TW, TH);

      // Labels
      if (showLabels && dW > 80) {
        ctx.font = '8px "SF Mono","Fira Code","Menlo",monospace';
        ctx.textAlign = 'center';
        LABELS.forEach((lb, i) => {
          const cx = dL + lb.f * dW;
          const yOff = i % 2 === 0 ? TT - 22 : TT - 32;
          const { intensity: li, colorMix: lc } = dischargeProfileAt(lb.f, pressure);
          const [lr, lg, lb2] = lerp(cols.cathode, cols.column, lc);
          ctx.fillStyle = li > 0.3 ? `rgba(${lr},${lg},${lb2},0.9)` : 'rgba(255,255,255,0.35)';
          ctx.fillText(lb.name, cx, yOff);
          ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(cx, TT - 1); ctx.lineTo(cx, TT + 5); ctx.stroke();
        });
      }
    }

    // Gas label
    ctx.font = '10px "SF Mono","Fira Code","Menlo",monospace';
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText(`${gas.formula} @ ${pressure >= 1 ? pressure.toFixed(1) : pressure.toFixed(2)} Torr`, TR - 16, TT + 16);

    // Tube connections
    ctx.strokeStyle = 'rgba(150,160,180,0.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(TL, TCY - 12); ctx.lineTo(TL - 28, TCY - 12); ctx.lineTo(TL - 28, TCY - 35); ctx.stroke();
    ctx.font = '9px "SF Mono","Fira Code","Menlo",monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200,200,200,0.35)'; ctx.fillText('Gas In', TL - 28, TCY - 39);
    ctx.strokeStyle = 'rgba(150,160,180,0.25)';
    ctx.beginPath(); ctx.moveTo(TR, TCY + 12); ctx.lineTo(TR + 28, TCY + 12); ctx.lineTo(TR + 28, TCY + 35); ctx.stroke();
    ctx.fillStyle = 'rgba(200,200,200,0.35)'; ctx.fillText('Pump', TR + 28, TCY + 48);
    // Gauge
    ctx.strokeStyle = 'rgba(150,160,180,0.25)';
    ctx.beginPath(); ctx.moveTo(TR, TCY - 12); ctx.lineTo(TR + 28, TCY - 12); ctx.stroke();
    const gx = TR + 46, gy = TCY - 12, gr = 16;
    ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180,190,210,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(20,22,30,0.8)'; ctx.fill();
    ctx.font = 'bold 9px "SF Mono","Fira Code","Menlo",monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#E8650A'; ctx.fillText(pressure >= 1 ? `${pressure.toFixed(1)}` : `${pressure.toFixed(2)}`, gx, gy + 1);
    ctx.font = '7px "SF Mono","Fira Code","Menlo",monospace';
    ctx.fillStyle = 'rgba(200,200,200,0.5)'; ctx.fillText('Torr', gx, gy + 10);

  }, [width, height, gasKey, pressure, voltage, distance, cathodeKey, bField, glow, showLabels]);

  return <canvas ref={canvasRef} style={{ width, height, display: 'block' }} />;
}

// ════════════════════════════════════════════════════════════
// 4. PASCHEN PLOT
// ════════════════════════════════════════════════════════════

function PaschenPlot({ width, height, points, gasKey, cathodeKey, curPd, curV, isBD }) {
  const canvasRef = useRef(null);
  const gas = GASES[gasKey];
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = height * dpr;
    ctx.scale(dpr, dpr);

    const m = { t: 30, r: 20, b: 45, l: 60 };
    const pw = width - m.l - m.r, ph = height - m.t - m.b;

    ctx.fillStyle = '#FAFAFA'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fff'; ctx.fillRect(m.l, m.t, pw, ph);
    ctx.strokeStyle = '#E5E5E8'; ctx.lineWidth = 1; ctx.strokeRect(m.l, m.t, pw, ph);

    const pdMn = 0.01, pdMx = 1000, vMn = 50, vMx = 60000;
    const lpMn = Math.log10(pdMn), lpMx = Math.log10(pdMx);
    const lvMn = Math.log10(vMn), lvMx = Math.log10(vMx);
    const tx = pd => m.l + (Math.log10(pd) - lpMn) / (lpMx - lpMn) * pw;
    const ty = v => m.t + ph - (Math.log10(v) - lvMn) / (lvMx - lvMn) * ph;

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 0.5;
    for (let e = -2; e <= 3; e++) { const x = tx(Math.pow(10, e)); ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); }
    for (let e = 2; e <= 4; e++) { const y = ty(Math.pow(10, e)); ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); }

    // Theoretical curve
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); let st = false;
    for (let i = 0; i <= 600; i++) {
      const pd = Math.pow(10, lpMn + (lpMx - lpMn) * i / 600);
      const v = paschenVb(pd, gasKey, cathodeKey);
      if (isFinite(v) && v >= vMn && v <= vMx) {
        const x = tx(pd), y = ty(v);
        st ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), st = true);
      }
    }
    ctx.stroke(); ctx.setLineDash([]);

    // Points
    points.forEach(pt => {
      const x = tx(pt.pd), y = ty(pt.vb);
      if (x >= m.l && x <= m.l + pw && y >= m.t && y <= m.t + ph) {
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = GASES[pt.gas].color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.stroke();
      }
    });

    // Connecting line
    const sp = points.filter(p => p.gas === gasKey && p.cathode === cathodeKey).sort((a, b) => a.pd - b.pd);
    if (sp.length >= 2) {
      ctx.strokeStyle = gas.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
      ctx.beginPath();
      sp.forEach((pt, i) => { const x = tx(pt.pd), y = ty(pt.vb); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    // Current point
    if (curPd > 0 && curV > 0) {
      const cx = tx(curPd), cy = ty(Math.max(vMn, curV));
      if (cx >= m.l && cx <= m.l + pw) {
        ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(cx, m.t); ctx.lineTo(cx, m.t + ph); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m.l, cy); ctx.lineTo(m.l + pw, cy); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = isBD ? '#E8650A' : 'rgba(0,0,0,0.25)'; ctx.fill();
      }
    }

    // Axis labels
    ctx.fillStyle = '#666'; ctx.font = '11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('P × d  (Torr·cm)', m.l + pw / 2, height - 5);
    ctx.save(); ctx.translate(14, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Vb (V)', 0, 0); ctx.restore();

    // Ticks
    ctx.font = '9px "SF Mono","Fira Code","Menlo",monospace'; ctx.fillStyle = '#AAA'; ctx.textAlign = 'center';
    for (let e = -2; e <= 3; e++) ctx.fillText(`${Math.pow(10, e)}`, tx(Math.pow(10, e)), m.t + ph + 14);
    ctx.textAlign = 'right';
    for (let e = 2; e <= 4; e++) ctx.fillText(`${Math.pow(10, e)}`, m.l - 5, ty(Math.pow(10, e)) + 3);

    // Title
    ctx.fillStyle = '#E8650A'; ctx.font = 'bold 11px "SF Mono","Fira Code","Menlo",monospace'; ctx.textAlign = 'left';
    ctx.fillText(`Paschen Curve — ${gas.name} (${CATHODES[cathodeKey].name})`, m.l, m.t - 12);
    ctx.fillStyle = '#AAA'; ctx.font = '10px "SF Mono","Fira Code","Menlo",monospace'; ctx.textAlign = 'right';
    ctx.fillText(`${sp.length} pts collected`, m.l + pw, m.t - 12);
  }, [width, height, points, gasKey, cathodeKey, curPd, curV, isBD]);

  return <canvas ref={canvasRef} style={{ width, height, display: 'block' }} />;
}

// ════════════════════════════════════════════════════════════
// 5. HELPERS
// ════════════════════════════════════════════════════════════

const Sub = ({ children }) => <sub style={{ fontSize: '0.75em', verticalAlign: 'sub', lineHeight: 0 }}>{children}</sub>;

// Slider component — defined OUTSIDE main component to avoid remounting
const mono = '"SF Mono","Fira Code","Menlo",monospace';
const sysFont = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

function ParamSlider({ label, displayVal, value, min, max, step, onChange, unit, isAccent }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: isAccent ? '#E8650A' : '#444', fontWeight: isAccent ? 600 : 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: mono, color: '#E8650A', fontWeight: 600 }}>{displayVal} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', height: 20, background: 'transparent', cursor: 'pointer' }} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 5b. TUTORIAL / FLASHCARD STEPS
// ════════════════════════════════════════════════════════════

const GUIDE_STEPS = [
  {
    title: 'What is a DC Glow Discharge?',
    content: () => (
      <span>
        A DC glow discharge forms when a gas between two electrodes becomes electrically
        conductive. Apply enough voltage and free electrons gain energy from the electric field,
        collide with gas atoms, and ionize them — creating a cascade of new electrons. This is
        how neon signs, fluorescent lights, and plasma processing chambers work. In this virtual lab,
        you control the same variables a physicist would in a real experiment.
      </span>
    ),
  },
  {
    title: "Paschen's Law",
    content: () => (
      <span>
        The breakdown voltage depends on the product of <b>pressure × gap distance</b> (P·d), not
        on each variable separately. This is Paschen's Law: V<Sub>b</Sub> = B·P·d / (C + ln(P·d)).
        The curve has a minimum — too low P·d means electrons escape without enough collisions;
        too high means electrons lose energy before gaining enough to ionize. Your goal is to find
        this minimum experimentally by collecting data points.
      </span>
    ),
  },
  {
    title: 'The Townsend Avalanche',
    content: () => (
      <span>
        Breakdown requires a self-sustaining process. A single electron creates an avalanche via
        ionizing collisions (first Townsend coefficient α). But avalanches alone aren't enough —
        ions striking the cathode must eject secondary electrons (coefficient γ) to replace the
        seed electron. The discharge becomes self-sustaining when γ(e<sup style={{fontSize:'0.75em'}}>αd</sup> − 1) = 1.
        The cathode material matters because γ depends on the surface.
      </span>
    ),
  },
  {
    title: 'Discharge Structure',
    content: () => (
      <span>
        Once breakdown occurs, the glow has a rich spatial structure. Near the cathode: a thin
        cathode glow, a dark space, then the bright <b>negative glow</b> (highest energy electrons).
        After the Faraday dark space, the <b>positive column</b> fills most of the tube — this is
        where the plasma is most uniform. Toggle "Discharge Structure Labels" to see each region.
        The colors shift from blue (cathode) to pink (positive column) because different electron
        energies excite different transitions.
      </span>
    ),
  },
  {
    title: 'Helmholtz Coils & Magnetic Confinement',
    content: () => (
      <span>
        The two copper coils wrapped around the tube generate an axial magnetic field. Charged
        particles gyrate around field lines (remember the Gyromotion module!) and their radial
        transport is reduced. The result: the plasma column <b>pinches</b> where the field is
        strongest (between the coils) and expands where it weakens — creating an hourglass shape.
        This is the same principle behind magnetic confinement in fusion devices.
      </span>
    ),
  },
  {
    title: 'Running the Experiment',
    content: () => (
      <span>
        <b>1.</b> Pick a gas and cathode material.<br/>
        <b>2.</b> Set pressure and electrode gap.<br/>
        <b>3.</b> Slowly increase voltage until the discharge ignites.<br/>
        <b>4.</b> Click "Collect Data Point" to log the breakdown voltage.<br/>
        <b>5.</b> Change P or d and repeat to build the Paschen curve.<br/>
        <b>6.</b> Export your data as CSV when done.<br/>
        Try different gases — each has a different curve shape and minimum voltage!
      </span>
    ),
  },
];

// ════════════════════════════════════════════════════════════
// 6. MAIN COMPONENT — styles matched to GyromotionModule.jsx
// ════════════════════════════════════════════════════════════

export default function DCDischargeModule() {
  const [gasKey, setGasKey] = useState('air');
  const [cathodeKey, setCathodeKey] = useState('stainless_steel');
  const [pressure, setPressure] = useState(1.0);
  const [distance, setDistance] = useState(5.0);
  const [voltage, setVoltage] = useState(0);
  const [bField, setBField] = useState(0);
  const [showLabels, setShowLabels] = useState(false);
  const [points, setPoints] = useState([]);
  const [showGuide, setShowGuide] = useState(true);
  const [guideStep, setGuideStep] = useState(0);
  const [cSize, setCSize] = useState({ w: 900 });
  const cRef = useRef(null);

  const pd = pressure * distance;
  const vb = paschenVb(pd, gasKey, cathodeKey);
  const isBD = isFinite(vb) && voltage >= vb;
  const { pdMin, vMin } = paschenMin(gasKey, cathodeKey);
  const gas = GASES[gasKey];
  const cathode = CATHODES[cathodeKey];
  const maxV = gasKey === 'He' ? 2000 : gasKey === 'Ar' ? 3000 : 5000;

  useEffect(() => {
    const el = cRef.current; if (!el) return;
    const ro = new ResizeObserver(es => { for (const e of es) setCSize({ w: Math.max(600, e.contentRect.width) }); });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const collect = useCallback(() => {
    if (!isBD) return;
    setPoints(p => [...p, { gas: gasKey, cathode: cathodeKey, pressure, distance, pd, vb: voltage, ts: Date.now() }]);
  }, [gasKey, cathodeKey, pressure, distance, pd, voltage, isBD]);

  const exportCSV = useCallback(() => {
    if (!points.length) return;
    const csv = 'gas,cathode,P_Torr,d_cm,Pd,Vb_V\n' + points.map(p => `${p.gas},${p.cathode},${p.pressure},${p.distance},${p.pd.toFixed(2)},${p.vb}`).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `paschen_${gasKey}.csv`; a.click();
  }, [points, gasKey]);

  const tubeW = Math.max(500, cSize.w - 280);
  const plotW = cSize.w - 280;

  return (
    <div style={{ fontFamily: sysFont, background: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div ref={cRef} style={{ display: 'flex', flex: 1 }}>
        {/* Left — tube + status + plot */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TubeCanvas width={tubeW} height={320} gasKey={gasKey} pressure={pressure}
            voltage={voltage} distance={distance} cathodeKey={cathodeKey} bField={bField} showLabels={showLabels} />

          {/* Status strip */}
          <div style={{
            display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap',
            padding: '6px 16px', background: '#FAFAFA', borderBottom: '1px solid #F2F2F4',
            fontSize: 12, fontFamily: mono, color: '#888',
          }}>
            <span>P·d = <b style={{ color: '#1A1A2E' }}>{pd.toFixed(2)}</b> Torr·cm</span>
            <span>V<Sub>b</Sub> = <b style={{ color: isBD ? '#E8650A' : '#1A1A2E' }}>
              {isFinite(vb) ? `${vb.toFixed(0)}` : '∞'}
            </b> V</span>
            <span>V<Sub>min</Sub> = <b style={{ color: '#1A1A2E' }}>{vMin.toFixed(0)}</b> V</span>
            <span>γ = <b style={{ color: '#1A1A2E' }}>{cathode.gamma[gasKey].toFixed(4)}</b></span>
            {isBD && <span style={{ color: '#fff', background: `${gas.color}aa`, padding: '1px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>
              ⚡ {gas.colorName}
            </span>}
          </div>

          {/* Plot */}
          <div style={{ flex: 1, minHeight: 300 }}>
            <PaschenPlot width={plotW} height={340} points={points}
              gasKey={gasKey} cathodeKey={cathodeKey} curPd={pd}
              curV={Math.max(50, voltage)} isBD={isBD} />
          </div>
        </div>

        {/* Right panel — 280px, matching Gyromotion */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}>Virtual Lab 1: DC Discharge</div>
            <div style={S.panelSub}>Electrical breakdown & Paschen's curve</div>
          </div>

          {/* GAS */}
          <div style={S.section}>
            <div style={S.secLabel}>GAS</div>
            <select value={gasKey} onChange={e => setGasKey(e.target.value)} style={S.select}>
              {Object.entries(GASES).map(([k, g]) => <option key={k} value={k}>{g.name} ({g.formula})</option>)}
            </select>
            <div style={{ marginTop: 4, fontSize: 10, color: gas.color }}>Emission: {gas.colorName}</div>
          </div>

          {/* CATHODE */}
          <div style={S.section}>
            <div style={S.secLabel}>CATHODE MATERIAL</div>
            <select value={cathodeKey} onChange={e => setCathodeKey(e.target.value)} style={S.select}>
              {Object.entries(CATHODES).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}
            </select>
          </div>

          {/* PARAMETERS */}
          <div style={S.section}>
            <div style={S.secLabel}>PARAMETERS</div>
            <ParamSlider label="Applied Voltage" displayVal={voltage} value={voltage} min={0} max={maxV} step={5}
              onChange={v => setVoltage(v)} unit="V" isAccent />
            {isBD ? (
              <div style={{ fontSize: 10, color: '#E8650A', marginTop: -8, marginBottom: 8 }}>⚡ {Math.round(voltage - vb)}V above breakdown</div>
            ) : isFinite(vb) ? (
              <div style={{ fontSize: 10, color: '#AAA', marginTop: -8, marginBottom: 8 }}>Need {Math.round(vb)}V for breakdown</div>
            ) : (
              <div style={{ fontSize: 10, color: '#AAA', marginTop: -8, marginBottom: 8 }}>P·d too low for breakdown</div>
            )}
            <ParamSlider label="Pressure" displayVal={pressure >= 1 ? pressure.toFixed(1) : pressure.toFixed(2)} value={pressure} min={0.01} max={20} step={0.05}
              onChange={v => setPressure(v)} unit="Torr" />
            <ParamSlider label="Electrode Gap (d)" displayVal={distance.toFixed(1)} value={distance} min={0.5} max={50} step={0.5}
              onChange={v => setDistance(v)} unit="cm" />
          </div>

          {/* MAGNETIC FIELD */}
          <div style={S.section}>
            <div style={S.secLabel}>HELMHOLTZ COILS</div>
            <ParamSlider label="B field (axial)" displayVal={bField.toFixed(3)} value={bField} min={0} max={0.05} step={0.001}
              onChange={v => setBField(v)} unit="T" />
            {bField > 0 && (
              <div style={{ fontSize: 10, color: 'rgba(200,150,60,0.8)', marginTop: -8, marginBottom: 4 }}>
                Max pinch at coils: ×{(1 / Math.sqrt(1 + bField / 0.01)).toFixed(2)}
              </div>
            )}
          </div>

          {/* DATA COLLECTION */}
          <div style={S.section}>
            <div style={S.secLabel}>DATA COLLECTION</div>
            <button onClick={collect} disabled={!isBD} style={{
              ...S.btnPrimary, background: isBD ? '#E8650A' : '#E0E0E0', color: isBD ? '#fff' : '#999',
              cursor: isBD ? 'pointer' : 'not-allowed', width: '100%', marginBottom: 6,
            }}>
              {isBD ? '◉ Collect Data Point' : '○ Achieve Breakdown First'}
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={exportCSV} disabled={!points.length} style={{
                ...S.btnSecondary, flex: 1, opacity: points.length ? 1 : 0.4,
              }}>Export CSV ({points.length})</button>
              <button onClick={() => setPoints([])} disabled={!points.length} style={{
                ...S.btnSecondary, color: points.length ? '#c44' : '#bbb', opacity: points.length ? 1 : 0.4,
              }}>Clear</button>
            </div>
          </div>

          {/* OPTIONS */}
          <div style={S.section}>
            <label style={S.checkLabel}>
              <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(!showLabels)} style={{ marginRight: 8 }} />
              Discharge Structure Labels
            </label>
          </div>

          {/* GUIDE BUTTON */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #F2F2F4' }}>
            <button onClick={() => { setShowGuide(true); setGuideStep(0); }} style={{
              width: '100%', padding: '7px 0', border: '1px solid #ddd', borderRadius: 6,
              fontSize: 12, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#555',
            }}>? Guide</button>
          </div>

          {/* DERIVED QUANTITIES */}
          <div style={S.section}>
            <div style={S.secLabel}>PASCHEN'S LAW</div>
            <div style={{ fontSize: 11, color: '#444', lineHeight: 1.8, marginBottom: 10, fontFamily: mono, padding: '8px 10px', background: '#F8F8FA', borderRadius: 4, border: '1px solid #F0F0F2' }}>
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                V<Sub>b</Sub> = <span style={{ fontSize: 13 }}>B · P · d</span> / <span style={{ fontSize: 11 }}>(C + ln(P·d))</span>
              </div>
              <div style={{ fontSize: 9, color: '#888', textAlign: 'center' }}>
                C = ln(A) − ln(ln(1 + 1/γ))
              </div>
            </div>
            <DQ label="A" val={gas.A} />
            <DQ label="B" val={gas.B} />
            <DQ label="γ" val={cathode.gamma[gasKey].toFixed(4)} />
            <DQ label={<>(P·d)<Sub>min</Sub></>} val={`${pdMin.toFixed(3)} Torr·cm`} />
            <DQ label={<>V<Sub>min</Sub></>} val={`${vMin.toFixed(0)} V`} />
          </div>

          {/* COLLECTED POINTS */}
          {points.length > 0 && (
            <div style={S.section}>
              <div style={S.secLabel}>COLLECTED POINTS</div>
              <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                {points.map((pt, i) => (
                  <div key={i} style={{ fontSize: 10, fontFamily: mono, color: GASES[pt.gas].color, padding: '1px 0' }}>
                    #{i + 1}: P·d={pt.pd.toFixed(1)} → {pt.vb}V
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Guide modal */}
      {showGuide && guideStep >= 0 && guideStep < GUIDE_STEPS.length && (
        <div style={S.overlay} onClick={() => setShowGuide(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalStep}>Step {guideStep + 1} of {GUIDE_STEPS.length}</div>
            <h3 style={S.modalTitle}>
              {typeof GUIDE_STEPS[guideStep].title === 'function'
                ? GUIDE_STEPS[guideStep].title()
                : GUIDE_STEPS[guideStep].title}
            </h3>
            <div style={S.modalBody}>
              {GUIDE_STEPS[guideStep].content()}
            </div>
            <div style={S.modalFoot}>
              <div style={S.dots}>
                {GUIDE_STEPS.map((_, i) => (
                  <div key={i} style={{ ...S.dot, background: i === guideStep ? '#E8650A' : '#ddd' }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button style={S.modalSkip} onClick={() => setShowGuide(false)}>Skip</button>
                {guideStep > 0 && (
                  <button style={S.modalBtnSec} onClick={() => setGuideStep(s => s - 1)}>Back</button>
                )}
                {guideStep < GUIDE_STEPS.length - 1 ? (
                  <button style={S.modalBtnPri} onClick={() => setGuideStep(s => s + 1)}>Next</button>
                ) : (
                  <button style={S.modalBtnPri} onClick={() => setShowGuide(false)}>Start Exploring</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        input[type="range"] { -webkit-appearance: none; appearance: none; }
        input[type="range"]::-webkit-slider-runnable-track {
          height: 3px; background: #E5E5E8; border-radius: 2px;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: #E8650A; cursor: pointer; margin-top: -6.5px;
          border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
      `}</style>
    </div>
  );
}

// Derived quantity row
function DQ({ label, val }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid #F5F5F7' }}>
      <span style={{ color: '#444' }}>{label}</span>
      <span style={{ fontFamily: '"SF Mono","Fira Code","Menlo",monospace', fontWeight: 500, color: '#1A1A2E' }}>{val}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 7. STYLES — matched to GyromotionModule.jsx
// ════════════════════════════════════════════════════════════

const S = {
  panel: {
    width: 280, minWidth: 280, borderLeft: '1px solid #E5E5E8',
    display: 'flex', flexDirection: 'column', background: '#fff', overflowY: 'auto',
  },
  panelHead: { padding: '14px 16px 10px', borderBottom: '1px solid #EEEEF0' },
  panelTitle: { fontSize: 15, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.3 },
  panelSub: { fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.3 },
  section: { padding: '10px 16px', borderBottom: '1px solid #F2F2F4' },
  secLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#AAA', marginBottom: 8 },
  select: {
    width: '100%', padding: '7px 10px', border: '1px solid #E0E0E0', borderRadius: 6,
    fontSize: 12, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    color: '#333', background: '#FAFAFA', cursor: 'pointer', outline: 'none',
  },
  checkLabel: { display: 'flex', alignItems: 'center', fontSize: 12, color: '#666', cursor: 'pointer' },
  btnPrimary: {
    padding: '8px 0', border: 'none', borderRadius: 6,
    fontSize: 12, fontWeight: 600, fontFamily: '"SF Mono","Fira Code","Menlo",monospace',
  },
  btnSecondary: {
    padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#555',
  },
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