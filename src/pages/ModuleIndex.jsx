import React from 'react';
import { Link } from 'react-router-dom';

const ff = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const mono = '"SF Mono", "Fira Code", "Menlo", monospace';

const MODULES = [
  {
    num: '01', title: 'Gyromotion', weeks: 'Weeks 2–3',
    status: 'live', link: '/gyromotion',
    topics: ['Larmor radius', 'Cyclotron frequency', 'Pitch angle', 'Species comparison'],
    desc: 'Charged particle motion in a uniform magnetic field. The fundamental building block of all plasma confinement.',
    controls: ['Particle species (e⁻ / H⁺)', 'B₀ [0.01–1.0 T]', 'Energy [1–100 eV]', 'Pitch angle α [0°–90°]'],
  },
  {
    num: '02', title: 'Magnetic Mirror', weeks: 'Weeks 4–5',
    status: 'dev', link: null,
    topics: ['Mirror ratio', 'Loss cone', 'μ conservation', 'Bounce dynamics'],
    desc: 'What happens when B increases along the field line? Some particles bounce back. Some escape. The loss cone determines which.',
    controls: ['Mirror ratio Rm', 'Same species/energy/pitch controls'],
  },
  {
    num: '03', title: 'Particle Drifts', weeks: 'Weeks 6–8',
    status: 'planned', link: null,
    topics: ['E×B drift', '∇B drift', 'Curvature drift'],
    desc: 'Three drift mechanisms, three tabs. E×B is charge-independent. ∇B and curvature are not. This matters for confinement.',
    controls: ['Electric field', 'Field gradient', 'Radius of curvature'],
  },
  {
    num: '04', title: 'Confinement Geometries', weeks: 'Weeks 9–12',
    status: 'planned', link: null,
    topics: ['Tokamak orbits', 'Banana width', 'Dipole drift shells', 'L-shell'],
    desc: 'Where Modules 1–3 come together. Passing vs trapped orbits in a tokamak. Drift shells in a dipole.',
    controls: ['Geometry parameters', 'Full particle state'],
  },
];

export default function ModuleIndex() {
  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.header}>
          <div style={S.label}>Single Particle Motion</div>
          <h1 style={S.title}>Module Catalog</h1>
          <p style={S.sub}>
            Four modules covering the standard intro plasma physics curriculum.
            Each module is a standalone interactive simulation running in SI units.
          </p>
        </div>

        <div style={S.list}>
          {MODULES.map(m => (
            <div key={m.num} style={{
              ...S.card,
              borderColor: m.status === 'live' ? 'rgba(232,101,10,0.4)' : 'rgba(255,255,255,0.06)',
            }}>
              <div style={S.cardHeader}>
                <span style={S.cardNum}>{m.num}</span>
                <span style={{
                  ...S.statusBadge,
                  color: m.status === 'live' ? '#E8650A' : '#555',
                  borderColor: m.status === 'live' ? 'rgba(232,101,10,0.3)' : 'rgba(255,255,255,0.1)',
                }}>
                  {m.status === 'live' ? '● Live' : m.status === 'dev' ? '◐ In Development' : '○ Planned'}
                </span>
              </div>

              <h2 style={S.cardTitle}>{m.title}</h2>
              <div style={S.cardWeeks}>{m.weeks}</div>
              <p style={S.cardDesc}>{m.desc}</p>

              <div style={S.topicLabel}>Key concepts</div>
              <div style={S.topics}>
                {m.topics.map(t => (
                  <span key={t} style={S.topic}>{t}</span>
                ))}
              </div>

              <div style={S.topicLabel}>Controls</div>
              <div style={S.controls}>
                {m.controls.map(c => (
                  <div key={c} style={S.control}>→ {c}</div>
                ))}
              </div>

              {m.status === 'live' && (
                <Link to={m.link} style={S.launchBtn}>
                  Launch Module →
                </Link>
              )}
            </div>
          ))}
        </div>

        <div style={S.note}>
          <strong>Pedagogical note:</strong> Modules are sequenced by prerequisite.
          Module 2 requires concepts from Module 1. Module 3 requires 1 and 2.
          Module 4 is built last, and only if Modules 1–3 see real student use.
        </div>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh', background: '#0A0A0F', padding: '80px 24px 60px',
  },
  inner: { maxWidth: 720, margin: '0 auto' },
  header: { marginBottom: 48 },
  label: {
    fontSize: 11, fontWeight: 700, color: '#E8650A', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: 8, fontFamily: mono,
  },
  title: {
    fontSize: 28, fontWeight: 700, color: '#E8E8ED', margin: '0 0 10px',
    fontFamily: ff, lineHeight: 1.3,
  },
  sub: {
    fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.4)',
    margin: 0, fontFamily: ff,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 20 },
  card: {
    padding: '24px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  cardNum: {
    fontSize: 12, fontWeight: 700, color: '#E8650A', fontFamily: mono,
  },
  statusBadge: {
    fontSize: 10, fontFamily: mono, padding: '3px 10px',
    borderRadius: 12, border: '1px solid',
  },
  cardTitle: {
    fontSize: 20, fontWeight: 700, color: '#E8E8ED', margin: '0 0 2px',
    fontFamily: ff,
  },
  cardWeeks: {
    fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: mono,
    marginBottom: 10,
  },
  cardDesc: {
    fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.45)',
    fontFamily: ff, margin: '0 0 16px',
  },
  topicLabel: {
    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 6, fontFamily: mono,
  },
  topics: {
    display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14,
  },
  topic: {
    fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '3px 10px',
    borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)',
    fontFamily: mono,
  },
  controls: { marginBottom: 16 },
  control: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: mono,
    padding: '2px 0',
  },
  launchBtn: {
    display: 'inline-flex', padding: '10px 22px',
    background: '#E8650A', color: '#fff', borderRadius: 8,
    fontSize: 13, fontWeight: 600, textDecoration: 'none',
    fontFamily: ff,
  },
  note: {
    marginTop: 48, padding: '16px 20px', borderRadius: 8,
    border: '1px solid rgba(232,101,10,0.15)',
    background: 'rgba(232,101,10,0.04)',
    fontSize: 12, lineHeight: 1.7, color: 'rgba(255,255,255,0.45)',
    fontFamily: ff,
  },
};
