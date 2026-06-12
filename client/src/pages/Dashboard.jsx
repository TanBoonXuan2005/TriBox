import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchSubscription } from '../lib/subscription'
import AppNavbar from '../components/AppNavbar'
import { colors, fonts, radii } from '../lib/theme'

const s = {
  page: {
    minHeight: '100vh',
    background: colors.bg,
    fontFamily: fonts.sans,
    color: colors.text,
  },
  content: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '40px 32px',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '32px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: '500',
    margin: 0,
  },
  planBadge: (pro) => ({
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: radii.pill,
    background: pro ? colors.proBg : 'rgba(255,255,255,0.07)',
    color: pro ? colors.pro : 'rgba(255,255,255,0.45)',
    border: pro ? `0.5px solid ${colors.proBorder}` : '0.5px solid rgba(255,255,255,0.1)',
  }),
  newSiteBtn: {
    background: '#e4e4e7',
    color: '#09090b',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  card: {
    background: '#111113',
    border: '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  siteName: {
    fontSize: '15px',
    fontWeight: '500',
    color: '#fafafa',
    margin: 0,
  },
  statusDot: (active) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: active ? '#22c55e' : '#52525b',
    flexShrink: 0,
  }),
  domainUrl: {
    fontSize: '12px',
    color: '#71717a',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  actionBtn: {
    flex: 1,
    background: 'transparent',
    border: '0.5px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.55)',
    borderRadius: '7px',
    padding: '7px',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    transition: 'border-color 0.15s, color 0.15s',
  },
  deleteBtn: {
    flex: 1,
    background: 'transparent',
    border: '0.5px solid rgba(239,68,68,0.3)',
    color: '#f87171',
    borderRadius: '7px',
    padding: '7px',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },
  skeleton: {
    background: 'linear-gradient(90deg, #111113 25%, #1a1a1c 50%, #111113 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s infinite',
    borderRadius: '6px',
  },
  skeletonCard: {
    background: '#111113',
    border: '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 20px',
    textAlign: 'center',
    gap: '8px',
  },
  emptyIcon: {
    color: '#27272a',
    marginBottom: '8px',
  },
  emptyTitle: {
    fontSize: '22px',
    fontWeight: '500',
    color: colors.text,
    margin: 0,
    letterSpacing: '-0.3px',
  },
  emptySubtitle: {
    fontSize: '14px',
    color: colors.muted,
    margin: '0 0 24px 0',
  },
  emptyChoices: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    width: '100%',
    maxWidth: '560px',
  },
  emptyChoice: {
    background: colors.surface,
    border: `0.5px solid ${colors.borderStrong}`,
    borderRadius: radii.xl,
    padding: '32px 24px',
    cursor: 'pointer',
    textAlign: 'center',
    fontFamily: fonts.sans,
    transition: 'border-color 0.15s',
  },
  emptyChoiceIcon: {
    fontSize: '28px',
    marginBottom: '14px',
  },
  emptyChoiceTitle: {
    fontSize: '15px',
    fontWeight: '500',
    color: colors.text,
    margin: '0 0 6px 0',
  },
  emptyChoiceDesc: {
    fontSize: '12.5px',
    color: colors.muted,
    margin: 0,
    lineHeight: 1.5,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    background: '#111113',
    border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: '14px',
    padding: '32px',
    width: '100%',
    maxWidth: '520px',
    position: 'relative',
  },
  modalTitle: {
    fontSize: '17px',
    fontWeight: '500',
    margin: '0 0 24px 0',
    color: '#fafafa',
  },
  modalCards: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  modalCard: {
    background: '#161618',
    border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    padding: '20px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'Inter, sans-serif',
    transition: 'border-color 0.15s',
  },
  modalCardIcon: {
    fontSize: '24px',
    marginBottom: '12px',
  },
  modalCardTitle: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#fafafa',
    margin: '0 0 4px 0',
  },
  modalCardDesc: {
    fontSize: '12px',
    color: '#71717a',
    margin: 0,
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    fontSize: '20px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px',
    fontFamily: 'Inter, sans-serif',
  },
}

