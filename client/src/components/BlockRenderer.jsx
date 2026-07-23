import { useState, useEffect, useRef, createElement } from 'react'

/* SHARED BLOCK RENDERER
   Block definitions, the universal style system, and BlockRenderer, extracted
   from Editor.jsx so the Editor and the Templates page render blocks the same
   way. Editor.jsx imports the named exports it still needs from here. */

/* ────────────────────────────────────────────────────────────────
   BLOCK DEFINITIONS
   Each type maps to a human label, default props, and a render(props)
   function that returns real, styled website HTML — these are the same
   sections the chatbot widget concept assembles.
   ──────────────────────────────────────────────────────────────── */
const HEADING_SIZES = { h1: 40, h2: 30, h3: 23, h4: 19 }
const IMAGE_WIDTH_MAP = { full: '100%', half: '50%', third: '33.33%' }
const IMAGE_WIDTH_OPTIONS = ['full', 'half', 'third']
const OBJECT_FIT_OPTIONS = ['cover', 'contain']
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB

// A nav link may be a plain string (legacy: display text) or an object
// { label, type:'page'|'url', pageId, url }. The editor canvas only needs the
// display label — real hrefs are resolved server-side at publish time.
function navLinkLabel(link) {
  return typeof link === 'string' ? link : (link && link.label) || ''
}

