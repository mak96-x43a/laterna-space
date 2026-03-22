import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', color: '#E8E8ED' }}>
      {/* Navigation */}
      <nav style={styles.nav}>
        <Link to="/" style={styles.logo}>
          <img src="/laterna-logo-navbar.svg" alt="Laterna" style={styles.logoMark} />
          <span style={styles.logoText}>LATERNA</span>
        </Link>
        <div style={styles.links}>
          <Link to="/modules" style={{
            ...styles.navLink,
            color: location.pathname === '/modules' ? '#E8650A' : '#888',
          }}>
            Modules
          </Link>
          <Link to="/virtual-labs" style={{
            ...styles.navLink,
            color: location.pathname === '/virtual-labs' ? '#E8650A' : '#888',
          }}>
            Virtual Labs
          </Link>
          <a href="https://github.com/mak96-x43a/laterna-space" target="_blank" rel="noopener noreferrer" style={styles.navLink}>
            GitHub
          </a>
        </div>
      </nav>

      {/* Page content */}
      <Outlet />
    </div>
  );
}

const styles = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0 32px', height: 56,
    background: 'rgba(10, 10, 15, 0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 10,
    textDecoration: 'none', color: '#E8E8ED',
  },
  logoMark: {
    height: 32, width: 'auto',
  },
  logoText: {
    fontSize: 13, fontWeight: 700, letterSpacing: '0.18em',
    fontFamily: '"SF Mono", "Fira Code", "Menlo", monospace',
  },
  links: {
    display: 'flex', gap: 24, alignItems: 'center',
  },
  navLink: {
    textDecoration: 'none', fontSize: 13, color: '#888',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    transition: 'color 0.2s',
  },
};
