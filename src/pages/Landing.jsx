import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// ════════════════════════════════════════════════════════════════
// LANDING PAGE — laterna.space
// ════════════════════════════════════════════════════════════════
// Layered hero: lab background → avatar → neon title + content
// Images: /background.png, /avatar.png (in public/)

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

// ════════════════════════════════════════════════════════════════
// HERO — Layered scene
// ════════════════════════════════════════════════════════════════

function HeroSection() {
  const [visible, setVisible] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, []);

  // Lightweight scroll tracking for parallax
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const parallaxBg = scrollY * 0.3;
  const parallaxAvatar = scrollY * 0.15;
  const fadeOut = Math.max(0, 1 - scrollY / 600);

  return (
    <section style={hero.container}>
      {/* Layer 1: Lab background */}
      <div style={{
        ...hero.bgLayer,
        transform: `translateY(${parallaxBg}px) scale(1.05)`,
      }}>
        <img
          src="/background.png"
          alt=""
          style={hero.bgImage}
        />
        {/* Dark gradient overlays for text readability */}
        <div style={hero.bgGradientTop} />
        <div style={hero.bgGradientBottom} />
        <div style={hero.bgVignette} />
      </div>

      {/* Layer 2: Plants — right side by glass door */}
      <div style={{
        ...hero.plantsLayer,
        transform: `translateY(${scrollY * 0.2}px)`,
        opacity: fadeOut,
      }}>
        {/* Bird of Paradise — left corner by desk */}
        <img
          src="/BoP-removebg.png"
          alt=""
          style={hero.bopImage}
        />
        {/* Monstera — right side near avatar */}
        <img
          src="/monstera-removebg.png"
          alt=""
          style={hero.monsteraImage}
        />
      </div>

      {/* Layer 3: Avatar */}
      <div style={{
        ...hero.avatarLayer,
        transform: `translateX(-50%) translateY(${parallaxAvatar}px)`,
        opacity: fadeOut,
      }}>
        <img
          src="/avatar.png"
          alt="Scientist avatar"
          style={hero.avatarImage}
        />
        {/* Subtle orange glow behind avatar from plasma */}
        <div style={hero.avatarGlow} />
      </div>

      {/* Layer 3: Content overlay */}
      <div style={{
        ...hero.content,
        opacity: visible ? fadeOut : 0,
        transform: visible
          ? `translateY(${-scrollY * 0.1}px)`
          : 'translateY(30px)',
        transition: visible ? 'none' : 'opacity 0.8s ease, transform 0.8s ease',
      }}>
        {/* LATERNA title */}
        <div style={hero.titleWrap}>
          <svg viewBox="0 0 580 80" style={hero.titleSvg} aria-hidden="true">
            <text x="290" y="58" textAnchor="middle"
              fontSize="64" fontWeight="800" letterSpacing="14"
              fontFamily={`"SF Mono", "Fira Code", "Menlo", monospace`}
              fill="rgba(232, 101, 10, 0.95)">
              LATERNA
            </text>
          </svg>
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
            Laterna — Interactive Plasma Physics Simulations
          </h1>
        </div>

        {/* Tagline */}
        <p style={hero.tagline}>
          Physics you can play with.<br />
          Fun. Visual. Intuitive.
        </p>

        {/* CTA buttons */}
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
          <span style={hero.chip}>SI Units</span>
          <span style={hero.chip}>Analytically Verified</span>
          <span style={hero.chip}>PhD Plasma Physics</span>
        </div>
      </div>

      {/* Scroll indicator */}
      <div style={{
        ...hero.scrollHint,
        opacity: Math.max(0, 1 - scrollY / 200),
      }}>
        <div style={hero.scrollLine} />
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════
// WHAT IS LATERNA
// ════════════════════════════════════════════════════════════════

function WhatIsSection() {
  return (
    <section style={what.section}>
      <div style={what.inner}>
        <div style={what.label}>What is Laterna?</div>
        <h2 style={what.heading}>
          The interactive plasma physics resource that's been missing.
        </h2>
        <p style={what.body}>
          Most physics simulations use normalized units. While this approach is convenient
          for the developer, it defeats the pedagogical purpose of the tool; students interact
          with abstract curves and dimensionless numbers instead of developing real physical
          intuition. They can't estimate orders of magnitude and can't connect what they see
          to what happens in a lab.
        </p>
        <p style={what.body}>
          Laterna takes a different approach. Every simulation runs in SI units and every
          solver is tested against analytical solutions where available and rigorous numerical
          approaches where not. Students control real physical quantities, read real spatial
          and temporal scales, and build the intuition that lets them walk into a lab or an
          exam and think in real numbers.
        </p>
        <p style={what.body}>
          My goal is ambitious: build the most comprehensive interactive plasma physics
          learning platform — from single particle motion and magnetic confinement to plasma
          technology and diagnostics. One module at a time.
        </p>

        <div style={what.features}>
          {[
            { icon: '⚛', title: 'Real Physics', desc: 'SI units throughout, validated solvers, analytical cross-checks.' },
            { icon: '◎', title: 'Focused Modules', desc: 'One concept per simulation. Clean interfaces, no hidden complexity.' },
            { icon: '📐', title: 'Live Diagnostics', desc: 'Parameter plots with live markers. See how the physics changes with your inputs.' },
            { icon: '🎓', title: 'Guided Learning', desc: 'Step-by-step tutorials, flashcards, and concept breakdowns built into every module.' },
          ].map(f => (
            <div key={f.title} style={what.feature}>
              <div style={what.featureIcon}>{f.icon}</div>
              <div style={what.featureTitle}>{f.title}</div>
              <div style={what.featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Origin story */}
        <div style={what.origin}>
          <div style={what.originRule} />
          <h3 style={what.originTitle}>Why "Laterna"?</h3>
          <p style={what.originBody}>
            Born from my obsession with plasma and light, and a frustration
            with educational tools that hide the real physics behind normalized units and
            oversimplified models, Laterna is what I wish had existed when I was a student,
            making my first steps in plasma physics.
          </p>
          <p style={what.originBody}>
            Laterna is Latin for lantern. The name is a tribute to Mathieu Masquère, my late PhD
            supervisor, who was my guiding light — not just in plasma physics, but through a
            difficult period in my life. The violet glow in the logo is nitrogen plasma, his
            favorite gas to work with.
          </p>
          <p style={what.originBody}>
            I hope you enjoy exploring it as much as I enjoy building it.
          </p>
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════
// MODULES PREVIEW
// ════════════════════════════════════════════════════════════════

function ModulesPreview() {
  const singleParticle = [
    {
      num: '01', title: 'Gyromotion',
      desc: 'Uniform B field. Larmor radius, cyclotron frequency, pitch angle, species comparison.',
      status: 'live', link: '/gyromotion',
    },
    {
      num: '02', title: 'Magnetic Mirror',
      desc: 'Mirror ratio, loss cone, μ conservation. Interactive bounce and loss visualization.',
      status: 'coming',
    },
    {
      num: '03', title: 'Particle Drifts',
      desc: 'E×B drift, ∇B drift, curvature drift. One concept per tab.',
      status: 'coming',
    },
    {
      num: '04', title: 'Confinement Geometries',
      desc: 'Tokamak orbits, banana width, dipole drift shells.',
      status: 'planned',
    },
  ];

  const comingNext = [
    { title: 'Glow Discharges', desc: "Paschen's law, DC breakdown, sputtering applications." },
    { title: 'Plasma Waves', desc: 'Dispersion relations, Langmuir waves, electromagnetic modes.' },
    { title: 'Plasma Diagnostics', desc: 'Langmuir probes, optical emission spectroscopy, interferometry.' },
  ];

  return (
    <section style={mod.section}>
      <div style={mod.inner}>
        <div style={mod.label}>Modules</div>
        <h2 style={mod.heading}>Building the most comprehensive interactive plasma physics resource.</h2>
        <p style={mod.sub}>One module at a time — each focused on a single phenomenon, built to be explored at your own pace.</p>

        {/* Series 1: Single Particle Motion */}
        <div style={mod.seriesLabel}>Series 1 — Single Particle Motion</div>
        <div style={mod.grid}>
          {singleParticle.map(m => (
            <div key={m.num} style={{
              ...mod.card,
              borderColor: m.status === 'live' ? '#E8650A' : 'rgba(255,255,255,0.06)',
            }}>
              <div style={mod.cardNum}>{m.num}</div>
              <div style={mod.cardTitle}>{m.title}</div>
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

        {/* Coming Next */}
        <div style={{ ...mod.seriesLabel, marginTop: 48 }}>On the Roadmap</div>
        <div style={mod.grid}>
          {comingNext.map(m => (
            <div key={m.title} style={mod.card}>
              <div style={mod.cardTitle}>{m.title}</div>
              <div style={mod.cardDesc}>{m.desc}</div>
              <span style={mod.cardStatus}>Planned</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════
// CREDENTIALS
// ════════════════════════════════════════════════════════════════

function CredentialsSection() {
  return (
    <section style={cred.section}>
      <div style={cred.inner}>
        <div style={cred.label}>Who built this</div>
        <h2 style={cred.heading}>Built by a plasma physicist, for plasma physics students.</h2>
        <div style={cred.grid}>
          <div style={cred.item}>
            <div style={cred.itemVal}>PhD</div>
            <div style={cred.itemLabel}>Plasma Physics — Toulouse 3 University (Paul Sabatier)</div>
          </div>
          <div style={cred.item}>
            <div style={cred.itemVal}>PPPL</div>
            <div style={cred.itemLabel}>Princeton Plasma Physics Laboratory — Physics Lab Manager & Education and Public Engagement Coordinator</div>
          </div>
          <div style={cred.item}>
            <div style={cred.itemVal}>R&D</div>
            <div style={cred.itemLabel}>Microwave plasma for trace element detection and methane reforming, plasma disinfection and sterilization, plasma-powered jet engines</div>
          </div>
          <div style={cred.item}>
            <div style={cred.itemVal}>10+</div>
            <div style={cred.itemLabel}>Years of hands-on plasma experiments</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════
// FOOTER
// ════════════════════════════════════════════════════════════════

function Footer() {
  return (
    <footer style={foot.container}>
      <div style={foot.inner}>
        <div style={foot.left}>
          <img src="/laterna-logo-navbar.svg" alt="" style={{ height: 22, width: 'auto' }} />
          <span style={foot.brand}>LATERNA</span>
        </div>
        <div style={foot.center}>
          <a href="mailto:mathieu@laterna.space" style={foot.email}>
            mathieu@laterna.space
          </a>
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

// ════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════

const ff = '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const mono = '"SF Mono", "Fira Code", "Menlo", monospace';

const hero = {
  container: {
    position: 'relative', height: '100vh', overflow: 'hidden',
    background: '#0A0A0F',
  },
  // --- Background layer ---
  bgLayer: {
    position: 'absolute', inset: 0,
    willChange: 'transform',
  },
  bgImage: {
    width: '100%', height: '100%',
    objectFit: 'cover', objectPosition: 'center 60%',
    display: 'block',
  },
  bgGradientTop: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '45%',
    background: 'linear-gradient(to bottom, rgba(10,10,15,0.92) 0%, rgba(10,10,15,0.5) 50%, transparent 100%)',
    pointerEvents: 'none',
  },
  bgGradientBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '35%',
    background: 'linear-gradient(to top, rgba(10,10,15,1) 0%, rgba(10,10,15,0.6) 40%, transparent 100%)',
    pointerEvents: 'none',
  },
  bgVignette: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(10,10,15,0.7) 100%)',
    pointerEvents: 'none',
  },
  // --- Plants layer ---
  plantsLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 3,
    willChange: 'transform',
    pointerEvents: 'none',
  },
  bopImage: {
    position: 'absolute',
    bottom: '0%', right: '5%',
    height: '55%', maxHeight: 400,
    width: 'auto',
    objectFit: 'contain',
    filter: 'brightness(0.6) saturate(0.8)',
    mixBlendMode: 'lighten',
  },
  monsteraImage: {
    position: 'absolute',
    bottom: '0%', left: '0%',
    height: '50%', maxHeight: 380,
    width: 'auto',
    objectFit: 'contain',
    filter: 'brightness(0.55) saturate(0.8)',
    mixBlendMode: 'lighten',
  },
  // --- Avatar layer ---
  avatarLayer: {
    position: 'absolute',
    bottom: '2%', left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 5,
    willChange: 'transform',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  avatarImage: {
    height: '55vh', maxHeight: 520,
    width: 'auto',
    objectFit: 'contain',
    position: 'relative', zIndex: 2,
    filter: 'drop-shadow(0 0 30px rgba(232,101,10,0.15))',
  },
  avatarGlow: {
    position: 'absolute',
    bottom: '10%', left: '50%',
    transform: 'translateX(-50%)',
    width: 300, height: 200,
    background: 'radial-gradient(ellipse, rgba(232,101,10,0.12) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 1,
  },
  // --- Content layer ---
  content: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 10, textAlign: 'center',
    padding: '10vh 24px 0',
    pointerEvents: 'none',
  },
  titleWrap: {
    marginBottom: 16,
    pointerEvents: 'auto',
  },
  titleSvg: {
    width: '100%', maxWidth: 480, height: 'auto',
  },
  tagline: {
    fontSize: 16, lineHeight: 1.7, color: 'rgba(255,255,255,0.65)',
    fontFamily: ff, margin: '0 0 28px', fontWeight: 400,
    textShadow: '0 2px 20px rgba(0,0,0,0.8)',
  },
  ctaRow: {
    display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
    marginBottom: 24,
    pointerEvents: 'auto',
  },
  ctaPrimary: {
    display: 'inline-flex', alignItems: 'center', padding: '12px 28px',
    background: '#E8650A', color: '#fff', borderRadius: 8,
    fontSize: 14, fontWeight: 600, textDecoration: 'none',
    fontFamily: ff, letterSpacing: '0.01em',
    boxShadow: '0 0 20px rgba(232,101,10,0.3), 0 4px 12px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  ctaSecondary: {
    display: 'inline-flex', alignItems: 'center', padding: '12px 28px',
    background: 'rgba(10,10,15,0.6)', color: '#ccc', borderRadius: 8,
    fontSize: 14, fontWeight: 500, textDecoration: 'none',
    fontFamily: ff, border: '1px solid rgba(255,255,255,0.15)',
    backdropFilter: 'blur(8px)',
    transition: 'border-color 0.2s, color 0.2s',
  },
  chips: {
    display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap',
    pointerEvents: 'auto',
  },
  chip: {
    fontSize: 11, color: 'rgba(255,255,255,0.5)', padding: '5px 14px',
    borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
    fontFamily: mono, letterSpacing: '0.02em',
    background: 'rgba(10,10,15,0.5)',
    backdropFilter: 'blur(4px)',
  },
  scrollHint: {
    position: 'absolute', bottom: 28, left: '50%',
    transform: 'translateX(-50%)', zIndex: 15,
  },
  scrollLine: {
    width: 1, height: 40,
    background: 'linear-gradient(to bottom, rgba(232,101,10,0.5), transparent)',
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
    margin: '0 0 16px', fontFamily: ff, textAlign: 'justify',
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
  origin: {
    marginTop: 56,
    paddingTop: 40,
  },
  originRule: {
    width: 40, height: 2,
    background: 'rgba(232,101,10,0.4)',
    marginBottom: 24,
  },
  originTitle: {
    fontSize: 18, fontWeight: 600, color: '#E8E8ED',
    margin: '0 0 16px', fontFamily: ff,
  },
  originBody: {
    fontSize: 15, lineHeight: 1.8, color: 'rgba(255,255,255,0.5)',
    margin: '0 0 14px', fontFamily: ff, textAlign: 'justify',
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
  seriesLabel: {
    fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
    fontFamily: ff, marginBottom: 16, letterSpacing: '0.01em',
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
    fontSize: 16, fontWeight: 700, color: '#E8E8ED', marginBottom: 8,
    fontFamily: ff,
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
    flexWrap: 'wrap', gap: 12,
  },
  left: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  brand: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
    color: '#555', fontFamily: mono,
  },
  center: {
    display: 'flex', alignItems: 'center',
  },
  email: {
    fontSize: 11, color: '#E8650A', fontFamily: mono,
    textDecoration: 'none', letterSpacing: '0.02em',
    transition: 'opacity 0.2s',
  },
  right: {
    display: 'flex', gap: 8, fontSize: 11, color: '#444',
    fontFamily: mono,
  },
};
