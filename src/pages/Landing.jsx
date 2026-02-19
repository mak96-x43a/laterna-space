import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// ════════════════════════════════════════════════════════════
// LANDING PAGE — laterna.space
// ════════════════════════════════════════════════════════════
// Fully self-contained. No external images.
// Everything is CSS, SVG, and Canvas.

export default function Landing() {
  return (
    <div style={{ background: '#0A0A0F' }}>
      <HeroSection />
      <WhatIsSection />
      <ModulesPreview />
      <CredentialsSection />
      <Footer />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// HERO
// ════════════════════════════════════════════════════════════

function HeroSection() {
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Fade in after mount
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Animated particle background (lightweight)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let animFrame;
    let particles = [];

    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    };

    const initParticles = () => {
      particles = [];
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      for (let i = 0; i < 60; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 1.5 + 0.5,
          opacity: Math.random() * 0.4 + 0.1,
        });
      }
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 101, 10, ${p.opacity})`;
        ctx.fill();
      });

      // Draw faint connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(232, 101, 10, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      animFrame = requestAnimationFrame(draw);
    };

    resize();
    initParticles();
    draw();

    window.addEventListener('resize', () => { resize(); initParticles(); });
    return () => cancelAnimationFrame(animFrame);
  }, []);

  return (
    <section style={hero.container}>
      {/* Particle canvas */}
      <canvas ref={canvasRef} style={hero.canvas} />

      {/* Radial glow */}
      <div style={hero.glow} />

      {/* Grid overlay */}
      <div style={hero.grid} />

      {/* Content */}
      <div style={{
        ...hero.content,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        {/* Neon title */}
        <div style={hero.titleWrap}>
          <svg viewBox="0 0 580 80" style={hero.titleSvg} aria-hidden="true">
            <defs>
              <filter id="neon">
                <feGaussianBlur stdDeviation="3" result="b1" />
                <feGaussianBlur stdDeviation="8" result="b2" />
                <feMerge>
                  <feMergeNode in="b2" />
                  <feMergeNode in="b1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <text x="290" y="58" textAnchor="middle"
              fontSize="64" fontWeight="800" letterSpacing="14"
              fontFamily='"SF Mono", "Fira Code", "Menlo", monospace'
              fill="rgba(232, 101, 10, 0.95)" filter="url(#neon)">
              LATERNA
            </text>
          </svg>
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
            Laterna — Interactive Plasma Physics
          </h1>
        </div>

        {/* Tagline */}
        <p style={hero.tagline}>
          Interactive plasma physics simulations.<br />
          Real units. Real physics. Built for learning.
        </p>

        {/* CTA */}
        <div style={hero.ctaRow}>
          <Link to="/gyromotion" style={hero.ctaPrimary}>
            Launch Gyromotion Module →
          </Link>
          <Link to="/modules" style={hero.ctaSecondary}>
            Browse Modules
          </Link>
        </div>

        {/* Credential chips */}
        <div style={hero.chips}>
          <span style={hero.chip}>SI Units Throughout</span>
          <span style={hero.chip}>Boris Pusher Validated</span>
          <span style={hero.chip}>PhD Plasma Physics</span>
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={hero.scrollHint}>
        <div style={hero.scrollLine} />
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════
// WHAT IS LATERNA
// ════════════════════════════════════════════════════════════

function WhatIsSection() {
  return (
    <section style={what.section}>
      <div style={what.inner}>
        <div style={what.label}>What is Laterna?</div>
        <h2 style={what.heading}>
          Physics simulations that don't compromise on physics.
        </h2>
        <p style={what.body}>
          Most educational simulations use normalized units that strip away physical meaning.
          A student sees a circle on screen but can't answer "what is the Larmor radius in millimeters
          for a 10 eV electron in a 0.1 T field?"
        </p>
        <p style={what.body}>
          Laterna runs every simulation in SI units with validated numerical solvers.
          You control real magnetic fields in Tesla, real particle energies in electronvolts,
          and see real spatial scales with a scale bar. The Boris pusher matches analytical
          solutions to within 10⁻⁴ relative error.
        </p>

        <div style={what.features}>
          {[
            { icon: '⚛', title: 'Real Physics', desc: 'SI units, validated Boris pusher, analytical cross-checks' },
            { icon: '◎', title: 'Focused Modules', desc: 'One concept per simulation. No dropdown menus hiding six geometries.' },
            { icon: '📐', title: 'Parameter Plots', desc: 'Live "you are here" markers show how rL, fc, and v⊥ depend on your inputs' },
            { icon: '🎓', title: 'Guided Learning', desc: 'Step-by-step tutorial sequence from F = qv×B to species comparison' },
          ].map(f => (
            <div key={f.title} style={what.feature}>
              <div style={what.featureIcon}>{f.icon}</div>
              <div style={what.featureTitle}>{f.title}</div>
              <div style={what.featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════
// MODULES PREVIEW
// ════════════════════════════════════════════════════════════

function ModulesPreview() {
  const modules = [
    {
      num: '01',
      title: 'Gyromotion',
      weeks: 'Weeks 2–3',
      desc: 'Uniform B field. Larmor radius, cyclotron frequency, pitch angle, species comparison.',
      status: 'live',
      link: '/gyromotion',
    },
    {
      num: '02',
      title: 'Magnetic Mirror',
      weeks: 'Weeks 4–5',
      desc: 'Mirror ratio, loss cone, μ conservation. Interactive bounce/loss visualization.',
      status: 'coming',
    },
    {
      num: '03',
      title: 'Particle Drifts',
      weeks: 'Weeks 6–8',
      desc: 'E×B drift, ∇B drift, curvature drift. Three tabs, one concept each.',
      status: 'coming',
    },
    {
      num: '04',
      title: 'Confinement Geometries',
      weeks: 'Weeks 9–12',
      desc: 'Tokamak orbits, banana width, dipole drift shells. Advanced module.',
      status: 'planned',
    },
  ];

  return (
    <section style={mod.section}>
      <div style={mod.inner}>
        <div style={mod.label}>Curriculum</div>
        <h2 style={mod.heading}>Four modules. One particle at a time.</h2>
        <p style={mod.sub}>
          Each module maps to 2–3 weeks in a standard intro plasma physics course.
        </p>

        <div style={mod.grid}>
          {modules.map(m => (
            <div key={m.num} style={{
              ...mod.card,
              borderColor: m.status === 'live' ? '#E8650A' : 'rgba(255,255,255,0.06)',
            }}>
              <div style={mod.cardNum}>{m.num}</div>
              <div style={mod.cardTitle}>{m.title}</div>
              <div style={mod.cardWeeks}>{m.weeks}</div>
              <div style={mod.cardDesc}>{m.desc}</div>
              {m.status === 'live' ? (
                <Link to={m.link} style={mod.cardBtn}>Launch →</Link>
              ) : (
                <span style={mod.cardStatus}>
                  {m.status === 'coming' ? 'In development' : 'Planned'}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════
// CREDENTIALS
// ════════════════════════════════════════════════════════════

function CredentialsSection() {
  return (
    <section style={cred.section}>
      <div style={cred.inner}>
        <div style={cred.label}>Who built this</div>
        <h2 style={cred.heading}>Built by a plasma physicist, for plasma physics students.</h2>
        <div style={cred.grid}>
          <div style={cred.item}>
            <div style={cred.itemVal}>PhD</div>
            <div style={cred.itemLabel}>Plasma Spectroscopy — Toulouse University</div>
          </div>
          <div style={cred.item}>
            <div style={cred.itemVal}>PPPL</div>
            <div style={cred.itemLabel}>Princeton Plasma Physics Laboratory — Program Leader</div>
          </div>
          <div style={cred.item}>
            <div style={cred.itemVal}>$650K+</div>
            <div style={cred.itemLabel}>Research funding secured</div>
          </div>
          <div style={cred.item}>
            <div style={cred.itemVal}>200+</div>
            <div style={cred.itemLabel}>Program participants reached</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════
// FOOTER
// ════════════════════════════════════════════════════════════

function Footer() {
  return (
    <footer style={foot.container}>
      <div style={foot.inner}>
        <div style={foot.left}>
          <span style={{ color: '#E8650A', fontSize: 16 }}>⬡</span>
          <span style={foot.brand}>LATERNA</span>
        </div>
        <div style={foot.right}>
          <span>laterna.space</span>
          <span style={{ color: '#333' }}>·</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════

const ff = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const mono = '"SF Mono", "Fira Code", "Menlo", monospace';

const hero = {
  container: {
    position: 'relative', minHeight: '100vh', display: 'flex',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    background: '#0A0A0F',
  },
  canvas: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    pointerEvents: 'none',
  },
  glow: {
    position: 'absolute',
    width: 600, height: 600,
    left: '50%', top: '45%',
    transform: 'translate(-50%, -50%)',
    background: 'radial-gradient(circle, rgba(232,101,10,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  grid: {
    position: 'absolute', inset: 0,
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
    `,
    backgroundSize: '60px 60px',
    pointerEvents: 'none',
  },
  content: {
    position: 'relative', zIndex: 10,
    textAlign: 'center', maxWidth: 680, padding: '120px 24px 80px',
  },
  titleWrap: {
    marginBottom: 24,
  },
  titleSvg: {
    width: '100%', maxWidth: 520, height: 'auto',
  },
  tagline: {
    fontSize: 17, lineHeight: 1.7, color: 'rgba(255,255,255,0.55)',
    fontFamily: ff, margin: '0 0 32px', fontWeight: 400,
  },
  ctaRow: {
    display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
    marginBottom: 32,
  },
  ctaPrimary: {
    display: 'inline-flex', alignItems: 'center', padding: '12px 28px',
    background: '#E8650A', color: '#fff', borderRadius: 8,
    fontSize: 14, fontWeight: 600, textDecoration: 'none',
    fontFamily: ff, letterSpacing: '0.01em',
    transition: 'background 0.2s',
  },
  ctaSecondary: {
    display: 'inline-flex', alignItems: 'center', padding: '12px 28px',
    background: 'transparent', color: '#999', borderRadius: 8,
    fontSize: 14, fontWeight: 500, textDecoration: 'none',
    fontFamily: ff, border: '1px solid rgba(255,255,255,0.1)',
    transition: 'border-color 0.2s, color 0.2s',
  },
  chips: {
    display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap',
  },
  chip: {
    fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '5px 14px',
    borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)',
    fontFamily: mono, letterSpacing: '0.02em',
  },
  scrollHint: {
    position: 'absolute', bottom: 32, left: '50%',
    transform: 'translateX(-50%)',
  },
  scrollLine: {
    width: 1, height: 40,
    background: 'linear-gradient(to bottom, rgba(232,101,10,0.4), transparent)',
  },
};

