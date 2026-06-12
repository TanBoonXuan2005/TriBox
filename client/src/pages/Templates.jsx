import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppNavbar from '../components/AppNavbar'
import BlockRenderer from '../components/BlockRenderer'

const categories = ['All', 'SaaS', 'Portfolio', 'E-Commerce', 'Blog', 'Restaurant']
const priceOptions = ['All', 'Free', 'Paid']
const popularOptions = ['Most Popular', 'Newest', 'Best Rated']

/* ── Real template previews ──────────────────────────────────────────
   Both the card thumbnail and the full-screen modal render the template's
   actual blocks (fetched from /api/templates/:id/preview) through the same
   BlockRenderer the editor uses — so what users see is the real template,
   not a wireframe mock. */

// Scaled-down live render of the first few blocks for the card thumbnail.
// The inner page lays out at 250% of the card width, then scale(0.4) brings it
// back to fill the card exactly (250% × 0.4 = 100%), giving a faithful mini.
function MiniPreview({ blocks }) {
  if (!blocks) {
    return <div style={{ width: '100%', height: '100%', background: '#0d0d0f' }} />
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#ffffff' }}>
      <div style={{
        width: '250%',
        transform: 'scale(0.4)',
        transformOrigin: 'top left',
        pointerEvents: 'none',
      }}>
        {blocks.slice(0, 3).map((b, i) => (
          <BlockRenderer key={i} block={b} />
        ))}
      </div>
    </div>
  )
}

