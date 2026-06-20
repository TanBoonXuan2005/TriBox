import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppNavbar from '../components/AppNavbar'
import { supabase } from '../lib/supabase'
import { fetchSubscription } from '../lib/subscription'

const featureRows = [
  { label: 'Sites', free: '1', pro: 'Unlimited' },
  { label: 'AI Agent', free: '50/day', pro: 'Unlimited' },
  { label: 'Custom domain', free: false, pro: true },
  { label: 'Templates', free: 'Basic', pro: 'All + premium' },
  { label: 'Team members', free: '1', pro: '5' },
  { label: 'Storage', free: '500MB', pro: '10GB' },
  { label: 'Support', free: 'Community', pro: '24h priority' },
  { label: 'API access', free: false, pro: true },
]

const faqs = [
  { q: 'Can I switch plans later?', a: 'Yes, you can upgrade or downgrade at any time. Changes take effect immediately and billing is prorated.' },
  { q: 'What payment methods do you accept?', a: 'We accept all major credit cards (Visa, Mastercard, Amex), processed securely by Stripe.' },
  { q: 'Is there a free trial for Pro?', a: 'Every account starts on the Free plan with no time limit. Pro features are available immediately after upgrading.' },
  { q: 'Can I cancel anytime?', a: 'Absolutely. Cancel from your account settings via the Stripe customer portal with no fees or lock-ins. Your plan stays active until the billing period ends.' },
  { q: 'What is your refund policy?', a: 'Refunds are handled case-by-case — email support@tribox.app and we\'ll sort it out.' },
  { q: 'What happens when I hit the free AI limit?', a: 'AI features pause until the next day when your quota resets. Upgrade to Pro for unlimited AI Agent access.' },
]

const s = {
  page: {
    minHeight: '100vh',
    background: '#09090b',
    fontFamily: 'Inter, sans-serif',
    color: '#fafafa',
  },
  content: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '64px 32px',
  },
  pageHeader: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  pageTitle: {
    fontSize: '40px',
    fontWeight: '700',
    margin: '0 0 12px 0',
    letterSpacing: '-1px',
  },
  pageSubtitle: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.45)',
    margin: 0,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '48px',
  },
  toggleLabel: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.55)',
  },
  toggleWrap: {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '99px',
    cursor: 'pointer',
    border: 'none',
    padding: 0,
    outline: 'none',
    transition: 'background 0.2s',
  },
  toggleThumb: (on) => ({
    position: 'absolute',
    top: '3px',
    left: on ? '23px' : '3px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#09090b',
    transition: 'left 0.2s',
  }),
  saveBadge: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#4ade80',
    background: 'rgba(34,197,94,0.15)',
    border: '0.5px solid rgba(34,197,94,0.3)',
    borderRadius: '99px',
    padding: '2px 8px',
  },
  cardsRow: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    marginBottom: '64px',
  },
  planCard: (highlight) => ({
    background: '#111113',
    border: highlight ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    padding: '28px',
    flex: 1,
    maxWidth: '270px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }),
  planName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: '0 0 8px 0',
  },
  planPrice: {
    fontSize: '36px',
    fontWeight: '700',
    letterSpacing: '-1px',
    margin: '0',
    color: '#fafafa',
  },
  planPeriod: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.35)',
    margin: '0 0 4px 0',
  },
  planTagline: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.45)',
    margin: '0 0 20px 0',
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 24px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.7)',
  },
  check: {
    color: '#4ade80',
    fontWeight: '700',
    flexShrink: 0,
    marginTop: '1px',
  },
  planBtn: (filled) => ({
    display: 'block',
    width: '100%',
    padding: '11px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    textAlign: 'center',
    textDecoration: 'none',
    border: filled ? 'none' : '0.5px solid rgba(255,255,255,0.15)',
    background: filled ? '#e4e4e7' : 'transparent',
    color: filled ? '#09090b' : 'rgba(255,255,255,0.7)',
    boxSizing: 'border-box',
    marginTop: 'auto',
  }),
  currentPlanBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
    padding: '11px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    textAlign: 'center',
    border: '0.5px solid rgba(34,197,94,0.3)',
    background: 'rgba(34,197,94,0.15)',
    color: '#4ade80',
    boxSizing: 'border-box',
    marginTop: 'auto',
    cursor: 'default',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    margin: '0 0 20px 0',
    letterSpacing: '-0.3px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '64px',
  },
  th: {
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '10px 16px',
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
  },
  thRight: {
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '10px 16px',
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
  },
  td: {
    padding: '12px 16px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.6)',
    borderBottom: '0.5px solid rgba(255,255,255,0.05)',
  },
  tdCenter: {
    padding: '12px 16px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.6)',
    borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    textAlign: 'center',
  },
  tdCheck: {
    padding: '12px 16px',
    fontSize: '13px',
    color: '#4ade80',
    fontWeight: '700',
    borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    textAlign: 'center',
  },
  tdX: {
    padding: '12px 16px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.2)',
    borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    textAlign: 'center',
  },
  faqWrap: {
    marginBottom: '64px',
  },
  faqItem: {
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
  },
  faqBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'none',
    border: 'none',
    color: '#fafafa',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    padding: '18px 0',
    cursor: 'pointer',
    textAlign: 'left',
    gap: '16px',
  },
  faqChevron: (open) => ({
    flexShrink: 0,
    fontSize: '18px',
    color: 'rgba(255,255,255,0.35)',
    transform: open ? 'rotate(180deg)' : 'none',
    transition: 'transform 0.2s',
    lineHeight: 1,
  }),
  faqAnswer: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    lineHeight: '1.6',
    padding: '0 0 18px 0',
    margin: 0,
  },
  cta: {
    textAlign: 'center',
    padding: '64px 32px',
    borderTop: '0.5px solid rgba(255,255,255,0.07)',
  },
  ctaTitle: {
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 10px 0',
    letterSpacing: '-0.5px',
  },
  ctaSubtitle: {
    fontSize: '15px',
    color: 'rgba(255,255,255,0.45)',
    margin: '0 0 28px 0',
  },
  ctaBtns: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  ctaBtnFilled: {
    padding: '11px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    background: '#e4e4e7',
    color: '#09090b',
    border: 'none',
    textDecoration: 'none',
    display: 'inline-block',
  },
  ctaBtnGhost: {
    padding: '11px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    background: 'transparent',
    color: 'rgba(255,255,255,0.65)',
    border: '0.5px solid rgba(255,255,255,0.15)',
    textDecoration: 'none',
    display: 'inline-block',
  },
}

