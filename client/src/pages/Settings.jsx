import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchSubscription } from '../lib/subscription'
import AppNavbar from '../components/AppNavbar'
import { colors, fonts, radii } from '../lib/theme'

// The embeddable widget script lives at /widget.js on the Tribox host. Build the
// embed snippet from the current origin so it works in dev (Vite proxies
// /widget.js to the Express server) and in production without hardcoding a host.
const widgetSrc = () =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js`

const s = {
  page: { minHeight: '100vh', background: colors.bg, fontFamily: fonts.sans, color: colors.text },
  content: { maxWidth: '760px', margin: '0 auto', padding: '40px 32px' },
  header: { marginBottom: '32px' },
  back: {
    background: 'transparent', border: 'none', color: colors.muted, fontSize: '13px',
    cursor: 'pointer', fontFamily: fonts.sans, padding: 0, marginBottom: '16px',
  },
  title: { fontSize: '24px', fontWeight: 500, margin: 0 },
  subtitle: { fontSize: '13px', color: colors.muted, margin: '4px 0 0 0' },

  section: {
    background: colors.surface, border: `0.5px solid ${colors.border}`,
    borderRadius: radii.xl, padding: '24px', marginBottom: '20px',
  },
  sectionTitle: { fontSize: '15px', fontWeight: 500, margin: '0 0 4px 0' },
  sectionDesc: { fontSize: '13px', color: colors.muted, margin: '0 0 18px 0', lineHeight: 1.5 },
  label: {
    display: 'block', fontSize: '12px', fontWeight: 500, color: colors.faint,
    textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0',
  },
  input: {
    width: '100%', background: colors.bg, border: `0.5px solid ${colors.borderStrong}`,
    color: colors.text, borderRadius: radii.md, padding: '10px 12px', fontSize: '14px',
    fontFamily: fonts.sans, outline: 'none', boxSizing: 'border-box',
  },
  inputDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' },

  btnPrimary: {
    background: colors.accent, color: colors.accentText, border: 'none', borderRadius: radii.md,
    padding: '9px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: fonts.sans,
  },
  btnGhost: {
    background: 'transparent', color: colors.text, border: `0.5px solid ${colors.borderStrong}`,
    borderRadius: radii.md, padding: '9px 16px', fontSize: '13px', cursor: 'pointer', fontFamily: fonts.sans,
  },

  // Domain
  subdomainBox: {
    display: 'flex', alignItems: 'center', background: colors.bg,
    border: `0.5px solid ${colors.border}`, borderRadius: radii.md, padding: '10px 12px',
    fontSize: '14px', color: colors.text, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  proPill: {
    display: 'inline-block', fontSize: '11px', fontWeight: 500, padding: '2px 8px',
    borderRadius: radii.pill, background: colors.proBg, color: colors.pro,
    border: `0.5px solid ${colors.proBorder}`, marginLeft: '8px',
  },
  upgradeBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    background: colors.proBg, border: `0.5px solid ${colors.proBorder}`,
    borderRadius: radii.md, padding: '14px 16px',
  },
  upgradeText: { fontSize: '13px', color: colors.pro, margin: 0 },
  upgradeBtn: {
    background: colors.pro, color: colors.bg, border: 'none', borderRadius: radii.sm,
    padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: fonts.sans, whiteSpace: 'nowrap', textDecoration: 'none',
  },

  // Widget
  codeBox: {
    position: 'relative', background: colors.bg, border: `0.5px solid ${colors.border}`,
    borderRadius: radii.md, padding: '14px 16px', fontSize: '12.5px', lineHeight: 1.6,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#a5b4fc',
    wordBreak: 'break-all', marginBottom: '12px',
  },
  copyBtn: {
    background: 'transparent', color: colors.text, border: `0.5px solid ${colors.borderStrong}`,
    borderRadius: radii.sm, padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: fonts.sans,
  },
  toggleWrap: (on) => ({
    position: 'relative', width: '44px', height: '24px', borderRadius: radii.pill,
    cursor: 'pointer', border: 'none', padding: 0, flexShrink: 0,
    background: on ? colors.success : 'rgba(255,255,255,0.12)', transition: 'background 0.2s',
  }),
  toggleThumb: (on) => ({
    position: 'absolute', top: '3px', left: on ? '23px' : '3px', width: '18px', height: '18px',
    borderRadius: '50%', background: colors.bg, transition: 'left 0.2s',
  }),

  // Danger
  danger: {
    background: colors.surface, border: `0.5px solid ${colors.dangerBorder}`,
    borderRadius: radii.xl, padding: '24px',
  },
  dangerTitle: { fontSize: '15px', fontWeight: 500, margin: '0 0 4px 0', color: colors.danger },
  dangerBtn: {
    background: colors.dangerBg, color: colors.danger, border: `0.5px solid ${colors.dangerBorder}`,
    borderRadius: radii.md, padding: '9px 16px', fontSize: '13px', fontWeight: 500,
    cursor: 'pointer', fontFamily: fonts.sans,
  },
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token}` }
}