// Full-size, read-only render of every block in a scrollable overlay.
function PreviewModal({ template, blocks, onClose, onUse, loading }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const free = template.price === 0

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column', padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '1080px', margin: '0 auto', flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          background: '#ffffff', borderRadius: '14px', overflow: 'hidden',
          border: '0.5px solid rgba(255,255,255,0.12)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header: name + price + close */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 22px', borderBottom: '1px solid #ececec', background: '#fafafa', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#111', fontFamily: 'Inter, sans-serif' }}>{template.name}</span>
            <span style={{
              padding: '3px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
              background: free ? 'rgba(34,197,94,0.14)' : 'rgba(17,17,17,0.08)',
              color: free ? '#16a34a' : '#111',
              border: free ? '0.5px solid rgba(34,197,94,0.35)' : '0.5px solid rgba(17,17,17,0.15)',
            }}>
              {free ? 'Free' : `$${template.price}`}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{
              width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e2e2e6',
              background: '#fff', color: '#555', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '18px', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable, read-only full template */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#ffffff' }}>
          {blocks ? (
            <div style={{ pointerEvents: 'none' }}>
              {blocks.map((b, i) => (
                <BlockRenderer key={i} block={b} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af', fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>Loading preview…</div>
          )}
        </div>

        {/* Footer: use this template */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px',
          padding: '14px 22px', borderTop: '1px solid #ececec', background: '#fafafa', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #d4d4d8', color: '#555',
              borderRadius: '8px', padding: '9px 16px', fontSize: '13px', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', fontWeight: 500,
            }}
          >
            Close
          </button>
          <button
            onClick={() => onUse(template.id)}
            disabled={loading}
            style={{
              background: '#111', border: 'none', color: '#fff', borderRadius: '8px',
              padding: '9px 18px', fontSize: '13px', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {loading ? 'Creating…' : 'Use this template'}
          </button>
        </div>
      </div>
    </div>
  )
}

const globalCss = `
  * { box-sizing: border-box; }
  button:hover { opacity: 0.82; }
  .sidebar-check { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 5px 0; }
  .sidebar-check input[type="radio"] {
    width: 15px; height: 15px; cursor: pointer;
    accent-color: #ffffff;
    appearance: auto;
  }
  .sidebar-check input[type="checkbox"] {
    width: 13px; height: 13px; cursor: pointer;
    accent-color: #ffffff;
    appearance: auto;
  }
  .sidebar-check span { font-size: 13px; color: rgba(255,255,255,0.55); font-family: Inter, sans-serif; }
  .sidebar-check.active span { color: #fafafa; }
  .sidebar-sep { height: 0.5px; background: rgba(255,255,255,0.08); margin: 4px 0; }
  @media (max-width: 768px) {
    .layout { flex-direction: column !important; }
    .sidebar { width: 100% !important; position: static !important; height: auto !important; flex-direction: row !important; flex-wrap: wrap !important; gap: 12px !important; padding: 12px 0 !important; border-right: none !important; border-bottom: 0.5px solid rgba(255,255,255,0.08) !important; margin-bottom: 24px !important; }
    .sidebar-section { min-width: 140px; }
    .grid-area { flex: 1 !important; }
    .tmpl-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }
  @media (max-width: 500px) {
    .tmpl-grid { grid-template-columns: 1fr !important; }
  }
`

const sectionLabel = {
  fontSize: '11px',
  fontWeight: '600',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.3)',
  margin: '0 0 10px 0',
}

export default function Templates() {
  const [user, setUser] = useState(null)
  const [templates, setTemplates] = useState([])
  const [previews, setPreviews] = useState({}) // id -> blocks array
  const [activeFilter, setActiveFilter] = useState('All')
  const [priceFilter, setPriceFilter] = useState('All')
  const [popularFilters, setPopularFilters] = useState([])
  const [loadingId, setLoadingId] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load the template catalog, then fetch each template's real blocks so the
  // cards (and modal) can render live previews instead of wireframes.
  useEffect(() => {
    let cancelled = false
    fetch('/api/templates')
      .then(r => r.json())
      .then(list => {
        if (cancelled || !Array.isArray(list)) return
        setTemplates(list)
        list.forEach(t => {
          fetch(`/api/templates/${t.id}/preview`)
            .then(r => r.json())
            .then(blocks => {
              if (cancelled || !Array.isArray(blocks)) return
              setPreviews(prev => ({ ...prev, [t.id]: blocks }))
            })
            .catch(() => {})
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function handleUseTemplate(templateId) {
    if (!user) {
      navigate('/signup')
      return
    }
    if (loadingId) return
    setLoadingId(templateId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ name: 'My Site', templateId }),
      })
      const site = await res.json()
      navigate(`/editor?id=${site.id}`)
    } finally {
      setLoadingId(null)
    }
  }

  function togglePopular(opt) {
    setPopularFilters(prev =>
      prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
    )
  }

  const filtered = templates.filter(t => {
    const catMatch = activeFilter === 'All' || t.category === activeFilter
    const priceMatch = priceFilter === 'All' || (priceFilter === 'Free' ? t.price === 0 : t.price > 0)
    return catMatch && priceMatch
  })

  const previewTemplate = templates.find(t => t.id === previewId) || null

  return (
    <>
      <style>{globalCss}</style>
      <div style={{ minHeight: '100vh', background: '#09090b', fontFamily: 'Inter, sans-serif', color: '#fafafa' }}>

        <AppNavbar />

        {/* Page body */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px' }}>

          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '600', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>Templates</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>Launch faster with ready-made business kits</p>
          </div>

          {/* Layout */}
          <div className="layout" style={{ display: 'flex', gap: '40px', alignItems: 'flex-start' }}>

            {/* Sidebar */}
            <aside className="sidebar" style={{ width: '200px', flexShrink: 0, position: 'sticky', top: '72px', display: 'flex', flexDirection: 'column', gap: '0', paddingRight: '24px', borderRight: '0.5px solid rgba(255,255,255,0.08)' }}>

              <div className="sidebar-section" style={{ paddingBottom: '20px' }}>
                <p style={sectionLabel}>Category</p>
                {categories.map(cat => (
                  <label key={cat} className={`sidebar-check${activeFilter === cat ? ' active' : ''}`} onClick={() => setActiveFilter(cat)}>
                    <input
                      type="radio"
                      name="category"
                      checked={activeFilter === cat}
                      onChange={() => setActiveFilter(cat)}
                    />
                    <span>{cat}</span>
                  </label>
                ))}
              </div>

              <div className="sidebar-sep" />

              <div className="sidebar-section" style={{ paddingTop: '20px', paddingBottom: '20px' }}>
                <p style={sectionLabel}>Price</p>
                {priceOptions.map(opt => (
                  <label key={opt} className={`sidebar-check${priceFilter === opt ? ' active' : ''}`} onClick={() => setPriceFilter(opt)}>
                    <input
                      type="radio"
                      name="price"
                      checked={priceFilter === opt}
                      onChange={() => setPriceFilter(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>

              <div className="sidebar-sep" />

              <div className="sidebar-section" style={{ paddingTop: '20px' }}>
                <p style={sectionLabel}>Popular</p>
                {popularOptions.map(opt => (
                  <label key={opt} className={`sidebar-check${popularFilters.includes(opt) ? ' active' : ''}`} onClick={() => togglePopular(opt)}>
                    <input
                      type="checkbox"
                      checked={popularFilters.includes(opt)}
                      onChange={() => togglePopular(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>

            </aside>

            {/* Grid */}
            <div className="grid-area" style={{ flex: 1, minWidth: 0 }}>
              {templates.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', paddingTop: '20px' }}>Loading templates…</div>
              ) : filtered.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px', paddingTop: '20px' }}>No templates match these filters.</div>
              ) : (
                <div className="tmpl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
                  {filtered.map(t => (
                    <div key={t.id} style={{ background: '#111113', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                      {/* Preview area — real scaled-down render of the template */}
                      <div style={{ height: '200px', position: 'relative', flexShrink: 0, overflow: 'hidden', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                        <MiniPreview blocks={previews[t.id]} />
                        <span style={{
                          position: 'absolute', top: '10px', right: '10px', zIndex: 2,
                          padding: '3px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: '600',
                          background: t.price === 0 ? 'rgba(34,197,94,0.18)' : 'rgba(9,9,11,0.65)',
                          color: t.price === 0 ? '#4ade80' : '#fafafa',
                          border: t.price === 0 ? '0.5px solid rgba(34,197,94,0.4)' : '0.5px solid rgba(255,255,255,0.25)',
                          backdropFilter: 'blur(4px)',
                        }}>
                          {t.price === 0 ? 'Free' : `$${t.price}`}
                        </span>
                      </div>

                      {/* Card body */}
                      <div style={{ padding: '14px 16px 0 16px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <p style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: '#fafafa' }}>{t.name}</p>
                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '500' }}>{t.category}</p>
                        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: '4px 0 0 0', lineHeight: '1.5' }}>{t.description}</p>
                      </div>

                      {/* Buttons */}
                      <div style={{ display: 'flex', gap: '8px', padding: '12px 16px 16px 16px' }}>
                        <button
                          style={{ flex: 1, background: 'transparent', border: '0.5px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.55)', borderRadius: '7px', padding: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                          onClick={() => setPreviewId(t.id)}
                        >
                          Preview
                        </button>
                        <button
                          style={{ flex: 1, background: '#e4e4e7', border: 'none', color: '#09090b', borderRadius: '7px', padding: '8px', fontSize: '13px', fontWeight: '500', cursor: loadingId === t.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', opacity: loadingId === t.id ? 0.6 : 1 }}
                          onClick={() => handleUseTemplate(t.id)}
                          disabled={loadingId === t.id}
                        >
                          {loadingId === t.id ? 'Creating…' : 'Use Template'}
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {previewTemplate && (
        <PreviewModal
          template={previewTemplate}
          blocks={previews[previewTemplate.id]}
          loading={loadingId === previewTemplate.id}
          onClose={() => setPreviewId(null)}
          onUse={handleUseTemplate}
        />
      )}
    </>
  )
}