function SkeletonCard() {
  return (
    <div style={s.skeletonCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ ...s.skeleton, height: '14px', width: '40%' }} />
        <div style={{ ...s.skeleton, width: '8px', height: '8px', borderRadius: '50%' }} />
      </div>
      <div style={{ ...s.skeleton, height: '12px', width: '65%' }} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <div style={{ ...s.skeleton, flex: 1, height: '30px', borderRadius: '7px' }} />
        <div style={{ ...s.skeleton, flex: 1, height: '30px', borderRadius: '7px' }} />
        <div style={{ ...s.skeleton, flex: 1, height: '30px', borderRadius: '7px' }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [sites, setSites] = useState([])
  const [isPro, setIsPro] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const overlayRef = useRef(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // Account-level plan (profiles table) drives the page badge; site list is
    // separate. Fetch both before clearing the loading state.
    const [, sub] = await Promise.all([fetchSites(), fetchSubscription()])
    setIsPro(sub?.tier === 'pro')
    setLoading(false)
  }

  async function fetchSites() {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    try {
      const res = await fetch('/api/sites', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setSites(Array.isArray(data) ? data : [])
    } catch {
      setSites([])
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this site? This cannot be undone.')) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/sites/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    setSites(prev => prev.filter(s => s.id !== id))
  }

  async function handleCreateBlank() {
    if (creating) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ name: 'My Site' }),
      })
      const site = await res.json()
      navigate(`/editor?id=${site.id}`)
    } finally {
      setCreating(false)
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) setShowModal(false)
  }

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        button:hover { opacity: 0.85; }
      `}</style>

      <div style={s.page}>
        <AppNavbar links={[]} />

        {/* Content */}
        <div style={s.content}>
          <div style={s.topRow}>
            <div style={s.titleRow}>
              <h1 style={s.pageTitle}>My Sites</h1>
              {!loading && (
                <span style={s.planBadge(isPro)}>{isPro ? 'Pro' : 'Free'}</span>
              )}
            </div>
            <button style={s.newSiteBtn} onClick={() => setShowModal(true)}>
              + New Site
            </button>
          </div>

          {loading ? (
            <div style={s.grid}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : sites.length === 0 ? (
            <div style={s.emptyState}>
              <svg style={s.emptyIcon} width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" />
                <path d="M8 24h48" stroke="currentColor" strokeWidth="2" />
                <circle cx="16" cy="20" r="2" fill="currentColor" />
                <circle cx="23" cy="20" r="2" fill="currentColor" />
                <circle cx="30" cy="20" r="2" fill="currentColor" />
                <path d="M20 36h24M20 42h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <h2 style={s.emptyTitle}>Create your first site</h2>
              <p style={s.emptySubtitle}>Pick a starting point — you can change everything later.</p>
              <div style={s.emptyChoices}>
                <button style={s.emptyChoice} onClick={() => navigate('/templates')}>
                  <div style={s.emptyChoiceIcon}>🗂</div>
                  <p style={s.emptyChoiceTitle}>Start from template</p>
                  <p style={s.emptyChoiceDesc}>Ready-made layouts for stores, agencies, portfolios and more.</p>
                </button>
                <button style={s.emptyChoice} onClick={() => setShowModal(true)}>
                  <div style={s.emptyChoiceIcon}>⬜</div>
                  <p style={s.emptyChoiceTitle}>Start blank</p>
                  <p style={s.emptyChoiceDesc}>A fresh canvas — drag in components and make it yours.</p>
                </button>
              </div>
            </div>
          ) : (
            <div style={s.grid}>
              {sites.map(site => (
                <div key={site.id} style={s.card}>
                  <div style={s.cardTop}>
                    <p style={s.siteName}>{site.name}</p>
                    <div style={s.statusDot(site.is_active)} title={site.is_active ? 'Active' : 'Draft'} />
                  </div>
                  <p style={s.domainUrl}>{site.domain_url || <em style={{ opacity: 0.4 }}>No domain set</em>}</p>
                  <div style={s.actions}>
                    <button
                      style={s.actionBtn}
                      onClick={() => navigate(`/editor?id=${site.id}`)}
                    >
                      Edit
                    </button>
                    <button
                      style={s.actionBtn}
                      onClick={() => navigate(`/settings?id=${site.id}`)}
                    >
                      Settings
                    </button>
                    <button
                      style={s.deleteBtn}
                      onClick={() => handleDelete(site.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Site Modal */}
      {showModal && (
        <div style={s.overlay} ref={overlayRef} onClick={handleOverlayClick}>
          <div style={s.modal}>
            <button style={s.closeBtn} onClick={() => setShowModal(false)}>×</button>
            <p style={s.modalTitle}>Create a new site</p>
            <div style={s.modalCards}>
              <button
                style={{ ...s.modalCard, border: creating ? '0.5px solid rgba(228,228,231,0.4)' : '0.5px solid rgba(255,255,255,0.1)' }}
                onClick={handleCreateBlank}
                disabled={creating}
              >
                <div style={s.modalCardIcon}>⬜</div>
                <p style={s.modalCardTitle}>Blank canvas</p>
                <p style={s.modalCardDesc}>Start from scratch with a fresh project.</p>
              </button>
              <button
                style={s.modalCard}
                onClick={() => { setShowModal(false); navigate('/templates') }}
              >
                <div style={s.modalCardIcon}>🗂</div>
                <p style={s.modalCardTitle}>From template</p>
                <p style={s.modalCardDesc}>Browse ready-made templates to get started faster.</p>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