const what = {
  section: {
    padding: '100px 24px', borderTop: '1px solid rgba(255,255,255,0.04)',
    background: '#0A0A0F',
  },
  inner: { maxWidth: 800, margin: '0 auto' },
  label: {
    fontSize: 11, fontWeight: 700, color: '#E8650A', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: 12, fontFamily: mono,
  },
  heading: {
    fontSize: 28, fontWeight: 700, color: '#E8E8ED', lineHeight: 1.3,
    margin: '0 0 20px', fontFamily: ff,
  },
  body: {
    fontSize: 15, lineHeight: 1.8, color: 'rgba(255,255,255,0.5)',
    margin: '0 0 16px', fontFamily: ff,
  },
  features: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 20, marginTop: 40,
  },
  feature: {
    padding: '20px 18px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  featureIcon: { fontSize: 22, marginBottom: 10 },
  featureTitle: {
    fontSize: 14, fontWeight: 600, color: '#E8E8ED', marginBottom: 6,
    fontFamily: ff,
  },
  featureDesc: {
    fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.4)',
    fontFamily: ff,
  },
};

const mod = {
  section: {
    padding: '100px 24px', background: '#08080D',
    borderTop: '1px solid rgba(255,255,255,0.04)',
  },
  inner: { maxWidth: 900, margin: '0 auto' },
  label: {
    fontSize: 11, fontWeight: 700, color: '#E8650A', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: 12, fontFamily: mono,
  },
  heading: {
    fontSize: 28, fontWeight: 700, color: '#E8E8ED', lineHeight: 1.3,
    margin: '0 0 8px', fontFamily: ff,
  },
  sub: {
    fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: '0 0 40px',
    fontFamily: ff,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
  },
  card: {
    padding: '22px 18px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    display: 'flex', flexDirection: 'column',
  },
  cardNum: {
    fontSize: 11, fontWeight: 700, color: '#E8650A', fontFamily: mono,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16, fontWeight: 700, color: '#E8E8ED', marginBottom: 4,
    fontFamily: ff,
  },
  cardWeeks: {
    fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 10,
    fontFamily: mono,
  },
  cardDesc: {
    fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.4)',
    fontFamily: ff, flex: 1, marginBottom: 14,
  },
  cardBtn: {
    fontSize: 12, fontWeight: 600, color: '#E8650A', textDecoration: 'none',
    fontFamily: ff,
  },
  cardStatus: {
    fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: mono,
  },
};

const cred = {
  section: {
    padding: '80px 24px', borderTop: '1px solid rgba(255,255,255,0.04)',
    background: '#0A0A0F',
  },
  inner: { maxWidth: 800, margin: '0 auto' },
  label: {
    fontSize: 11, fontWeight: 700, color: '#E8650A', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: 12, fontFamily: mono,
  },
  heading: {
    fontSize: 22, fontWeight: 600, color: '#E8E8ED', lineHeight: 1.4,
    margin: '0 0 36px', fontFamily: ff,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
  },
  item: {
    padding: '18px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  itemVal: {
    fontSize: 20, fontWeight: 800, color: '#E8650A', marginBottom: 6,
    fontFamily: mono,
  },
  itemLabel: {
    fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.4)',
    fontFamily: ff,
  },
};

const foot = {
  container: {
    padding: '24px 32px',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    background: '#08080D',
  },
  inner: {
    maxWidth: 900, margin: '0 auto',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  left: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  brand: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
    color: '#555', fontFamily: mono,
  },
  right: {
    display: 'flex', gap: 8, fontSize: 11, color: '#444',
    fontFamily: mono,
  },
};