const BLOCK_DEFINITIONS = {
  navbar: {
    label: 'Navbar',
    // ctaLink reuses the Button block's link shape ('' | legacy URL string |
    // { type:'page'|'url', pageId, url }) and is resolved server-side at publish.
    defaultProps: { logo: 'My Site', links: ['Home', 'About', 'Shop'], cta: 'Sign up', ctaLink: '' },
    render: (p) => (
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: '1px solid #ececec', background: '#ffffff',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>
          {p.logo}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div style={{ display: 'flex', gap: '26px' }}>
            {(p.links || []).map((l, i) => (
              <span key={i} style={{ fontSize: '14px', color: '#555', fontWeight: 500 }}>{navLinkLabel(l)}</span>
            ))}
          </div>
          <span style={{
            background: '#111', color: '#fff', padding: '8px 16px', borderRadius: '7px',
            fontSize: '13px', fontWeight: 600,
          }}>{p.cta}</span>
        </div>
      </nav>
    ),
  },

  hero: {
    label: 'Hero',
    defaultProps: { title: 'Welcome', subtitle: 'Your tagline here', ctaText: 'Get started', ctaLink: '', bgColor: '#f5f5f5' },
    render: (p) => (
      <section style={{ background: p.bgColor, padding: '78px 32px', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 14px', fontSize: '44px', fontWeight: 800, color: '#111', letterSpacing: '-0.02em' }}>
          {p.title}
        </h1>
        <p style={{ margin: '0 0 30px', fontSize: '18px', color: '#666', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
          {p.subtitle}
        </p>
        <span style={{
          display: 'inline-block', background: '#378ADD', color: '#fff', padding: '13px 28px',
          borderRadius: '9px', fontSize: '15px', fontWeight: 600,
        }}>{p.ctaText}</span>
      </section>
    ),
  },

  heading: {
    label: 'Heading',
    defaultProps: { text: 'Section heading', level: 'h2' },
    render: (p) => createElement(
      p.level || 'h2',
      { style: { margin: 0, padding: '22px 32px', fontSize: `${HEADING_SIZES[p.level] || 30}px`, fontWeight: 700, color: '#111', letterSpacing: '-0.01em' } },
      p.text,
    ),
  },

  text: {
    label: 'Text',
    defaultProps: { content: 'Your paragraph text goes here.' },
    render: (p) => (
      <p style={{ margin: 0, padding: '16px 32px', fontSize: '16px', lineHeight: 1.65, color: '#444' }}>
        {p.content}
      </p>
    ),
  },

  button: {
    label: 'Button',
    // `link` is a page/URL destination resolved at publish time (see server.js).
    // '' = no link. A legacy plain-URL string is still accepted by the resolver.
    defaultProps: { text: 'Click me', variant: 'filled', link: '' },
    render: (p) => (
      <div style={{ padding: '18px 32px' }}>
        <span style={{
          display: 'inline-block', padding: '11px 24px', borderRadius: '8px',
          fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          ...(p.variant === 'outline'
            ? { background: 'transparent', color: '#378ADD', border: '1.5px solid #378ADD' }
            : { background: '#378ADD', color: '#fff', border: '1.5px solid #378ADD' }),
        }}>{p.text}</span>
      </div>
    ),
  },

  image: {
    label: 'Image',
    defaultProps: { src: '', alt: 'Image', width: 'full', height: 0, borderRadius: 8, objectFit: 'cover' },
    render: (p) => {
      const w = IMAGE_WIDTH_MAP[p.width] || '100%'
      const radius = `${p.borderRadius ?? 8}px`
      return (
        <div style={{ padding: '18px 32px' }}>
          {p.src ? (
            <img
              src={p.src}
              alt={p.alt}
              style={{
                width: w,
                height: p.height ? `${p.height}px` : 'auto',
                objectFit: p.objectFit || 'cover',
                borderRadius: radius,
                display: 'block',
              }}
            />
          ) : (
            <div style={{
              width: w, height: p.height ? `${p.height}px` : '220px', borderRadius: radius, background: '#f1f1f3',
              border: '1.5px dashed #d4d4d8', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#9ca3af',
            }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span style={{ fontSize: '13px' }}>{p.alt}</span>
            </div>
          )}
        </div>
      )
    },
  },

  columns: {
    label: 'Columns',
    defaultProps: { count: 3, items: ['Col 1', 'Col 2', 'Col 3'] },
    render: (p) => (
      <div style={{ display: 'flex', gap: '16px', padding: '28px 32px' }}>
        {p.items.slice(0, p.count).map((item, i) => (
          <div key={i} style={{
            flex: 1, background: '#f7f7f8', borderRadius: '8px', padding: '28px 20px',
            fontSize: '14px', color: '#555', textAlign: 'center', border: '1px solid #eee',
          }}>{item}</div>
        ))}
      </div>
    ),
  },

  productGrid: {
    label: 'Product Grid',
    defaultProps: {
      columns: 3,
      products: [
        { name: 'Product 1', price: '$29' },
        { name: 'Product 2', price: '$49' },
        { name: 'Product 3', price: '$19' },
      ],
    },
    render: (p) => (
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${p.columns}, 1fr)`,
        gap: '18px', padding: '28px 32px',
      }}>
        {p.products.map((prod, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: '10px', border: '1px solid #ececec', overflow: 'hidden',
          }}>
            <div style={{
              height: '140px', background: 'linear-gradient(135deg,#f3f4f6,#e7e8ec)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4c7cf',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>{prod.name}</div>
              <div style={{ fontSize: '14px', color: '#378ADD', fontWeight: 600 }}>{prod.price}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },

  searchBar: {
    label: 'Search Bar',
    defaultProps: { placeholder: 'Search...' },
    render: (p) => (
      <div style={{ padding: '18px 32px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px',
          border: '1px solid #e2e2e6', borderRadius: '10px', background: '#fafafa', color: '#9ca3af',
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: '14px' }}>{p.placeholder}</span>
        </div>
      </div>
    ),
  },

  footer: {
    label: 'Footer',
    defaultProps: { text: '© 2025 My Site', links: ['Privacy', 'Terms'] },
    render: (p) => (
      <footer style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '24px 32px', background: '#111', color: '#d4d4d8',
      }}>
        <span style={{ fontSize: '13px' }}>{p.text}</span>
        <div style={{ display: 'flex', gap: '22px' }}>
          {(p.links || []).map((l, i) => (
            <span key={i} style={{ fontSize: '13px', color: '#a1a1aa' }}>{navLinkLabel(l)}</span>
          ))}
        </div>
      </footer>
    ),
  },

  /* ── MARKETING ─────────────────────────────────────────────── */
  testimonials: {
    label: 'Testimonials',
    defaultProps: {
      title: 'Loved by thousands',
      items: [
        { quote: 'This completely transformed how our team ships products.', author: 'Sarah Chen', role: 'CEO, Northwind' },
        { quote: 'The best tool we adopted all year — setup took five minutes.', author: 'Marcus Reed', role: 'CTO, Lumen' },
        { quote: 'Support is incredible and the product just keeps getting better.', author: 'Priya Patel', role: 'Head of Design, Vela' },
      ],
    },
    render: (p) => (
      <section style={{ padding: '60px 32px', background: '#fafafa' }}>
        {p.title && (
          <h2 style={{ margin: '0 0 38px', fontSize: '30px', fontWeight: 800, color: '#111', textAlign: 'center', letterSpacing: '-0.02em' }}>{p.title}</h2>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, (p.items || []).length || 1))}, 1fr)`, gap: '20px' }}>
          {(p.items || []).map((t, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #ececec', borderRadius: '14px', padding: '26px 24px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ color: '#f5b301', fontSize: '15px', letterSpacing: '2px', marginBottom: '12px' }}>★★★★★</div>
              <p style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: 1.6, color: '#333' }}>“{t.quote}”</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg,#378ADD,#6db3f2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px' }}>
                  {(t.author || '?').charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111' }}>{t.author}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    ),
  },

  faq: {
    label: 'FAQ',
    defaultProps: {
      title: 'Frequently asked questions',
      items: [
        { question: 'How does the free trial work?', answer: 'You get full access for 14 days, no credit card required. Cancel anytime.' },
        { question: 'Can I change plans later?', answer: 'Absolutely — upgrade or downgrade at any point and we prorate the difference.' },
        { question: 'Do you offer refunds?', answer: 'Yes, we offer a 30-day money-back guarantee on all annual plans.' },
      ],
    },
    render: (p) => <FaqBlock {...p} />,
  },

  pricingTable: {
    label: 'Pricing Table',
    defaultProps: {
      plans: [
        { name: 'Starter', price: '$9', features: ['1 project', '5 GB storage', 'Email support'], highlighted: false, link: '' },
        { name: 'Pro', price: '$29', features: ['Unlimited projects', '100 GB storage', 'Priority support', 'Analytics'], highlighted: true, link: '' },
        { name: 'Enterprise', price: '$99', features: ['Everything in Pro', 'SSO & SAML', 'Dedicated manager', 'SLA'], highlighted: false, link: '' },
      ],
    },
    render: (p) => (
      <section style={{ padding: '60px 32px', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, (p.plans || []).length || 1)}, 1fr)`, gap: '20px', alignItems: 'stretch' }}>
          {(p.plans || []).map((plan, i) => {
            const hot = plan.highlighted === true || plan.highlighted === 'true'
            return (
              <div key={i} style={{
                position: 'relative', borderRadius: '16px', padding: '30px 26px',
                background: hot ? 'linear-gradient(165deg,#378ADD,#2f6fc0)' : '#fff',
                color: hot ? '#fff' : '#111',
                border: hot ? 'none' : '1px solid #ececec',
                boxShadow: hot ? '0 16px 40px rgba(55,138,221,0.35)' : '0 1px 3px rgba(0,0,0,0.05)',
                transform: hot ? 'scale(1.03)' : 'none',
              }}>
                {hot && (
                  <span style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.22)', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>POPULAR</span>
                )}
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>{plan.name}</div>
                <div style={{ marginBottom: '20px' }}>
                  <span style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-0.02em' }}>{plan.price}</span>
                  <span style={{ fontSize: '14px', opacity: 0.7 }}> /mo</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', marginBottom: '26px' }}>
                  {(plan.features || []).map((f, fi) => (
                    <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '14px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hot ? '#fff' : '#378ADD'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span style={{ opacity: hot ? 0.95 : 0.85 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <div style={{
                  textAlign: 'center', padding: '11px 0', borderRadius: '9px', fontSize: '14px', fontWeight: 700,
                  background: hot ? '#fff' : '#378ADD', color: hot ? '#2f6fc0' : '#fff',
                }}>Get started</div>
              </div>
            )
          })}
        </div>
      </section>
    ),
  },

  cta: {
    label: 'CTA',
    defaultProps: { heading: 'Ready to get started?', subtext: 'Join thousands of teams building faster today.', buttonText: 'Start free trial', buttonLink: '', bgColor: '#111111' },
    render: (p) => (
      <section style={{ background: p.bgColor || '#111', padding: '64px 32px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '34px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{p.heading}</h2>
        <p style={{ margin: '0 0 28px', fontSize: '17px', color: 'rgba(255,255,255,0.72)', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>{p.subtext}</p>
        <span style={{ display: 'inline-block', background: '#fff', color: '#111', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: 700 }}>{p.buttonText}</span>
      </section>
    ),
  },

  /* ── CONTENT ───────────────────────────────────────────────── */
  video: {
    label: 'Video',
    defaultProps: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', autoplay: false, aspectRatio: '16:9' },
    render: (p) => {
      const embed = getVideoEmbed(p.url)
      const pad = ASPECT_PAD[p.aspectRatio] || '56.25%'
      const auto = p.autoplay === true || p.autoplay === 'true'
      const src = embed ? `${embed}${auto ? (embed.includes('?') ? '&' : '?') + 'autoplay=1&mute=1' : ''}` : ''
      return (
        <div style={{ padding: '24px 32px' }}>
          <div style={{ position: 'relative', width: '100%', paddingBottom: pad, borderRadius: '12px', overflow: 'hidden', background: '#000', boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}>
            {src ? (
              <iframe
                src={src}
                title="Video"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.55)' }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="rgba(255,255,255,0.12)" /><path d="M10 8l6 4-6 4z" fill="#fff" /></svg>
              </div>
            )}
          </div>
        </div>
      )
    },
  },

  accordion: {
    label: 'Accordion',
    defaultProps: {
      items: [
        { title: 'What is included?', content: 'Every plan includes the full feature set, unlimited updates, and community access.' },
        { title: 'How do I get support?', content: 'Reach our team 24/7 via live chat or email — we typically respond in under an hour.' },
        { title: 'Can I cancel anytime?', content: 'Yes. There are no contracts and you can cancel with a single click from your dashboard.' },
      ],
    },
    render: (p) => <AccordionBlock {...p} />,
  },

  tabs: {
    label: 'Tabs',
    defaultProps: {
      tabs: [
        { label: 'Overview', content: 'A high-level summary of everything this product can do for your team.' },
        { label: 'Features', content: 'Powerful building blocks: automations, integrations, analytics and more.' },
        { label: 'Pricing', content: 'Simple, transparent pricing that scales with you. No hidden fees.' },
      ],
    },
    render: (p) => <TabsBlock {...p} />,
  },

  gallery: {
    label: 'Gallery',
    defaultProps: { images: ['', '', '', '', '', ''], columns: 3 },
    render: (p) => {
      const cols = Number(p.columns) || 3
      const imgs = p.images && p.images.length ? p.images : []
      return (
        <div style={{ padding: '28px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px' }}>
            {imgs.map((src, i) => (
              <div key={i} style={{ position: 'relative', paddingBottom: '72%', borderRadius: '10px', overflow: 'hidden', background: 'linear-gradient(135deg,#eef1f6,#dfe4ec)' }}>
                {src ? (
                  <img src={src} alt={`Gallery ${i + 1}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b6bcc8' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    },
  },

  /* ── ECOMMERCE ─────────────────────────────────────────────── */
  cart: {
    label: 'Cart',
    defaultProps: {},
    render: () => {
      const items = [
        { name: 'Wireless Headphones', qty: 1, price: 129 },
        { name: 'USB-C Charging Cable', qty: 2, price: 19 },
        { name: 'Laptop Sleeve 14"', qty: 1, price: 39 },
      ]
      const subtotal = items.reduce((a, it) => a + it.price * it.qty, 0)
      const shipping = 8
      return (
        <div style={{ padding: '28px 32px' }}>
          <div style={{ maxWidth: '460px', margin: '0 auto', border: '1px solid #ececec', borderRadius: '14px', overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f0f0f0', fontSize: '16px', fontWeight: 700, color: '#111' }}>Your cart ({items.length})</div>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 22px', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '8px', background: 'linear-gradient(135deg,#f0f2f6,#e2e6ee)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>{it.name}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>Qty {it.qty}</div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>${it.price * it.qty}</div>
              </div>
            ))}
            <div style={{ padding: '16px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666', marginBottom: '7px' }}><span>Subtotal</span><span>${subtotal}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666', marginBottom: '12px' }}><span>Shipping</span><span>${shipping}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: '#111', paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}><span>Total</span><span>${subtotal + shipping}</span></div>
              <div style={{ marginTop: '16px', textAlign: 'center', background: '#378ADD', color: '#fff', padding: '12px 0', borderRadius: '9px', fontSize: '14px', fontWeight: 700 }}>Checkout</div>
            </div>
          </div>
        </div>
      )
    },
  },

  reviews: {
    label: 'Reviews',
    defaultProps: {
      items: [
        { stars: 5, text: 'Exceeded my expectations. The quality is fantastic and shipping was fast.', author: 'Alex M.' },
        { stars: 4, text: 'Really solid product for the price. Would buy again.', author: 'Jordan T.' },
        { stars: 5, text: 'Absolutely love it — using it every single day now.', author: 'Sam R.' },
      ],
    },
    render: (p) => (
      <section style={{ padding: '44px 32px', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, (p.items || []).length || 1))}, 1fr)`, gap: '18px' }}>
          {(p.items || []).map((r, i) => {
            const n = Math.max(0, Math.min(5, Number(r.stars) || 0))
            return (
              <div key={i} style={{ border: '1px solid #ececec', borderRadius: '12px', padding: '22px 20px', background: '#fafafa' }}>
                <div style={{ fontSize: '16px', letterSpacing: '2px', marginBottom: '10px' }}>
                  <span style={{ color: '#f5b301' }}>{'★'.repeat(n)}</span>
                  <span style={{ color: '#dcdce0' }}>{'★'.repeat(5 - n)}</span>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: '14px', lineHeight: 1.6, color: '#333' }}>{r.text}</p>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#111' }}>{r.author}</div>
              </div>
            )
          })}
        </div>
      </section>
    ),
  },

  productFilter: {
    label: 'Product Filter',
    defaultProps: { categories: ['Apparel', 'Footwear', 'Accessories', 'Sale'], priceRange: '$0 – $250' },
    render: (p) => (
      <div style={{ padding: '28px 32px' }}>
        <div style={{ maxWidth: '260px', border: '1px solid #ececec', borderRadius: '14px', padding: '22px', background: '#fff' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#111', marginBottom: '16px' }}>Filters</div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>Category</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', marginBottom: '22px' }}>
            {(p.categories || []).map((c, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#333' }}>
                <span style={{ width: '17px', height: '17px', borderRadius: '5px', border: '1.5px solid', borderColor: i === 0 ? '#378ADD' : '#cfd3da', background: i === 0 ? '#378ADD' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {i === 0 && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                {c}
              </label>
            ))}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>Price</div>
          <div style={{ height: '5px', borderRadius: '3px', background: '#eee', position: 'relative', marginBottom: '12px' }}>
            <div style={{ position: 'absolute', left: '8%', right: '32%', top: 0, bottom: 0, background: '#378ADD', borderRadius: '3px' }} />
            <div style={{ position: 'absolute', left: '8%', top: '-4px', width: '13px', height: '13px', borderRadius: '50%', background: '#fff', border: '2px solid #378ADD' }} />
            <div style={{ position: 'absolute', right: '32%', top: '-4px', width: '13px', height: '13px', borderRadius: '50%', background: '#fff', border: '2px solid #378ADD' }} />
          </div>
          <div style={{ fontSize: '13px', color: '#555', fontWeight: 600 }}>{p.priceRange}</div>
        </div>
      </div>
    ),
  },

  checkout: {
    label: 'Checkout',
    defaultProps: {},
    render: () => {
      const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px' }
      const fieldStyle = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1px solid #e2e2e6', borderRadius: '9px', fontSize: '14px', color: '#999', background: '#fafafa' }
      const sectionTitle = { fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#111', margin: '0 0 16px' }
      return (
        <div style={{ padding: '28px 32px' }}>
          <div style={{ maxWidth: '480px', margin: '0 auto', border: '1px solid #ececec', borderRadius: '16px', padding: '28px', background: '#fff' }}>
            <div style={sectionTitle}>Shipping details</div>
            <div style={{ marginBottom: '14px' }}><label style={labelStyle}>Full name</label><div style={fieldStyle}>Jane Appleseed</div></div>
            <div style={{ marginBottom: '14px' }}><label style={labelStyle}>Address</label><div style={fieldStyle}>123 Market Street</div></div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '26px' }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>City</label><div style={fieldStyle}>San Francisco</div></div>
              <div style={{ width: '110px' }}><label style={labelStyle}>ZIP</label><div style={fieldStyle}>94103</div></div>
            </div>
            <div style={sectionTitle}>Payment</div>
            <div style={{ marginBottom: '14px' }}><label style={labelStyle}>Card number</label><div style={{ ...fieldStyle, display: 'flex', justifyContent: 'space-between' }}><span>•••• •••• •••• 4242</span><span style={{ color: '#cfcfcf' }}>VISA</span></div></div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '26px' }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>Expiry</label><div style={fieldStyle}>12 / 28</div></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>CVC</label><div style={fieldStyle}>•••</div></div>
            </div>
            <div style={{ textAlign: 'center', background: '#111', color: '#fff', padding: '14px 0', borderRadius: '10px', fontSize: '15px', fontWeight: 700 }}>Pay $196.00</div>
          </div>
        </div>
      )
    },
  },

  /* ── INTERACTIVE ───────────────────────────────────────────── */
  form: {
    label: 'Form',
    defaultProps: {
      fields: [
        { label: 'Name', type: 'text', required: true },
        { label: 'Email', type: 'email', required: true },
        { label: 'Message', type: 'textarea', required: false },
      ],
      submitText: 'Send message',
    },
    render: (p) => <FormBlock {...p} />,
  },

  countdown: {
    label: 'Countdown',
    defaultProps: { targetDate: '2026-12-31T23:59:59', label: 'Launching in' },
    render: (p) => <CountdownBlock {...p} />,
  },

  carousel: {
    label: 'Carousel',
    defaultProps: { slides: ['Welcome aboard', 'Build without limits', 'Ship in minutes'] },
    render: (p) => <CarouselBlock {...p} />,
  },

  /* ── AI ────────────────────────────────────────────────────── */
  aiChat: {
    label: 'AI Chat',
    defaultProps: {},
    // Editor-only static preview. The real, live Gemini-powered bubble is a
    // floating widget that only runs on the published /s/:slug page (injected by
    // renderBlocksToHTML), so here we render a non-interactive mockup that lets
    // the user see and position the assistant without running it in the canvas.
    render: () => (
      <div style={{ padding: '28px 32px' }}>
        <div style={{ position: 'relative', maxWidth: '320px', marginLeft: 'auto' }}>
          <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#378ADD', color: '#fff' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>AI Assistant</span>
              <span style={{ fontSize: '14px', opacity: 0.85 }}>✕</span>
            </div>
            <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#fafafa' }}>
              <div style={{ alignSelf: 'flex-start', maxWidth: '80%', background: '#fff', border: '1px solid #ececec', borderRadius: '12px', padding: '10px 13px', fontSize: '13px', color: '#333' }}>
                How can I help you today?
              </div>
              <div style={{ alignSelf: 'flex-end', maxWidth: '80%', background: '#378ADD', color: '#fff', borderRadius: '12px', padding: '10px 13px', fontSize: '13px' }}>
                What are your hours?
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderTop: '1px solid #f0f0f0', background: '#fff' }}>
              <div style={{ flex: 1, height: '34px', borderRadius: '9px', border: '1px solid #e2e2e6', background: '#fafafa', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '13px', color: '#9ca3af' }}>Type a message…</div>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#378ADD', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>➤</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#378ADD', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', boxShadow: '0 6px 18px rgba(55,138,221,0.4)' }}>💬</div>
          </div>
          <p style={{ textAlign: 'center', margin: '12px 0 0', fontSize: '12px', color: '#9ca3af' }}>
            Preview — the live chat bubble appears on your published site.
          </p>
        </div>
      </div>
    ),
  },

  map: {
    label: 'Map',
    defaultProps: { address: 'Golden Gate Bridge, San Francisco', zoom: 13 },
    render: (p) => {
      const z = Number(p.zoom) || 13
      const q = encodeURIComponent(p.address || '')
      return (
        <div style={{ padding: '24px 32px' }}>
          <div style={{ position: 'relative', width: '100%', height: '320px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #ececec', boxShadow: '0 4px 18px rgba(0,0,0,0.08)' }}>
            {q ? (
              <iframe
                title="Map"
                src={`https://maps.google.com/maps?q=${q}&z=${z}&output=embed`}
                style={{ width: '100%', height: '100%', border: 0 }}
                loading="lazy"
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef1f6', color: '#9aa1ad' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
              </div>
            )}
          </div>
        </div>
      )
    },
  },
}

