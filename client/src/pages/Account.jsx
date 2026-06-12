import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchSubscription, openBillingPortal } from '../lib/subscription'
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

  section: {
    background: colors.surface, border: `0.5px solid ${colors.border}`,
    borderRadius: radii.xl, padding: '24px', marginBottom: '20px',
  },
  sectionTitle: { fontSize: '15px', fontWeight: 500, margin: '0 0 18px 0' },

  label: {
    display: 'block', fontSize: '12px', fontWeight: 500, color: colors.faint,
    textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0',
  },
  value: { fontSize: '14px', color: colors.text, margin: '0 0 20px 0' },

  planRow: { display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 20px 0' },
  planName: { fontSize: '14px', color: colors.text },
  proPill: {
    display: 'inline-block', fontSize: '11px', fontWeight: 600, padding: '2px 8px',
    borderRadius: radii.pill, background: colors.proBg, color: colors.pro,
    border: `0.5px solid ${colors.proBorder}`,
  },

  btnPrimary: {
    background: colors.accent, color: colors.accentText, border: 'none', borderRadius: radii.md,
    padding: '9px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: fonts.sans,
  },
  btnGhost: {
    background: 'transparent', color: colors.text, border: `0.5px solid ${colors.borderStrong}`,
    borderRadius: radii.md, padding: '9px 16px', fontSize: '13px', cursor: 'pointer', fontFamily: fonts.sans,
  },
}

export default function Account() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState('free')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      setEmail(session?.user?.email ?? '')
      const sub = await fetchSubscription()
      if (cancelled) return
      if (sub) setTier(sub.tier)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const isPro = tier === 'pro'

  // Free users → start Stripe Checkout. Pro users → Stripe Customer Portal.
  async function handleUpgrade() {
    if (busy) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else alert(data.error || 'Could not start checkout. Please try again.')
    } catch {
      alert('Could not start checkout. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleManage() {
    if (busy) return
    setBusy(true)
    const err = await openBillingPortal()
    if (err) {
      alert(err)
      setBusy(false)
    }
    // On success the browser navigates to the portal, so no need to clear busy.
  }

  return (
    <>
      <style>{`button:hover { opacity: 0.88; }`}</style>
      <div style={s.page}>
        <AppNavbar links={[]} />

        <div style={s.content}>
          <div style={s.header}>
            <button style={s.back} onClick={() => navigate('/dashboard')}>← Back to dashboard</button>
            <h1 style={s.title}>Account</h1>
            <p style={s.subtitle}>Manage your account and subscription.</p>
          </div>

          {loading ? (
            <p style={{ color: colors.muted }}>Loading…</p>
          ) : (
            <>
              {/* Profile */}
              <section style={s.section}>
                <h2 style={s.sectionTitle}>Profile</h2>
                <label style={s.label}>Email</label>
                <p style={s.value}>{email || '—'}</p>
              </section>

              {/* Plan */}
              <section style={s.section}>
                <h2 style={s.sectionTitle}>Plan</h2>
                <label style={s.label}>Current plan</label>
                <div style={s.planRow}>
                  <span style={s.planName}>{isPro ? 'Pro' : 'Free'}</span>
                  {isPro && <span style={s.proPill}>Pro</span>}
                </div>

                {isPro ? (
                  <button style={s.btnGhost} onClick={handleManage} disabled={busy}>
                    {busy ? 'Opening…' : 'Manage subscription'}
                  </button>
                ) : (
                  <button style={s.btnPrimary} onClick={handleUpgrade} disabled={busy}>
                    {busy ? 'Redirecting…' : 'Upgrade to Pro'}
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  )
}