function Cell({ value }) {
  if (value === true) return <td style={s.tdCheck}>✓</td>
  if (value === false) return <td style={s.tdX}>✗</td>
  return <td style={s.tdCenter}>{value}</td>
}

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [openFaq, setOpenFaq] = useState(null)
  const [upgrading, setUpgrading] = useState(false)
  // null = not logged in / unknown; otherwise 'free' | 'pro'. Same source of
  // truth (fetchSubscription → /api/me/subscription) the navbar and /account use.
  const [tier, setTier] = useState(null)
  const navigate = useNavigate()

  // Reflect the user's account-level plan on the plan cards. If they're already
  // Pro, the Pro card shows "Current plan" instead of an upgrade button.
  useEffect(() => {
    let cancelled = false
    fetchSubscription().then((sub) => {
      if (!cancelled) setTier(sub ? sub.tier : null)
    })
    return () => { cancelled = true }
  }, [])

  const isPro = tier === 'pro'
  const isFree = tier === 'free'

  const proPrice = billingCycle === 'yearly' ? 23 : 29
  const yearly = billingCycle === 'yearly'

  // Logged in → start Stripe Checkout and hand off to the hosted page.
  // Not logged in → send them to sign up first.
  async function handleUpgrade() {
    if (upgrading) return
    setUpgrading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/signup')
        return
      }
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Could not start checkout. Please try again.')
      }
    } catch {
      alert('Could not start checkout. Please try again.')
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <>
      <style>{`button:hover { opacity: 0.85; } a:hover { opacity: 0.85; }`}</style>
      <div style={s.page}>
        <AppNavbar />

        <div style={s.content}>
          {/* Header */}
          <div style={s.pageHeader}>
            <h1 style={s.pageTitle}>Pricing</h1>
            <p style={s.pageSubtitle}>Simple, transparent pricing. No surprises.</p>
          </div>

          {/* Toggle */}
          <div style={s.toggleRow}>
            <span style={{ ...s.toggleLabel, color: !yearly ? '#fafafa' : 'rgba(255,255,255,0.45)' }}>Monthly</span>
            <button
              style={{
                ...s.toggleWrap,
                background: yearly ? '#e4e4e7' : 'rgba(255,255,255,0.12)',
              }}
              onClick={() => setBillingCycle(yearly ? 'monthly' : 'yearly')}
              aria-label="Toggle billing cycle"
            >
              <div style={s.toggleThumb(yearly)} />
            </button>
            <span style={{ ...s.toggleLabel, color: yearly ? '#fafafa' : 'rgba(255,255,255,0.45)' }}>Yearly</span>
            {yearly && <span style={s.saveBadge}>Save 20%</span>}
          </div>

          {/* Plan cards */}
          <div style={s.cardsRow}>
            {/* Free */}
            <div style={s.planCard(false)}>
              <p style={s.planName}>Free</p>
              <p style={s.planPrice}>$0</p>
              <p style={s.planPeriod}>/mo</p>
              <p style={s.planTagline}>For side projects</p>
              <ul style={s.featureList}>
                {['1 site', 'Basic templates', 'Tribox subdomain', '50 AI messages/day', 'Community support'].map(f => (
                  <li key={f} style={s.featureItem}>
                    <span style={s.check}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {isPro ? (
                <Link to="/account" style={s.planBtn(false)}>Downgrade</Link>
              ) : isFree ? (
                <div style={s.currentPlanBtn}>
                  <span>✓</span> Current plan
                </div>
              ) : (
                <Link to="/signup" style={s.planBtn(false)}>Get started free</Link>
              )}
            </div>

            {/* Pro */}
            <div style={s.planCard(true)}>
              <p style={s.planName}>Pro</p>
              <p style={s.planPrice}>${proPrice}</p>
              <p style={s.planPeriod}>/mo{yearly ? ', billed yearly' : ''}</p>
              <p style={s.planTagline}>For businesses ready to grow</p>
              <ul style={s.featureList}>
                {[
                  'Unlimited sites',
                  'All templates',
                  'AI Agent (unlimited)',
                  'Custom domain',
                  '10GB storage',
                  'Priority support',
                  'API access',
                ].map(f => (
                  <li key={f} style={s.featureItem}>
                    <span style={s.check}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {isPro ? (
                <div style={s.currentPlanBtn}>
                  <span>✓</span> Current plan
                </div>
              ) : (
                <button
                  style={{ ...s.planBtn(true), opacity: upgrading ? 0.6 : 1 }}
                  onClick={handleUpgrade}
                  disabled={upgrading}
                >
                  {upgrading ? 'Redirecting…' : 'Upgrade to Pro'}
                </button>
              )}
            </div>
          </div>

          {/* Compare table */}
          <h2 style={s.sectionTitle}>Compare features</h2>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Feature</th>
                <th style={s.thRight}>Free</th>
                <th style={s.thRight}>Pro</th>
              </tr>
            </thead>
            <tbody>
              {featureRows.map(row => (
                <tr key={row.label}>
                  <td style={s.td}>{row.label}</td>
                  <Cell value={row.free} />
                  <Cell value={row.pro} />
                </tr>
              ))}
            </tbody>
          </table>

          {/* FAQ */}
          <h2 style={s.sectionTitle}>Frequently asked questions</h2>
          <div style={s.faqWrap}>
            {faqs.map((faq, i) => (
              <div key={i} style={s.faqItem}>
                <button
                  style={s.faqBtn}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  {faq.q}
                  <span style={s.faqChevron(openFaq === i)}>⌄</span>
                </button>
                {openFaq === i && <p style={s.faqAnswer}>{faq.a}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={s.cta}>
          <h2 style={s.ctaTitle}>Ready to launch?</h2>
          <p style={s.ctaSubtitle}>Start building free today — no credit card needed</p>
          <div style={s.ctaBtns}>
            <Link to="/signup" style={s.ctaBtnFilled}>Start free</Link>
            <a href="mailto:hello@tribox.app" style={s.ctaBtnGhost}>Talk to us</a>
          </div>
        </div>
      </div>
    </>
  )
}
