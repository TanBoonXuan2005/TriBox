// Shared design tokens for the tribox app surface.
//
// These mirror the CSS custom properties in index.css (:root) so JS-styled
// components (Dashboard, Settings, the shared AppNavbar) and CSS modules stay
// in visual sync. Import what you need instead of re-typing hex/rgba literals.

export const colors = {
  bg: '#09090b',         // page background
  surface: '#111113',    // cards, modals, nav
  surfaceAlt: '#161618', // nested surfaces (modal cards)
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',
  text: '#fafafa',
  muted: 'rgba(255,255,255,0.45)',
  faint: 'rgba(255,255,255,0.3)',
  accent: '#e4e4e7',      // primary (filled) button background
  accentText: '#09090b',  // text on accent
  // Semantic
  pro: '#a78bfa',
  proBg: 'rgba(139,92,246,0.2)',
  proBorder: 'rgba(139,92,246,0.4)',
  success: '#4ade80',
  successBg: 'rgba(34,197,94,0.15)',
  successBorder: 'rgba(34,197,94,0.3)',
  danger: '#f87171',
  dangerBorder: 'rgba(239,68,68,0.3)',
  dangerBg: 'rgba(239,68,68,0.08)',
}

export const fonts = {
  body: "'Inter', sans-serif",
  sans: 'Inter, sans-serif',
}

export const radii = {
  sm: '7px',
  md: '8px',
  lg: '10px',
  xl: '14px',
  pill: '99px',
}

export const maxWidth = '1100px'

export default { colors, fonts, radii, maxWidth }