/* ────────────────────────────────────────────────────────────────
   INTERACTIVE BLOCK COMPONENTS
   Stateful renderers so accordions, tabs, FAQ, carousels, forms and the
   countdown actually behave in the live preview. Returned from the matching
   BLOCK_DEFINITIONS.render() so they flow through BlockRenderer's universal
   style wrapper like any other section.
   ──────────────────────────────────────────────────────────────── */
const ASPECT_PAD = { '16:9': '56.25%', '4:3': '75%', '1:1': '100%' }

function getVideoEmbed(url) {
  if (!url) return null
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return url
}

function FaqBlock({ title, items }) {
  const [open, setOpen] = useState(0)
  const list = items || []
  return (
    <section style={{ padding: '56px 32px', background: '#fff' }}>
      {title && <h2 style={{ margin: '0 0 30px', fontSize: '30px', fontWeight: 800, color: '#111', textAlign: 'center', letterSpacing: '-0.02em' }}>{title}</h2>}
      <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {list.map((it, i) => {
          const isOpen = open === i
          return (
            <div key={i} style={{ border: '1px solid #ececec', borderRadius: '12px', overflow: 'hidden', background: isOpen ? '#fafbff' : '#fff' }}>
              <button
                onClick={() => setOpen(isOpen ? -1 : i)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '18px 22px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: '15px', fontWeight: 700, color: '#111' }}
              >
                <span>{it.question}</span>
                <span style={{ flexShrink: 0, color: '#378ADD', transition: 'transform 0.2s', transform: isOpen ? 'rotate(45deg)' : 'none', fontSize: '22px', lineHeight: 1, fontWeight: 400 }}>+</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 22px 20px', fontSize: '14px', lineHeight: 1.65, color: '#555' }}>{it.answer}</div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AccordionBlock({ items }) {
  const [open, setOpen] = useState(0)
  const list = items || []
  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {list.map((it, i) => {
          const isOpen = open === i
          return (
            <div key={i} style={{ border: '1px solid #ececec', borderRadius: '10px', overflow: 'hidden' }}>
              <button
                onClick={() => setOpen(isOpen ? -1 : i)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', background: isOpen ? '#f7f9fc' : '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: '14px', fontWeight: 700, color: '#111' }}
              >
                <span>{it.title}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#378ADD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {isOpen && <div style={{ padding: '4px 18px 16px', fontSize: '14px', lineHeight: 1.65, color: '#555', background: '#fff' }}>{it.content}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TabsBlock({ tabs }) {
  const [active, setActive] = useState(0)
  const list = tabs || []
  const current = list[active] || list[0]
  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #ececec', marginBottom: '20px' }}>
        {list.map((t, i) => {
          const on = active === i
          return (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{ padding: '11px 18px', background: 'transparent', border: 'none', borderBottom: on ? '2px solid #378ADD' : '2px solid transparent', marginBottom: '-1px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, color: on ? '#111' : '#888' }}
            >{t.label}</button>
          )
        })}
      </div>
      <div style={{ fontSize: '15px', lineHeight: 1.65, color: '#444', minHeight: '48px' }}>{current?.content}</div>
    </div>
  )
}

function carouselArrow(side) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: '14px', width: '38px', height: '38px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.85)', border: 'none', cursor: 'pointer',
    color: '#111', fontSize: '24px', lineHeight: 1, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
  }
}

function CarouselBlock({ slides }) {
  const list = slides && slides.length ? slides : ['']
  const [idx, setIdx] = useState(0)
  const n = list.length
  const safeIdx = idx % n
  const go = (d) => setIdx((i) => (i + d + n) % n)
  const slide = list[safeIdx]
  const isImg = typeof slide === 'string' && /^https?:\/\//.test(slide)
  const gradients = ['linear-gradient(135deg,#378ADD,#6db3f2)', 'linear-gradient(135deg,#7c4dff,#b388ff)', 'linear-gradient(135deg,#00bfa5,#5df2d6)', 'linear-gradient(135deg,#ff6e7f,#bfe9ff)']
  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ position: 'relative', width: '100%', height: '280px', borderRadius: '14px', overflow: 'hidden', background: isImg ? '#000' : gradients[safeIdx % gradients.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isImg ? (
          <img src={slide} alt={`Slide ${safeIdx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', textShadow: '0 2px 10px rgba(0,0,0,0.15)', padding: '0 60px', textAlign: 'center' }}>{slide}</div>
        )}
        {n > 1 && <button onClick={() => go(-1)} aria-label="Previous" style={carouselArrow('left')}>‹</button>}
        {n > 1 && <button onClick={() => go(1)} aria-label="Next" style={carouselArrow('right')}>›</button>}
        <div style={{ position: 'absolute', bottom: '14px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '7px' }}>
          {list.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`Go to slide ${i + 1}`} style={{ width: i === safeIdx ? '22px' : '8px', height: '8px', borderRadius: '4px', border: 'none', padding: 0, cursor: 'pointer', background: i === safeIdx ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'width 0.2s' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FormBlock({ fields, submitText }) {
  const [values, setValues] = useState({})
  const [sent, setSent] = useState(false)
  const list = fields || []
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '6px' }
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1px solid #dfe2e8', borderRadius: '9px', fontSize: '14px', color: '#111', fontFamily: 'inherit', outline: 'none', background: '#fff' }
  return (
    <div style={{ padding: '32px' }}>
      <form
        onSubmit={(e) => { e.preventDefault(); setSent(true); setTimeout(() => setSent(false), 2500) }}
        style={{ maxWidth: '460px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {list.map((f, i) => {
          const req = f.required === true || f.required === 'true'
          return (
            <div key={i}>
              <label style={labelStyle}>
                {f.label}{req && <span style={{ color: '#ef4444' }}> *</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  required={req}
                  value={values[i] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [i]: e.target.value }))}
                  style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                />
              ) : (
                <input
                  type={f.type || 'text'}
                  required={req}
                  value={values[i] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [i]: e.target.value }))}
                  style={inputStyle}
                />
              )}
            </div>
          )
        })}
        <button type="submit" style={{ marginTop: '4px', background: sent ? '#22c55e' : '#378ADD', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px 0', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}>
          {sent ? '✓ Sent!' : (submitText || 'Submit')}
        </button>
      </form>
    </div>
  )
}

function CountdownBlock({ targetDate, label }) {
  const targetRef = useRef(0)
  targetRef.current = new Date(targetDate).getTime()
  const calc = () => {
    const t = targetRef.current
    const diff = isFinite(t) ? Math.max(0, t - Date.now()) : 0
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    }
  }
  const [time, setTime] = useState(calc)
  useEffect(() => {
    setTime(calc())
    const id = setInterval(() => setTime(calc()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate])
  const units = [
    { n: time.d, l: 'Days' },
    { n: time.h, l: 'Hours' },
    { n: time.m, l: 'Minutes' },
    { n: time.s, l: 'Seconds' },
  ]
  return (
    <section style={{ padding: '56px 32px', textAlign: 'center', background: 'linear-gradient(135deg,#111,#2a2a35)' }}>
      {label && <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: '22px' }}>{label}</div>}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
        {units.map((u, i) => (
          <div key={i} style={{ minWidth: '76px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px 10px' }}>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{String(u.n).padStart(2, '0')}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>{u.l}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────
   COMPREHENSIVE STYLE SYSTEM
   Every universal styling control lives in block.props.style. The
   defaults below double as the "reset" baseline; styleToCss() turns a
   (possibly partial) style object into a real inline-style object that
   wraps any block. Values left at their default/empty state are simply
   not emitted so they never clobber a block's own intrinsic styling.
   ──────────────────────────────────────────────────────────────── */
const FONT_STACKS = {
  Inter:    'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  Georgia:  'Georgia, "Times New Roman", serif',
  Mono:     '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
  Playfair: '"Playfair Display", Georgia, serif',
  system:   '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const FONT_OPTIONS = ['', 'Inter', 'Georgia', 'Mono', 'Playfair', 'system']
const FONT_WEIGHTS = ['', '300', '400', '500', '600', '700']
const SHADOW_PRESETS = {
  none: 'none',
  sm:   '0 1px 2px rgba(0,0,0,0.08)',
  md:   '0 4px 12px rgba(0,0,0,0.12)',
  lg:   '0 10px 30px rgba(0,0,0,0.18)',
  xl:   '0 24px 60px rgba(0,0,0,0.28)',
}
const SHADOW_OPTIONS = ['none', 'sm', 'md', 'lg', 'xl', 'custom']
const HOVER_OPTIONS = ['none', 'lift', 'glow', 'scale']
const ENTRANCE_OPTIONS = ['none', 'fade', 'slide-up', 'slide-in', 'zoom']
const ENTRANCE_KEYFRAMES = {
  fade: 'tnFade',
  'slide-up': 'tnSlideUp',
  'slide-in': 'tnSlideIn',
  zoom: 'tnZoom',
}
const WIDTH_OPTIONS = ['full', 'auto', 'custom']
const DISPLAY_OPTIONS = ['block', 'flex', 'grid']
const BORDER_STYLES = ['solid', 'dashed']
const GRADIENT_DIRECTIONS = ['90deg', '135deg', '180deg', '45deg']

const DEFAULT_STYLE = {
  // typography
  fontFamily: '', fontSize: 0, fontWeight: '', lineHeight: 0, letterSpacing: 0, textColor: '',
  // spacing
  paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, paddingLinked: true,
  marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, marginLinked: true,
  gap: 0,
  // background & border
  background: '', bgType: 'solid',
  gradientFrom: '#378ADD', gradientTo: '#9b5de5', gradientDir: '135deg',
  borderWidth: 0, borderColor: '#e2e2e6', borderStyle: 'solid',
  borderRadius: 0, radiusLinked: true, radiusTL: 0, radiusTR: 0, radiusBR: 0, radiusBL: 0,
  boxShadow: 'none', boxShadowCustom: '0 8px 30px rgba(0,0,0,0.2)',
  // effects
  opacity: 100, hoverEffect: 'none', entrance: 'none', transitionDuration: 200,
  // layout
  width: 'full', widthPx: 600, maxWidth: 0, align: 'left', display: 'block',
}

// Per-section reset baselines (a subset of DEFAULT_STYLE keys).
const pick = (keys) => Object.fromEntries(keys.map((k) => [k, DEFAULT_STYLE[k]]))
const SECTION_DEFAULTS = {
  typography: pick(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textColor']),
  spacing: { ...pick(['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'paddingLinked',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginLinked', 'gap']), padding: 0 },
  background: pick(['background', 'bgType', 'gradientFrom', 'gradientTo', 'gradientDir',
    'borderWidth', 'borderColor', 'borderStyle', 'borderRadius', 'radiusLinked',
    'radiusTL', 'radiusTR', 'radiusBR', 'radiusBL', 'boxShadow', 'boxShadowCustom']),
  effects: pick(['opacity', 'hoverEffect', 'entrance', 'transitionDuration']),
  layout: pick(['width', 'widthPx', 'maxWidth', 'align', 'display']),
}

/* Merge stored style over the defaults, migrating the legacy single-number
   `padding` into the four-sided model so old saved blocks still read right. */
function normalizeStyle(raw) {
  const st = { ...DEFAULT_STYLE, ...(raw || {}) }
  if (typeof raw?.padding === 'number' && raw.paddingTop == null) {
    st.paddingTop = st.paddingRight = st.paddingBottom = st.paddingLeft = raw.padding
  }
  return st
}

/* Resolve a 4-sided box (padding/margin) into a CSS shorthand, or null if
   every side is zero. Falls back to the legacy single `padding` number. */
function resolveBox(style, prefix) {
  const t = style[`${prefix}Top`], r = style[`${prefix}Right`]
  const b = style[`${prefix}Bottom`], l = style[`${prefix}Left`]
  const has = [t, r, b, l].some((v) => v != null && v !== 0)
  if (!has) {
    if (prefix === 'padding' && typeof style.padding === 'number' && style.padding !== 0) {
      return `${style.padding}px`
    }
    return null
  }
  return `${t || 0}px ${r || 0}px ${b || 0}px ${l || 0}px`
}

function resolveRadius(style) {
  if (style.radiusLinked === false) {
    const tl = style.radiusTL || 0, tr = style.radiusTR || 0
    const br = style.radiusBR || 0, bl = style.radiusBL || 0
    if (tl || tr || br || bl) return `${tl}px ${tr}px ${br}px ${bl}px`
    return null
  }
  return style.borderRadius ? `${style.borderRadius}px` : null
}

/* Build the inline style object for the universal wrapper from props.style. */
function styleToCss(style) {
  if (!style) return {}
  const css = {}

  // Typography
  if (style.fontFamily) css.fontFamily = FONT_STACKS[style.fontFamily] || style.fontFamily
  if (style.fontSize) css.fontSize = `${style.fontSize}px`
  if (style.fontWeight) css.fontWeight = style.fontWeight
  if (style.lineHeight) css.lineHeight = style.lineHeight
  if (style.letterSpacing) css.letterSpacing = `${style.letterSpacing}px`
  if (style.textColor) css.color = style.textColor

  // Spacing
  const pad = resolveBox(style, 'padding'); if (pad) css.padding = pad
  const mar = resolveBox(style, 'margin'); if (mar) css.margin = mar
  if (style.gap) css.gap = `${style.gap}px`

  // Background
  if (style.bgType === 'gradient') {
    css.background = `linear-gradient(${style.gradientDir || '135deg'}, ${style.gradientFrom || '#378ADD'}, ${style.gradientTo || '#9b5de5'})`
  } else if (style.background) {
    css.background = style.background
  }

  // Border
  if (style.borderWidth) {
    css.borderStyle = style.borderStyle || 'solid'
    css.borderWidth = `${style.borderWidth}px`
    css.borderColor = style.borderColor || '#000000'
  }
  const radius = resolveRadius(style); if (radius) css.borderRadius = radius

  // Box shadow
  if (style.boxShadow === 'custom') {
    if (style.boxShadowCustom) css.boxShadow = style.boxShadowCustom
  } else if (style.boxShadow && style.boxShadow !== 'none') {
    css.boxShadow = SHADOW_PRESETS[style.boxShadow]
  }

  // Effects
  if (style.opacity != null && style.opacity !== 100) css.opacity = style.opacity / 100
  if (style.transitionDuration) css.transition = `all ${style.transitionDuration}ms ease`

  // Layout
  if (style.display && style.display !== 'block') css.display = style.display
  if (style.width === 'auto') css.width = 'auto'
  else if (style.width === 'custom' && style.widthPx) css.width = `${style.widthPx}px`
  if (style.maxWidth) css.maxWidth = `${style.maxWidth}px`
  if (style.align) css.textAlign = style.align
  // Centre a width-constrained block horizontally.
  if (style.align === 'center' && (style.width === 'custom' || style.maxWidth) && !mar) {
    css.marginLeft = 'auto'; css.marginRight = 'auto'
  }

  return css
}

function BlockRenderer({ block, preview }) {
  const def = BLOCK_DEFINITIONS[block.type]
  const st = block.props.style
  const entrance = st?.entrance && st.entrance !== 'none' ? st.entrance : null
  const hoverEffect = st?.hoverEffect && st.hoverEffect !== 'none' ? st.hoverEffect : null

  // Entrance animations only play in preview, triggered when the block scrolls
  // into view via IntersectionObserver.
  const ref = useRef(null)
  const [entered, setEntered] = useState(() => !(preview && entrance))
  useEffect(() => {
    if (!preview || !entrance) { setEntered(true); return }
    setEntered(false)
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setEntered(true); return }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setEntered(true); io.unobserve(e.target) }
      }
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [preview, entrance, block.id])

  if (!def) return null
  const inner = def.render(block.props)
  const css = styleToCss(st)

  const needsWrap = Object.keys(css).length > 0 || hoverEffect || entrance
  if (!needsWrap) return inner

  const wrapStyle = { ...css }
  if (preview && entrance) {
    if (entered) {
      wrapStyle.animationName = ENTRANCE_KEYFRAMES[entrance]
      wrapStyle.animationDuration = `${Math.max(st.transitionDuration || 0, 500)}ms`
      wrapStyle.animationTimingFunction = 'cubic-bezier(0.22,0.61,0.36,1)'
      wrapStyle.animationFillMode = 'both'
    } else {
      wrapStyle.opacity = 0
    }
  }

  const className = ['tn-block', hoverEffect ? `tn-hover-${hoverEffect}` : '']
    .filter(Boolean).join(' ')

  return <div ref={ref} className={className} style={wrapStyle}>{inner}</div>
}

/* deep-clone default props so blocks never share array/object references */
function cloneProps(props) {
  return typeof structuredClone === 'function'
    ? structuredClone(props)
    : JSON.parse(JSON.stringify(props))
}

export {
  BLOCK_DEFINITIONS, styleToCss, DEFAULT_STYLE, SECTION_DEFAULTS, normalizeStyle, cloneProps,
  FONT_OPTIONS, FONT_WEIGHTS, SHADOW_OPTIONS, HOVER_OPTIONS, ENTRANCE_OPTIONS,
  WIDTH_OPTIONS, DISPLAY_OPTIONS, BORDER_STYLES, GRADIENT_DIRECTIONS,
  HEADING_SIZES, IMAGE_WIDTH_MAP, IMAGE_WIDTH_OPTIONS, OBJECT_FIT_OPTIONS,
  ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES,
}
export default BlockRenderer
