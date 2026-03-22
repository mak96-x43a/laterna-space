import React from 'react';
import { Link } from 'react-router-dom';

const ff = '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const mono = '"SF Mono", "Fira Code", "Menlo", monospace';

export default function VirtualLabIndex() {
  const labs = [
    {
      num: '01', title: 'DC Discharge',
      desc: "Explore electrical breakdown in gases. Set the gas type, pressure, electrode gap, and voltage — ignite the plasma and build Paschen's curve point by point. Includes Helmholtz coil magnetic pinch.",
      status: 'live', link: '/dc-discharge',
    },
    {
      num: '02', title: 'Planeterrella',
      desc: 'Magnetized spheres in a vacuum vessel. Simulate auroral ovals and visualize charged particle motion along dipole field lines.',
      status: 'planned',
    },
  ];

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.label}>Virtual Labs</div>
        <h1 style={s.heading}>Real experiments. No hardware required.</h1>
        <p style={s.sub}>
          Interactive simulations of real laboratory equipment. Conduct experiments,
          collect data, and explore the physics at your own pace.
        </p>

        <div style={s.grid}>
          {labs.map(m => (
            <div key={m.num} style={{
              ...s.card,
              borderColor: m.status === 'live' ? '#E8650A' : 'rgba(255,255,255,0.06)',
            }}>
              <div style={s.cardNum}>{m.num}</div>
              <div style={s.cardTitle}>{m.title}</div>
              <div style={s.cardDesc}>{m.desc}</div>
              {m.status === 'live' ? (
                <Link to={m.link} style={s.cardBtn}>Launch →</Link>
              ) : (
                <span style={s.cardStatus}>Planned</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh', background: '#0A0A0F',
    padding: '120px 24px 80px', // top padding for fixed navbar
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
    fontFamily: ff, maxWidth: 600,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
  },
  card: {
    padding: '24px 20px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
    display: 'flex', flexDirection: 'column',
  },
  cardNum: {
    fontSize: 11, fontWeight: 700, color: '#E8650A', fontFamily: mono,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18, fontWeight: 700, color: '#E8E8ED', marginBottom: 10,
    fontFamily: ff,
  },
  cardDesc: {
    fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)',
    fontFamily: ff, flex: 1, marginBottom: 16,
  },
  cardBtn: {
    fontSize: 13, fontWeight: 600, color: '#E8650A', textDecoration: 'none',
    fontFamily: ff,
  },
  cardStatus: {
    fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: mono,
  },
};
