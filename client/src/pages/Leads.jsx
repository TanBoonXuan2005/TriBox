import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppNavbar from '../components/AppNavbar'
import { colors, fonts, radii } from '../lib/theme'

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

  card: {
    background: colors.surface, border: `0.5px solid ${colors.border}`,
    borderRadius: radii.xl, padding: '20px 22px', marginBottom: '14px',
  },
  cardUnread: {
    background: colors.surface, border: `0.5px solid ${colors.successBorder}`,
    borderRadius: radii.xl, padding: '20px 22px', marginBottom: '14px',
  },
  cardTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '12px', marginBottom: '14px',
  },
  time: { fontSize: '12px', color: colors.muted },
  newPill: {
    fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: radii.pill,
    background: colors.successBg, color: colors.success, border: `0.5px solid ${colors.successBorder}`,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px' },
  fieldLabel: {
    fontSize: '11px', fontWeight: 500, color: colors.faint,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  fieldValue: { fontSize: '14px', color: colors.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },

  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '64px 20px', textAlign: 'center', gap: '6px',
  },
  emptyIcon: { fontSize: '34px', marginBottom: '8px', opacity: 0.5 },
  emptyTitle: { fontSize: '18px', fontWeight: 500, color: colors.text, margin: 0 },
  emptySub: { fontSize: '13px', color: colors.muted, margin: 0, maxWidth: '380px', lineHeight: 1.5 },
  btnGhost: {
    background: 'transparent', color: colors.text, border: `0.5px solid ${colors.borderStrong}`,
    borderRadius: radii.md, padding: '9px 16px', fontSize: '13px', cursor: 'pointer',
    fontFamily: fonts.sans, marginTop: '16px',
  },
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token}` }
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function Leads() {
  const [params] = useSearchParams()
  const id = params.get('id')
  const navigate = useNavigate()

  const [siteName, setSiteName] = useState('')
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) {
      setError('No site specified.')
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const headers = await authHeaders()
        const [siteRes, leadsRes] = await Promise.all([
          fetch(`/api/sites/${id}`, { headers }),
          fetch(`/api/sites/${id}/leads`, { headers }),
        ])
        if (!leadsRes.ok) throw new Error('not-found')
        const leadsData = await leadsRes.json()
        if (cancelled) return
        if (siteRes.ok) {
          const site = await siteRes.json()
          setSiteName(site.name ?? '')
        }
        setLeads(Array.isArray(leadsData.leads) ? leadsData.leads : [])

        // Viewing the inbox marks everything read, clearing the dashboard badge.
        if (leadsData.unreadCount > 0) {
          fetch(`/api/sites/${id}/leads/read`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({}),
          }).catch(() => {})
        }
      } catch {
        if (!cancelled) setError('Could not load messages for this site.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div style={s.page}>
        <AppNavbar links={[]} />
        <div style={s.content}><p style={{ color: colors.muted }}>Loading…</p></div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={s.page}>
        <AppNavbar links={[]} />
        <div style={s.content}>
          <p style={{ color: colors.muted }}>{error}</p>
          <button style={s.btnGhost} onClick={() => navigate('/dashboard')}>← Back to dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <AppNavbar links={[]} />
      <div style={s.content}>
        <div style={s.header}>
          <button style={s.back} onClick={() => navigate('/dashboard')}>← Back to dashboard</button>
          <h1 style={s.title}>Messages</h1>
          <p style={s.subtitle}>
            {siteName ? `${siteName} · ` : ''}
            {leads.length === 0
              ? 'No submissions yet'
              : `${leads.length} submission${leads.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {leads.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>✉</div>
            <h2 style={s.emptyTitle}>No messages yet</h2>
            <p style={s.emptySub}>
              When visitors submit a Form on your published site, their messages show up here.
            </p>
          </div>
        ) : (
          leads.map((lead) => {
            const entries = Object.entries(lead.data || {})
            return (
              <div key={lead.id} style={lead.is_read ? s.card : s.cardUnread}>
                <div style={s.cardTop}>
                  <span style={s.time}>{formatTime(lead.created_at)}</span>
                  {!lead.is_read && <span style={s.newPill}>New</span>}
                </div>
                {entries.length === 0 ? (
                  <p style={s.fieldValue}>(empty submission)</p>
                ) : (
                  entries.map(([key, value]) => (
                    <div key={key} style={s.field}>
                      <span style={s.fieldLabel}>{key}</span>
                      <span style={s.fieldValue}>{String(value) || '—'}</span>
                    </div>
                  ))
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