export default function Settings() {
  const [params] = useSearchParams()
  const id = params.get('id')
  const navigate = useNavigate()

  const [site, setSite] = useState(null)
  const [isPro, setIsPro] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingDomain, setSavingDomain] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) {
      setError('No site specified.')
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        // Account-level plan (profiles table) gates Pro-only features like the
        // custom domain — not the per-site subscription_tier column.
        const [res, sub] = await Promise.all([
          fetch(`/api/sites/${id}`, { headers: await authHeaders() }),
          fetchSubscription(),
        ])
        if (!res.ok) throw new Error('not-found')
        const data = await res.json()
        if (cancelled) return
        setSite(data)
        setIsPro(sub?.tier === 'pro')
        setName(data.name ?? '')
        setDomain(data.domain_url ?? '')
      } catch {
        if (!cancelled) setError('Could not load this site.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  async function patch(body) {
    const res = await fetch(`/api/sites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('save-failed')
    return res.json()
  }

  async function saveName() {
    if (!name.trim() || savingName) return
    setSavingName(true)
    try {
      const updated = await patch({ name: name.trim() })
      setSite(updated)
    } catch {
      alert('Could not save the site name.')
    } finally {
      setSavingName(false)
    }
  }

  async function saveDomain() {
    if (savingDomain) return
    setSavingDomain(true)
    try {
      const updated = await patch({ domain_url: domain.trim() })
      setSite(updated)
    } catch {
      alert('Could not save the custom domain.')
    } finally {
      setSavingDomain(false)
    }
  }

  async function toggleWidget() {
    const next = !site.is_active
    setSite(prev => ({ ...prev, is_active: next })) // optimistic
    try {
      await patch({ is_active: next })
    } catch {
      setSite(prev => ({ ...prev, is_active: !next })) // revert
      alert('Could not update the widget.')
    }
  }

  // Global toggle: inject the AI Assistant bubble into the published Tribox site.
  async function toggleChatbot() {
    const next = !site.chatbot_enabled
    setSite(prev => ({ ...prev, chatbot_enabled: next })) // optimistic
    try {
      await patch({ chatbot_enabled: next })
    } catch {
      setSite(prev => ({ ...prev, chatbot_enabled: !next })) // revert
      alert('Could not update the AI Assistant.')
    }
  }

  function copyEmbed() {
    navigator.clipboard?.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function deleteSite() {
    if (!window.confirm('Delete this site? This cannot be undone.')) return
    await fetch(`/api/sites/${id}`, { method: 'DELETE', headers: await authHeaders() })
    navigate('/dashboard')
  }

  if (loading) {
    return (
      <div style={s.page}>
        <AppNavbar links={[]} />
        <div style={s.content}><p style={{ color: colors.muted }}>Loading…</p></div>
      </div>
    )
  }

  if (error || !site) {
    return (
      <div style={s.page}>
        <AppNavbar links={[]} />
        <div style={s.content}>
          <p style={{ color: colors.muted }}>{error || 'Site not found.'}</p>
          <button style={s.btnGhost} onClick={() => navigate('/dashboard')}>← Back to dashboard</button>
        </div>
      </div>
    )
  }

  const subdomain = site.slug ? `${site.slug}.tribox.app` : null
  const embedCode = `<script src="${widgetSrc()}" data-api-key="${site.api_key}"></script>`

  return (
    <>
      <style>{`button:hover { opacity: 0.88; } input:focus { border-color: ${colors.accent} !important; }`}</style>
      <div style={s.page}>
        <AppNavbar links={[]} />

        <div style={s.content}>
          <div style={s.header}>
            <button style={s.back} onClick={() => navigate('/dashboard')}>← Back to dashboard</button>
            <h1 style={s.title}>Settings</h1>
            <p style={s.subtitle}>{site.name}</p>
          </div>

          {/* General */}
          <section style={s.section}>
            <h2 style={s.sectionTitle}>General</h2>
            <p style={s.sectionDesc}>Your site's display name.</p>
            <label style={s.label}>Site name</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                style={s.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Site"
              />
              <button
                style={{ ...s.btnPrimary, opacity: !name.trim() || savingName ? 0.6 : 1, whiteSpace: 'nowrap' }}
                onClick={saveName}
                disabled={!name.trim() || savingName}
              >
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
          </section>

          {/* Domain */}
          <section style={s.section}>
            <h2 style={s.sectionTitle}>Domain</h2>
            <p style={s.sectionDesc}>Where your site lives on the web.</p>

            <label style={s.label}>Current subdomain</label>
            <div style={{ ...s.subdomainBox, marginBottom: '20px' }}>
              {subdomain || (
                <span style={{ color: colors.muted, fontFamily: fonts.sans }}>
                  Publish your site to claim a tribox subdomain.
                </span>
              )}
            </div>

            <label style={s.label}>
              Custom domain
              {!isPro && <span style={s.proPill}>Pro</span>}
            </label>
            {isPro ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  style={s.input}
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="https://www.yourdomain.com"
                />
                <button
                  style={{ ...s.btnPrimary, opacity: savingDomain ? 0.6 : 1, whiteSpace: 'nowrap' }}
                  onClick={saveDomain}
                  disabled={savingDomain}
                >
                  {savingDomain ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : (
              <div style={s.upgradeBox}>
                <p style={s.upgradeText}>Connect your own domain with a Pro plan.</p>
                <button style={s.upgradeBtn} onClick={() => navigate('/pricing')}>Upgrade to Pro</button>
              </div>
            )}
          </section>

          {/* Chatbot — AI Assistant */}
          <section style={s.section}>
            <h2 style={s.sectionTitle}>AI Assistant</h2>
            <p style={s.sectionDesc}>
              Add a Gemini-powered chat bubble to your site so visitors can ask questions and get instant answers.
            </p>

            {/* Global toggle: inject the bubble into the published Tribox site. */}
            <div style={s.row}>
              <div>
                <p style={{ fontSize: '14px', margin: '0 0 2px 0' }}>Enable AI Assistant on my site</p>
                <p style={{ fontSize: '12px', color: colors.muted, margin: 0 }}>
                  {site.chatbot_enabled
                    ? 'The chat bubble shows on your published site.'
                    : 'Turn on to show the chat bubble on your published site.'}
                </p>
              </div>
              <button
                style={s.toggleWrap(site.chatbot_enabled)}
                onClick={toggleChatbot}
                aria-label="Toggle AI Assistant"
                aria-pressed={!!site.chatbot_enabled}
              >
                <span style={s.toggleThumb(site.chatbot_enabled)} />
              </button>
            </div>

            {/* External embed: copy-paste snippet for non-Tribox sites. */}
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `0.5px solid ${colors.border}` }}>
              <p style={{ ...s.sectionDesc, marginBottom: '12px' }}>
                Using the chatbot on an external site? Paste this snippet before <code>&lt;/body&gt;</code>.
              </p>
              <div style={s.codeBox}>{embedCode}</div>
              <button style={s.copyBtn} onClick={copyEmbed}>{copied ? '✓ Copied' : 'Copy code'}</button>
            </div>

            {/* Master kill-switch: when off, /api/chat rejects every embed. */}
            <div style={{ ...s.row, marginTop: '20px', paddingTop: '20px', borderTop: `0.5px solid ${colors.border}` }}>
              <div>
                <p style={{ fontSize: '14px', margin: '0 0 2px 0' }}>Chatbot service active</p>
                <p style={{ fontSize: '12px', color: colors.muted, margin: 0 }}>
                  {site.is_active
                    ? 'The chatbot is answering messages.'
                    : 'The chatbot is paused everywhere — published site and external embeds.'}
                </p>
              </div>
              <button
                style={s.toggleWrap(site.is_active)}
                onClick={toggleWidget}
                aria-label="Toggle chatbot service"
                aria-pressed={site.is_active}
              >
                <span style={s.toggleThumb(site.is_active)} />
              </button>
            </div>
          </section>

          {/* Danger zone */}
          <section style={s.danger}>
            <h2 style={s.dangerTitle}>Danger zone</h2>
            <p style={s.sectionDesc}>Permanently delete this site and all of its data.</p>
            <button style={s.dangerBtn} onClick={deleteSite}>Delete site</button>
          </section>
        </div>
      </div>
    </>
  )
}
