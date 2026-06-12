import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchSubscription } from '../lib/subscription'
import styles from './AppNavbar.module.css'

// Shared, auth-aware navigation used across the app surface (Dashboard,
// Templates, Pricing, …). It lives inside the SPA, so it reads the Supabase
// session directly and uses React Router for every internal link — no
// cross-port URLs.
//
//  - "tribox" logo links home.
//  - Right side is auth-aware: logged in → email/avatar + a "Dashboard" button;
//    logged out → Log in + Sign up. Log out is not a top-level button — it
//    lives in a dropdown opened by clicking the email/avatar, so the marketing
//    surface stays focused on getting users into the app. (On the Dashboard
//    itself the redundant "Dashboard" button is hidden; the dropdown is the
//    sign-out path there.)
//  - `links` is an optional array of center nav items. Each item is either a
//    router link ({ label, to }) or an anchor ({ label, href, onClick }). Omit
//    the prop to get the default marketing links; pass `[]` for no center nav
//    (e.g. the Dashboard).
export default function AppNavbar({ links }) {
  const [user, setUser] = useState(null)
  const [isPro, setIsPro] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Pull the account-level plan so we can show a small "Pro" badge. Re-runs when
  // the logged-in user changes (login/logout).
  useEffect(() => {
    if (!user) { setIsPro(false); return }
    let cancelled = false
    fetchSubscription().then((sub) => {
      if (!cancelled) setIsPro(sub?.tier === 'pro')
    })
    return () => { cancelled = true }
  }, [user])

  // Border appears once the page is scrolled, matching the original landing nav.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // "Features" is an anchor on the landing page. From any other page, go home
  // first and then scroll to it.
  function handleFeatures(e) {
    e.preventDefault()
    if (location.pathname === '/') {
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate('/')
      setTimeout(() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }

  // Close the account dropdown on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function handleLogout() {
    setMenuOpen(false)
    await supabase.auth.signOut()
    navigate('/')
  }

  // Default center nav for the marketing surface. Pages can override via `links`.
  const navLinks = links ?? [
    { label: 'Features', href: '#features', onClick: handleFeatures },
    { label: 'Templates', to: '/templates' },
    { label: 'Pricing', to: '/pricing' },
    { label: 'Docs', href: '#' },
  ]

  return (
    <nav className={`${styles.nav}${scrolled ? ' ' + styles.scrolled : ''}`}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo}>tribox</Link>

        {navLinks.length > 0 && (
          <ul className={styles.links}>
            {navLinks.map((item) => (
              <li key={item.label}>
                {item.to ? (
                  <Link to={item.to}>{item.label}</Link>
                ) : (
                  <a href={item.href ?? '#'} onClick={item.onClick}>{item.label}</a>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className={styles.right}>
          {user ? (
            <>
              {location.pathname !== '/dashboard' && (
                <Link to="/dashboard" className={`${styles.btn} ${styles.ghost} ${styles.start}`}>
                  Dashboard
                </Link>
              )}
              <div className={styles.userMenu} ref={menuRef}>
                <button
                  type="button"
                  className={styles.userTrigger}
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <span className={styles.avatar}>{user.email?.[0]?.toUpperCase() ?? '?'}</span>
                  <span className={styles.email}>{user.email}</span>
                  {isPro && <span className={styles.proBadge}>Pro</span>}
                  <span className={styles.caret} aria-hidden="true">⌄</span>
                </button>
                {menuOpen && (
                  <div className={styles.dropdown} role="menu">
                    <Link to="/dashboard" className={styles.menuItem} role="menuitem" onClick={() => setMenuOpen(false)}>
                      Dashboard
                    </Link>
                    <Link to="/account" className={styles.menuItem} role="menuitem" onClick={() => setMenuOpen(false)}>
                      Account
                    </Link>
                    <button type="button" className={styles.menuItem} role="menuitem" onClick={handleLogout}>
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className={styles.login}>Log in</Link>
              <Link to="/signup" className={`${styles.btn} ${styles.ghost} ${styles.start}`}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
