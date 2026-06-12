require('dotenv').config();

const path = require('path');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

// ── Server-side renderer ───────────────────────────────────────────────────────
// Mirrors the editor's BlockRenderer (client/src/pages/Editor.jsx) but emits a
// static HTML string with inline styles. Each block type maps to the same visual
// markup the editor canvas shows, so a published page looks exactly as built.

const HEADING_SIZES = { h1: 40, h2: 30, h3: 23, h4: 19 };
const IMAGE_WIDTH_MAP = { full: '100%', half: '50%', third: '33.33%' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// camelCase style object → inline CSS string (e.g. { fontSize: '18px' } → "font-size:18px").
function css(style) {
  return Object.entries(style)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
    .join(';');
}

// style="..." attribute with the rendered CSS escaped for the attribute context.
function styleAttr(style) {
  return `style="${escapeHtml(css(style))}"`;
}

// ── Shared helpers mirrored from client/src/components/BlockRenderer.jsx ─────────
const ASPECT_PAD = { '16:9': '56.25%', '4:3': '75%', '1:1': '100%' };

function getVideoEmbed(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}

// ── Universal style system, ported verbatim from BlockRenderer.jsx ──────────────
// styleToCss() turns a (possibly partial) props.style object into the same inline
// CSS the editor's wrapper applies, so a published block matches the canvas.
const FONT_STACKS = {
  Inter: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Mono: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
  Playfair: '"Playfair Display", Georgia, serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};
const SHADOW_PRESETS = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,0.08)',
  md: '0 4px 12px rgba(0,0,0,0.12)',
  lg: '0 10px 30px rgba(0,0,0,0.18)',
  xl: '0 24px 60px rgba(0,0,0,0.28)',
};

// Resolve a 4-sided box (padding/margin) into a CSS shorthand, or null if every
// side is zero. Falls back to the legacy single `padding` number.
function resolveBox(style, prefix) {
  const t = style[`${prefix}Top`], r = style[`${prefix}Right`];
  const b = style[`${prefix}Bottom`], l = style[`${prefix}Left`];
  const has = [t, r, b, l].some((v) => v != null && v !== 0);
  if (!has) {
    if (prefix === 'padding' && typeof style.padding === 'number' && style.padding !== 0) {
      return `${style.padding}px`;
    }
    return null;
  }
  return `${t || 0}px ${r || 0}px ${b || 0}px ${l || 0}px`;
}

function resolveRadius(style) {
  if (style.radiusLinked === false) {
    const tl = style.radiusTL || 0, tr = style.radiusTR || 0;
    const br = style.radiusBR || 0, bl = style.radiusBL || 0;
    if (tl || tr || br || bl) return `${tl}px ${tr}px ${br}px ${bl}px`;
    return null;
  }
  return style.borderRadius ? `${style.borderRadius}px` : null;
}

// Build the inline-style object for the universal wrapper from props.style.
function styleToCss(style) {
  if (!style) return {};
  const out = {};

  // Typography
  if (style.fontFamily) out.fontFamily = FONT_STACKS[style.fontFamily] || style.fontFamily;
  if (style.fontSize) out.fontSize = `${style.fontSize}px`;
  if (style.fontWeight) out.fontWeight = style.fontWeight;
  if (style.lineHeight) out.lineHeight = style.lineHeight;
  if (style.letterSpacing) out.letterSpacing = `${style.letterSpacing}px`;
  if (style.textColor) out.color = style.textColor;

  // Spacing
  const pad = resolveBox(style, 'padding'); if (pad) out.padding = pad;
  const mar = resolveBox(style, 'margin'); if (mar) out.margin = mar;
  if (style.gap) out.gap = `${style.gap}px`;

  // Background
  if (style.bgType === 'gradient') {
    out.background = `linear-gradient(${style.gradientDir || '135deg'}, ${style.gradientFrom || '#378ADD'}, ${style.gradientTo || '#9b5de5'})`;
  } else if (style.background) {
    out.background = style.background;
  }

  // Border
  if (style.borderWidth) {
    out.borderStyle = style.borderStyle || 'solid';
    out.borderWidth = `${style.borderWidth}px`;
    out.borderColor = style.borderColor || '#000000';
  }
  const radius = resolveRadius(style); if (radius) out.borderRadius = radius;

  // Box shadow
  if (style.boxShadow === 'custom') {
    if (style.boxShadowCustom) out.boxShadow = style.boxShadowCustom;
  } else if (style.boxShadow && style.boxShadow !== 'none') {
    out.boxShadow = SHADOW_PRESETS[style.boxShadow];
  }

  // Effects
  if (style.opacity != null && style.opacity !== 100) out.opacity = style.opacity / 100;
  if (style.transitionDuration) out.transition = `all ${style.transitionDuration}ms ease`;

  // Layout
  if (style.display && style.display !== 'block') out.display = style.display;
  if (style.width === 'auto') out.width = 'auto';
  else if (style.width === 'custom' && style.widthPx) out.width = `${style.widthPx}px`;
  if (style.maxWidth) out.maxWidth = `${style.maxWidth}px`;
  if (style.align) out.textAlign = style.align;
  // Centre a width-constrained block horizontally.
  if (style.align === 'center' && (style.width === 'custom' || style.maxWidth) && !mar) {
    out.marginLeft = 'auto'; out.marginRight = 'auto';
  }

  return out;
}

const BLOCK_HTML = {
  navbar: (p) => `
    <nav style="display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid #ececec;background:#ffffff;">
      <div style="font-size:18px;font-weight:700;color:#111;letter-spacing:-0.01em;">${escapeHtml(p.logo)}</div>
      <div style="display:flex;align-items:center;gap:28px;">
        <div style="display:flex;gap:26px;">
          ${(p.links || []).map((l) => `<span style="font-size:14px;color:#555;font-weight:500;">${escapeHtml(l)}</span>`).join('')}
        </div>
        <span style="background:#111;color:#fff;padding:8px 16px;border-radius:7px;font-size:13px;font-weight:600;">${escapeHtml(p.cta)}</span>
      </div>
    </nav>`,

  hero: (p) => `
    <section style="background:${escapeHtml(p.bgColor || '#f5f5f5')};padding:78px 32px;text-align:center;">
      <h1 style="margin:0 0 14px;font-size:44px;font-weight:800;color:#111;letter-spacing:-0.02em;">${escapeHtml(p.title)}</h1>
      <p style="margin:0 auto 30px;font-size:18px;color:#666;max-width:520px;line-height:1.5;">${escapeHtml(p.subtitle)}</p>
      <span style="display:inline-block;background:#378ADD;color:#fff;padding:13px 28px;border-radius:9px;font-size:15px;font-weight:600;">${escapeHtml(p.ctaText)}</span>
    </section>`,

  heading: (p) => {
    const level = HEADING_SIZES[p.level] ? p.level : 'h2';
    const size = HEADING_SIZES[level] || 30;
    return `<${level} style="margin:0;padding:22px 32px;font-size:${size}px;font-weight:700;color:#111;letter-spacing:-0.01em;">${escapeHtml(p.text)}</${level}>`;
  },

  text: (p) => `<p style="margin:0;padding:16px 32px;font-size:16px;line-height:1.65;color:#444;">${escapeHtml(p.content)}</p>`,

  button: (p) => {
    const variant = p.variant === 'outline'
      ? 'background:transparent;color:#378ADD;border:1.5px solid #378ADD;'
      : 'background:#378ADD;color:#fff;border:1.5px solid #378ADD;';
    return `
    <div style="padding:18px 32px;">
      <span style="display:inline-block;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;${variant}">${escapeHtml(p.text)}</span>
    </div>`;
  },

  image: (p) => {
    const w = IMAGE_WIDTH_MAP[p.width] || '100%';
    const radius = `${p.borderRadius ?? 8}px`;
    if (p.src) {
      const imgStyle = {
        width: w,
        height: p.height ? `${p.height}px` : 'auto',
        objectFit: p.objectFit || 'cover',
        borderRadius: radius,
        display: 'block',
      };
      return `<div style="padding:18px 32px;"><img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.alt)}" ${styleAttr(imgStyle)} /></div>`;
    }
    const phStyle = {
      width: w,
      height: p.height ? `${p.height}px` : '220px',
      borderRadius: radius,
      background: '#f1f1f3',
      border: '1.5px dashed #d4d4d8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      color: '#9ca3af',
    };
    return `
    <div style="padding:18px 32px;">
      <div ${styleAttr(phStyle)}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
        </svg>
        <span style="font-size:13px;">${escapeHtml(p.alt)}</span>
      </div>
    </div>`;
  },

  columns: (p) => `
    <div style="display:flex;gap:16px;padding:28px 32px;">
      ${(p.items || []).slice(0, p.count).map((item) => `<div style="flex:1;background:#f7f7f8;border-radius:8px;padding:28px 20px;font-size:14px;color:#555;text-align:center;border:1px solid #eee;">${escapeHtml(item)}</div>`).join('')}
    </div>`,

  productGrid: (p) => `
    <div style="display:grid;grid-template-columns:repeat(${Number(p.columns) || 3}, 1fr);gap:18px;padding:28px 32px;">
      ${(p.products || []).map((prod) => `
        <div style="background:#fff;border-radius:10px;border:1px solid #ececec;overflow:hidden;">
          <div style="height:140px;background:linear-gradient(135deg,#f3f4f6,#e7e8ec);display:flex;align-items:center;justify-content:center;color:#c4c7cf;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <div style="padding:12px 14px;">
            <div style="font-size:14px;font-weight:600;color:#111;margin-bottom:4px;">${escapeHtml(prod.name)}</div>
            <div style="font-size:14px;color:#378ADD;font-weight:600;">${escapeHtml(prod.price)}</div>
          </div>
        </div>`).join('')}
    </div>`,

  searchBar: (p) => `
    <div style="padding:18px 32px;">
      <div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border:1px solid #e2e2e6;border-radius:10px;background:#fafafa;color:#9ca3af;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" stroke-linecap="round" />
        </svg>
        <span style="font-size:14px;">${escapeHtml(p.placeholder)}</span>
      </div>
    </div>`,

  footer: (p) => `
    <footer style="display:flex;align-items:center;justify-content:space-between;padding:24px 32px;background:#111;color:#d4d4d8;">
      <span style="font-size:13px;">${escapeHtml(p.text)}</span>
      <div style="display:flex;gap:22px;">
        ${(p.links || []).map((l) => `<span style="font-size:13px;color:#a1a1aa;">${escapeHtml(l)}</span>`).join('')}
      </div>
    </footer>`,

  /* ── MARKETING ─────────────────────────────────────────────── */
  testimonials: (p) => {
    const items = p.items || [];
    const cols = Math.min(3, Math.max(1, items.length || 1));
    return `
    <section style="padding:60px 32px;background:#fafafa;">
      ${p.title ? `<h2 style="margin:0 0 38px;font-size:30px;font-weight:800;color:#111;text-align:center;letter-spacing:-0.02em;">${escapeHtml(p.title)}</h2>` : ''}
      <div style="display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:20px;">
        ${items.map((t) => `
          <div style="background:#fff;border:1px solid #ececec;border-radius:14px;padding:26px 24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
            <div style="color:#f5b301;font-size:15px;letter-spacing:2px;margin-bottom:12px;">★★★★★</div>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333;">“${escapeHtml(t.quote)}”</p>
            <div style="display:flex;align-items:center;gap:11px;">
              <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#378ADD,#6db3f2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">${escapeHtml((t.author || '?').charAt(0))}</div>
              <div>
                <div style="font-size:13px;font-weight:700;color:#111;">${escapeHtml(t.author)}</div>
                <div style="font-size:12px;color:#888;">${escapeHtml(t.role)}</div>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </section>`;
  },

  faq: (p) => {
    const items = p.items || [];
    return `
    <section style="padding:56px 32px;background:#fff;">
      ${p.title ? `<h2 style="margin:0 0 30px;font-size:30px;font-weight:800;color:#111;text-align:center;letter-spacing:-0.02em;">${escapeHtml(p.title)}</h2>` : ''}
      <div data-accordion style="max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:10px;">
        ${items.map((it, i) => {
          const open = i === 0;
          return `
          <div data-acc-item data-open="${open ? 'true' : 'false'}" data-bg-open="#fafbff" data-bg-closed="#fff" style="border:1px solid #ececec;border-radius:12px;overflow:hidden;background:${open ? '#fafbff' : '#fff'};">
            <button data-acc-head type="button" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 22px;background:transparent;border:none;cursor:pointer;text-align:left;font-family:inherit;font-size:15px;font-weight:700;color:#111;">
              <span>${escapeHtml(it.question)}</span>
              <span data-acc-icon data-rot="45deg" style="flex-shrink:0;color:#378ADD;transition:transform 0.2s;transform:${open ? 'rotate(45deg)' : 'none'};font-size:22px;line-height:1;font-weight:400;">+</span>
            </button>
            <div data-acc-panel style="display:${open ? 'block' : 'none'};padding:0 22px 20px;font-size:14px;line-height:1.65;color:#555;">${escapeHtml(it.answer)}</div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  },

  pricingTable: (p) => {
    const plans = p.plans || [];
    const cols = Math.max(1, plans.length || 1);
    return `
    <section style="padding:60px 32px;background:#fff;">
      <div style="display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:20px;align-items:stretch;">
        ${plans.map((plan) => {
          const hot = plan.highlighted === true || plan.highlighted === 'true';
          const card = hot
            ? 'position:relative;border-radius:16px;padding:30px 26px;background:linear-gradient(165deg,#378ADD,#2f6fc0);color:#fff;border:none;box-shadow:0 16px 40px rgba(55,138,221,0.35);transform:scale(1.03);'
            : 'position:relative;border-radius:16px;padding:30px 26px;background:#fff;color:#111;border:1px solid #ececec;box-shadow:0 1px 3px rgba(0,0,0,0.05);';
          return `
          <div style="${card}">
            ${hot ? '<span style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.22);padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.04em;">POPULAR</span>' : ''}
            <div style="font-size:15px;font-weight:700;margin-bottom:8px;">${escapeHtml(plan.name)}</div>
            <div style="margin-bottom:20px;">
              <span style="font-size:40px;font-weight:800;letter-spacing:-0.02em;">${escapeHtml(plan.price)}</span>
              <span style="font-size:14px;opacity:0.7;"> /mo</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:11px;margin-bottom:26px;">
              ${(plan.features || []).map((f) => `
                <div style="display:flex;align-items:center;gap:9px;font-size:14px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${hot ? '#fff' : '#378ADD'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span style="opacity:${hot ? '0.95' : '0.85'};">${escapeHtml(f)}</span>
                </div>`).join('')}
            </div>
            <div style="text-align:center;padding:11px 0;border-radius:9px;font-size:14px;font-weight:700;background:${hot ? '#fff' : '#378ADD'};color:${hot ? '#2f6fc0' : '#fff'};">Get started</div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  },

  cta: (p) => `
    <section style="background:${escapeHtml(p.bgColor || '#111')};padding:64px 32px;text-align:center;">
      <h2 style="margin:0 0 12px;font-size:34px;font-weight:800;color:#fff;letter-spacing:-0.02em;">${escapeHtml(p.heading)}</h2>
      <p style="margin:0 auto 28px;font-size:17px;color:rgba(255,255,255,0.72);max-width:520px;line-height:1.5;">${escapeHtml(p.subtext)}</p>
      <span style="display:inline-block;background:#fff;color:#111;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">${escapeHtml(p.buttonText)}</span>
    </section>`,

  /* ── CONTENT ───────────────────────────────────────────────── */
  video: (p) => {
    const embed = getVideoEmbed(p.url);
    const pad = ASPECT_PAD[p.aspectRatio] || '56.25%';
    const auto = p.autoplay === true || p.autoplay === 'true';
    const src = embed ? `${embed}${auto ? (embed.includes('?') ? '&' : '?') + 'autoplay=1&mute=1' : ''}` : '';
    return `
    <div style="padding:24px 32px;">
      <div style="position:relative;width:100%;padding-bottom:${pad};border-radius:12px;overflow:hidden;background:#000;box-shadow:0 8px 30px rgba(0,0,0,0.18);">
        ${src
          ? `<iframe src="${escapeHtml(src)}" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe>`
          : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.55);"><svg width="56" height="56" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="rgba(255,255,255,0.12)" /><path d="M10 8l6 4-6 4z" fill="#fff" /></svg></div>'}
      </div>
    </div>`;
  },

  accordion: (p) => {
    const items = p.items || [];
    return `
    <div style="padding:28px 32px;">
      <div data-accordion style="display:flex;flex-direction:column;gap:8px;">
        ${items.map((it, i) => {
          const open = i === 0;
          return `
          <div data-acc-item data-open="${open ? 'true' : 'false'}" style="border:1px solid #ececec;border-radius:10px;overflow:hidden;">
            <button data-acc-head type="button" data-bg-open="#f7f9fc" data-bg-closed="#fff" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:15px 18px;background:${open ? '#f7f9fc' : '#fff'};border:none;cursor:pointer;text-align:left;font-family:inherit;font-size:14px;font-weight:700;color:#111;">
              <span>${escapeHtml(it.title)}</span>
              <svg data-acc-icon data-rot="180deg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.2s;transform:${open ? 'rotate(180deg)' : 'none'};"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div data-acc-panel style="display:${open ? 'block' : 'none'};padding:4px 18px 16px;font-size:14px;line-height:1.65;color:#555;background:#fff;">${escapeHtml(it.content)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  },

  tabs: (p) => {
    const tabs = p.tabs || [];
    return `
    <div style="padding:28px 32px;">
      <div data-tabs>
        <div style="display:flex;gap:4px;border-bottom:1px solid #ececec;margin-bottom:20px;">
          ${tabs.map((t, i) => `<button data-tab-btn="${i}" type="button" style="padding:11px 18px;background:transparent;border:none;border-bottom:${i === 0 ? '2px solid #378ADD' : '2px solid transparent'};margin-bottom:-1px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;color:${i === 0 ? '#111' : '#888'};">${escapeHtml(t.label)}</button>`).join('')}
        </div>
        ${tabs.map((t, i) => `<div data-tab-panel="${i}" style="display:${i === 0 ? 'block' : 'none'};font-size:15px;line-height:1.65;color:#444;min-height:48px;">${escapeHtml(t.content)}</div>`).join('')}
      </div>
    </div>`;
  },

  gallery: (p) => {
    const cols = Number(p.columns) || 3;
    const imgs = p.images && p.images.length ? p.images : [];
    return `
    <div style="padding:28px 32px;">
      <div style="display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:12px;">
        ${imgs.map((src, i) => `
          <div style="position:relative;padding-bottom:72%;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#eef1f6,#dfe4ec);">
            ${src
              ? `<img src="${escapeHtml(src)}" alt="Gallery ${i + 1}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />`
              : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#b6bcc8;"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg></div>'}
          </div>`).join('')}
      </div>
    </div>`;
  },

  /* ── ECOMMERCE ─────────────────────────────────────────────── */
  cart: () => {
    const items = [
      { name: 'Wireless Headphones', qty: 1, price: 129 },
      { name: 'USB-C Charging Cable', qty: 2, price: 19 },
      { name: 'Laptop Sleeve 14"', qty: 1, price: 39 },
    ];
    const subtotal = items.reduce((a, it) => a + it.price * it.qty, 0);
    const shipping = 8;
    return `
    <div style="padding:28px 32px;">
      <div style="max-width:460px;margin:0 auto;border:1px solid #ececec;border-radius:14px;overflow:hidden;background:#fff;">
        <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;font-size:16px;font-weight:700;color:#111;">Your cart (${items.length})</div>
        ${items.map((it) => `
          <div style="display:flex;align-items:center;gap:14px;padding:14px 22px;border-bottom:1px solid #f5f5f5;">
            <div style="width:46px;height:46px;border-radius:8px;background:linear-gradient(135deg,#f0f2f6,#e2e6ee);flex-shrink:0;"></div>
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;color:#111;">${escapeHtml(it.name)}</div>
              <div style="font-size:12px;color:#999;">Qty ${it.qty}</div>
            </div>
            <div style="font-size:14px;font-weight:600;color:#111;">$${it.price * it.qty}</div>
          </div>`).join('')}
        <div style="padding:16px 22px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:7px;"><span>Subtotal</span><span>$${subtotal}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:12px;"><span>Shipping</span><span>$${shipping}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:#111;padding-top:12px;border-top:1px solid #f0f0f0;"><span>Total</span><span>$${subtotal + shipping}</span></div>
          <div style="margin-top:16px;text-align:center;background:#378ADD;color:#fff;padding:12px 0;border-radius:9px;font-size:14px;font-weight:700;">Checkout</div>
        </div>
      </div>
    </div>`;
  },

  reviews: (p) => {
    const items = p.items || [];
    const cols = Math.min(3, Math.max(1, items.length || 1));
    return `
    <section style="padding:44px 32px;background:#fff;">
      <div style="display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:18px;">
        ${items.map((r) => {
          const n = Math.max(0, Math.min(5, Number(r.stars) || 0));
          return `
          <div style="border:1px solid #ececec;border-radius:12px;padding:22px 20px;background:#fafafa;">
            <div style="font-size:16px;letter-spacing:2px;margin-bottom:10px;"><span style="color:#f5b301;">${'★'.repeat(n)}</span><span style="color:#dcdce0;">${'★'.repeat(5 - n)}</span></div>
            <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#333;">${escapeHtml(r.text)}</p>
            <div style="font-size:13px;font-weight:700;color:#111;">${escapeHtml(r.author)}</div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  },

  productFilter: (p) => {
    const categories = p.categories || [];
    return `
    <div style="padding:28px 32px;">
      <div style="max-width:260px;border:1px solid #ececec;border-radius:14px;padding:22px;background:#fff;">
        <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:16px;">Filters</div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#999;margin-bottom:10px;">Category</div>
        <div style="display:flex;flex-direction:column;gap:11px;margin-bottom:22px;">
          ${categories.map((c, i) => `
            <label style="display:flex;align-items:center;gap:10px;font-size:14px;color:#333;">
              <span style="width:17px;height:17px;border-radius:5px;border:1.5px solid;border-color:${i === 0 ? '#378ADD' : '#cfd3da'};background:${i === 0 ? '#378ADD' : '#fff'};display:flex;align-items:center;justify-content:center;">${i === 0 ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>' : ''}</span>
              ${escapeHtml(c)}
            </label>`).join('')}
        </div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#999;margin-bottom:10px;">Price</div>
        <div style="height:5px;border-radius:3px;background:#eee;position:relative;margin-bottom:12px;">
          <div style="position:absolute;left:8%;right:32%;top:0;bottom:0;background:#378ADD;border-radius:3px;"></div>
          <div style="position:absolute;left:8%;top:-4px;width:13px;height:13px;border-radius:50%;background:#fff;border:2px solid #378ADD;"></div>
          <div style="position:absolute;right:32%;top:-4px;width:13px;height:13px;border-radius:50%;background:#fff;border:2px solid #378ADD;"></div>
        </div>
        <div style="font-size:13px;color:#555;font-weight:600;">${escapeHtml(p.priceRange)}</div>
      </div>
    </div>`;
  },

  checkout: () => {
    const label = 'display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:6px;';
    const field = 'width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #e2e2e6;border-radius:9px;font-size:14px;color:#999;background:#fafafa;';
    const title = 'font-size:13px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#111;margin:0 0 16px;';
    return `
    <div style="padding:28px 32px;">
      <div style="max-width:480px;margin:0 auto;border:1px solid #ececec;border-radius:16px;padding:28px;background:#fff;">
        <div style="${title}">Shipping details</div>
        <div style="margin-bottom:14px;"><label style="${label}">Full name</label><div style="${field}">Jane Appleseed</div></div>
        <div style="margin-bottom:14px;"><label style="${label}">Address</label><div style="${field}">123 Market Street</div></div>
        <div style="display:flex;gap:12px;margin-bottom:26px;">
          <div style="flex:1;"><label style="${label}">City</label><div style="${field}">San Francisco</div></div>
          <div style="width:110px;"><label style="${label}">ZIP</label><div style="${field}">94103</div></div>
        </div>
        <div style="${title}">Payment</div>
        <div style="margin-bottom:14px;"><label style="${label}">Card number</label><div style="${field}display:flex;justify-content:space-between;"><span>•••• •••• •••• 4242</span><span style="color:#cfcfcf;">VISA</span></div></div>
        <div style="display:flex;gap:12px;margin-bottom:26px;">
          <div style="flex:1;"><label style="${label}">Expiry</label><div style="${field}">12 / 28</div></div>
          <div style="flex:1;"><label style="${label}">CVC</label><div style="${field}">•••</div></div>
        </div>
        <div style="text-align:center;background:#111;color:#fff;padding:14px 0;border-radius:10px;font-size:15px;font-weight:700;">Pay $196.00</div>
      </div>
    </div>`;
  },

  /* ── INTERACTIVE ───────────────────────────────────────────── */
  form: (p) => {
    const fields = p.fields || [];
    const submitText = p.submitText || 'Submit';
    const label = 'display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:6px;';
    const input = 'width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #dfe2e8;border-radius:9px;font-size:14px;color:#111;font-family:inherit;outline:none;background:#fff;';
    return `
    <div style="padding:32px;">
      <form data-tn-form style="max-width:460px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">
        ${fields.map((f) => {
          const req = f.required === true || f.required === 'true';
          const lbl = `<label style="${label}">${escapeHtml(f.label)}${req ? '<span style="color:#ef4444;"> *</span>' : ''}</label>`;
          const ctrl = f.type === 'textarea'
            ? `<textarea ${req ? 'required ' : ''}style="${input}min-height:90px;resize:vertical;"></textarea>`
            : `<input type="${escapeHtml(f.type || 'text')}" ${req ? 'required ' : ''}style="${input}" />`;
          return `<div>${lbl}${ctrl}</div>`;
        }).join('')}
        <button type="submit" data-submit-text="${escapeHtml(submitText)}" style="margin-top:4px;background:#378ADD;color:#fff;border:none;border-radius:10px;padding:13px 0;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;transition:background 0.2s;">${escapeHtml(submitText)}</button>
      </form>
    </div>`;
  },

  countdown: (p) => {
    const target = new Date(p.targetDate).getTime();
    const t = isFinite(target) ? target : 0;
    const diff = Math.max(0, t - Date.now());
    const units = [
      { k: 'd', n: Math.floor(diff / 86400000), l: 'Days' },
      { k: 'h', n: Math.floor((diff % 86400000) / 3600000), l: 'Hours' },
      { k: 'm', n: Math.floor((diff % 3600000) / 60000), l: 'Minutes' },
      { k: 's', n: Math.floor((diff % 60000) / 1000), l: 'Seconds' },
    ];
    return `
    <section data-countdown="${t}" style="padding:56px 32px;text-align:center;background:linear-gradient(135deg,#111,#2a2a35);">
      ${p.label ? `<div style="font-size:14px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.55);margin-bottom:22px;">${escapeHtml(p.label)}</div>` : ''}
      <div style="display:flex;justify-content:center;gap:14px;">
        ${units.map((u) => `
          <div style="min-width:76px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px 10px;">
            <div data-unit="${u.k}" style="font-size:36px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;line-height:1;">${String(u.n).padStart(2, '0')}</div>
            <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-top:8px;">${u.l}</div>
          </div>`).join('')}
      </div>
    </section>`;
  },

  carousel: (p) => {
    const slides = p.slides && p.slides.length ? p.slides : [''];
    const n = slides.length;
    const gradients = ['linear-gradient(135deg,#378ADD,#6db3f2)', 'linear-gradient(135deg,#7c4dff,#b388ff)', 'linear-gradient(135deg,#00bfa5,#5df2d6)', 'linear-gradient(135deg,#ff6e7f,#bfe9ff)'];
    const arrow = (side) => `position:absolute;top:50%;transform:translateY(-50%);${side}:14px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.85);border:none;cursor:pointer;color:#111;font-size:24px;line-height:1;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.2);`;
    return `
    <div style="padding:28px 32px;">
      <div data-carousel style="position:relative;width:100%;height:280px;border-radius:14px;overflow:hidden;">
        ${slides.map((slide, i) => {
          const isImg = typeof slide === 'string' && /^https?:\/\//.test(slide);
          const bg = isImg ? '#000' : gradients[i % gradients.length];
          return `<div data-slide="${i}" style="position:absolute;inset:0;display:${i === 0 ? 'flex' : 'none'};align-items:center;justify-content:center;background:${bg};">${isImg
            ? `<img src="${escapeHtml(slide)}" alt="Slide ${i + 1}" style="width:100%;height:100%;object-fit:cover;" />`
            : `<div style="color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.02em;text-shadow:0 2px 10px rgba(0,0,0,0.15);padding:0 60px;text-align:center;">${escapeHtml(slide)}</div>`}</div>`;
        }).join('')}
        ${n > 1 ? `<button data-carousel-prev type="button" aria-label="Previous" style="${arrow('left')}">‹</button>` : ''}
        ${n > 1 ? `<button data-carousel-next type="button" aria-label="Next" style="${arrow('right')}">›</button>` : ''}
        <div style="position:absolute;bottom:14px;left:0;right:0;display:flex;justify-content:center;gap:7px;">
          ${slides.map((_, i) => `<button data-dot="${i}" type="button" aria-label="Go to slide ${i + 1}" style="width:${i === 0 ? '22px' : '8px'};height:8px;border-radius:4px;border:none;padding:0;cursor:pointer;background:${i === 0 ? '#fff' : 'rgba(255,255,255,0.5)'};transition:width 0.2s;"></button>`).join('')}
        </div>
      </div>
    </div>`;
  },

  map: (p) => {
    const z = Number(p.zoom) || 13;
    const q = encodeURIComponent(p.address || '');
    return `
    <div style="padding:24px 32px;">
      <div style="position:relative;width:100%;height:320px;border-radius:12px;overflow:hidden;border:1px solid #ececec;box-shadow:0 4px 18px rgba(0,0,0,0.08);">
        ${q
          ? `<iframe title="Map" src="https://maps.google.com/maps?q=${q}&z=${z}&output=embed" style="width:100%;height:100%;border:0;" loading="lazy"></iframe>`
          : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#eef1f6;color:#9aa1ad;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg></div>'}
      </div>
    </div>`;
  },
};

// Render a single block, applying the universal style wrapper (props.style)
// exactly like the editor's BlockRenderer does: the same styleToCss output plus
// the tn-block hover classes and (data-driven) entrance animation.
function renderBlock(block) {
  const render = BLOCK_HTML[block.type];
  if (!render) return '';
  const props = block.props || {};
  const inner = render(props);

  const st = props.style;
  const cssObj = styleToCss(st);
  const hoverEffect = st && st.hoverEffect && st.hoverEffect !== 'none' ? st.hoverEffect : null;
  const entrance = st && st.entrance && st.entrance !== 'none' ? st.entrance : null;

  const needsWrap = Object.keys(cssObj).length > 0 || hoverEffect || entrance;
  if (!needsWrap) return inner;

  const cls = ['tn-block', hoverEffect ? `tn-hover-${hoverEffect}` : ''].filter(Boolean).join(' ');
  const entranceAttr = entrance
    ? ` data-entrance="${escapeHtml(entrance)}" data-duration="${Math.max(st.transitionDuration || 0, 500)}"`
    : '';
  return `<div class="${cls}"${entranceAttr} ${styleAttr(cssObj)}>${inner}</div>`;
}

// Hover + entrance CSS, mirrored from the editor's global block styles
// (client/src/pages/Editor.jsx) so styled blocks behave the same when published.
const PUBLISHED_BLOCK_CSS = `
    /* Universal block-wrapper hover effects (apply on :hover only). */
    .tn-block { transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease; }
    .tn-hover-lift:hover  { transform: translateY(-5px); box-shadow: 0 16px 40px rgba(0,0,0,0.18); }
    .tn-hover-scale:hover { transform: scale(1.025); }
    .tn-hover-glow:hover  { box-shadow: 0 0 0 3px rgba(55,138,221,0.35), 0 10px 36px rgba(55,138,221,0.4); }
    /* Entrance animation keyframes (played via IntersectionObserver in the runtime below). */
    @keyframes tnFade    { from { opacity: 0; } to { opacity: 1; } }
    @keyframes tnSlideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes tnSlideIn { from { opacity: 0; transform: translateX(-48px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes tnZoom    { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`;

// Vanilla-JS runtime that gives published pages the same interactivity the
// editor's stateful BlockRenderer components provide: single-open accordion/FAQ,
// tabs, carousel, live countdown, form submit feedback, and entrance animations.
// Self-contained and guarded by querySelectorAll, so it is a no-op when a block
// type is absent.
const PUBLISHED_RUNTIME_JS = `
(function () {
  // Accordion + FAQ: clicking a header opens it and closes its siblings.
  document.querySelectorAll('[data-accordion]').forEach(function (group) {
    var items = Array.prototype.slice.call(group.querySelectorAll('[data-acc-item]'));
    function apply(item, open) {
      var panel = item.querySelector('[data-acc-panel]');
      if (panel) panel.style.display = open ? 'block' : 'none';
      var icon = item.querySelector('[data-acc-icon]');
      if (icon) { var r = icon.getAttribute('data-rot'); icon.style.transform = open && r ? 'rotate(' + r + ')' : 'none'; }
      var bgEls = Array.prototype.slice.call(item.querySelectorAll('[data-bg-open]'));
      if (item.hasAttribute('data-bg-open')) bgEls.push(item);
      bgEls.forEach(function (el) { el.style.background = open ? el.getAttribute('data-bg-open') : el.getAttribute('data-bg-closed'); });
      item.setAttribute('data-open', open ? 'true' : 'false');
    }
    items.forEach(function (item) {
      var head = item.querySelector('[data-acc-head]');
      if (!head) return;
      head.addEventListener('click', function () {
        var wasOpen = item.getAttribute('data-open') === 'true';
        items.forEach(function (it) { apply(it, false); });
        if (!wasOpen) apply(item, true);
      });
    });
  });

  // Tabs: highlight the clicked tab and show its panel.
  document.querySelectorAll('[data-tabs]').forEach(function (tabs) {
    var btns = Array.prototype.slice.call(tabs.querySelectorAll('[data-tab-btn]'));
    var panels = Array.prototype.slice.call(tabs.querySelectorAll('[data-tab-panel]'));
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = btn.getAttribute('data-tab-btn');
        btns.forEach(function (b) {
          var on = b.getAttribute('data-tab-btn') === idx;
          b.style.borderBottom = on ? '2px solid #378ADD' : '2px solid transparent';
          b.style.color = on ? '#111' : '#888';
        });
        panels.forEach(function (pl) { pl.style.display = pl.getAttribute('data-tab-panel') === idx ? 'block' : 'none'; });
      });
    });
  });

  // Carousel: prev/next arrows and dot navigation.
  document.querySelectorAll('[data-carousel]').forEach(function (car) {
    var slides = Array.prototype.slice.call(car.querySelectorAll('[data-slide]'));
    var dots = Array.prototype.slice.call(car.querySelectorAll('[data-dot]'));
    var n = slides.length, idx = 0;
    if (!n) return;
    function show(i) {
      idx = (i % n + n) % n;
      slides.forEach(function (s, j) { s.style.display = j === idx ? 'flex' : 'none'; });
      dots.forEach(function (d, j) { d.style.width = j === idx ? '22px' : '8px'; d.style.background = j === idx ? '#fff' : 'rgba(255,255,255,0.5)'; });
    }
    var prev = car.querySelector('[data-carousel-prev]'); if (prev) prev.addEventListener('click', function () { show(idx - 1); });
    var next = car.querySelector('[data-carousel-next]'); if (next) next.addEventListener('click', function () { show(idx + 1); });
    dots.forEach(function (d, j) { d.addEventListener('click', function () { show(j); }); });
  });

  // Countdown: tick every second until the target date.
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    var target = parseInt(el.getAttribute('data-countdown'), 10) || 0;
    var units = Array.prototype.slice.call(el.querySelectorAll('[data-unit]'));
    function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
    function tick() {
      var diff = Math.max(0, target - Date.now());
      var map = {
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000)
      };
      units.forEach(function (u) { u.textContent = pad(map[u.getAttribute('data-unit')]); });
    }
    tick();
    setInterval(tick, 1000);
  });

  // Form: intercept submit and show transient "Sent!" feedback.
  document.querySelectorAll('[data-tn-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      if (!btn) return;
      var orig = btn.getAttribute('data-submit-text') || btn.textContent;
      btn.textContent = '\\u2713 Sent!';
      btn.style.background = '#22c55e';
      setTimeout(function () { btn.textContent = orig; btn.style.background = '#378ADD'; form.reset(); }, 2500);
    });
  });

  // Entrance animations: play when the block scrolls into view.
  var KF = { fade: 'tnFade', 'slide-up': 'tnSlideUp', 'slide-in': 'tnSlideIn', zoom: 'tnZoom' };
  var animated = Array.prototype.slice.call(document.querySelectorAll('.tn-block[data-entrance]'));
  function play(el) {
    var name = KF[el.getAttribute('data-entrance')];
    if (!name) { el.style.opacity = ''; return; }
    var dur = el.getAttribute('data-duration') || '500';
    el.style.opacity = '';
    el.style.animation = name + ' ' + dur + 'ms cubic-bezier(0.22,0.61,0.36,1) both';
  }
  if ('IntersectionObserver' in window) {
    animated.forEach(function (el) { el.style.opacity = '0'; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { play(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.15 });
    animated.forEach(function (el) { io.observe(el); });
  } else {
    animated.forEach(play);
  }
})();`;

// The embeddable chat-widget <script> tag for a published /s/:slug page. The src
// is RELATIVE (/widget.js) so it's always same-origin as the page it renders on:
// in dev the page is served through Vite (5173), which proxies /widget.js to
// Express; in prod the same backend serves both. A relative src therefore
// satisfies the page's `script-src 'self'` CSP everywhere with no host detection.
// (The external embed snippet shown in Settings is separate and keeps an absolute
// URL, since other origins can't resolve a relative path.) The widget reads
// data-api-key off its own script tag and renders the bubble that talks to
// /api/chat; it derives its API origin from its own (now same-origin) script src.
function widgetScriptTag(apiKey) {
  return `<script src="/widget.js" data-api-key="${escapeHtml(apiKey)}"></script>`;
}

// Build a complete, standalone HTML document for a published site.
//
// opts.chatbotEnabled — the site's global "Enable AI Assistant" toggle.
// opts.apiKey         — the site's api_key, stamped onto the widget script.
// The widget is injected once if the global toggle is on OR an "aiChat" block is
// placed on the canvas (deduped so both together still inject a single bubble).
function renderBlocksToHTML(blocks, siteName, opts = {}) {
  const { chatbotEnabled = false, apiKey = '' } = opts;
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  const body = safeBlocks
    .filter((b) => b && !b.hidden && BLOCK_HTML[b.type])
    .map(renderBlock)
    .join('\n');

  // An aiChat block is a floating bubble, not inline content — its presence just
  // requests the widget. Detect it before the BLOCK_HTML filter above drops it.
  const hasAiChatBlock = safeBlocks.some((b) => b && !b.hidden && b.type === 'aiChat');
  const widgetTag = (chatbotEnabled || hasAiChatBlock) && apiKey
    ? widgetScriptTag(apiKey)
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(siteName || 'My Site')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #ffffff;
      color: #111;
      -webkit-font-smoothing: antialiased;
    }
    img { max-width: 100%; }
${PUBLISHED_BLOCK_CSS}
  </style>
</head>
<body>
${body}
<script>${PUBLISHED_RUNTIME_JS}</script>
${widgetTag}
</body>
</html>`;
}

// ── Template content ───────────────────────────────────────────────────────────
// Pre-built blocks for each Templates-page kit (client/src/pages/Templates.jsx).
// When "Use Template" is clicked, POST /api/sites copies the matching array into
// the new site so the editor opens on a usable starting layout, not a blank canvas.
// Props mirror each block's defaultProps in the editor's BLOCK_DEFINITIONS.

const TEMPLATE_CONTENT = {
  'ecom-pro': [
    { type: 'navbar', props: { logo: 'My Store', links: ['Shop', 'Collections', 'About'], cta: 'Cart' } },
    { type: 'hero', props: { title: 'New Collection', subtitle: 'Discover our latest products, crafted for everyday life.', ctaText: 'Shop now', bgColor: '#f8f8f8' } },
    { type: 'searchBar', props: { placeholder: 'Search products...' } },
    { type: 'productGrid', props: { columns: 3, products: [
      { name: 'Classic Tee', price: '$29' },
      { name: 'Wool Sweater', price: '$89' },
      { name: 'Denim Jacket', price: '$120' },
      { name: 'Canvas Sneakers', price: '$65' },
      { name: 'Leather Belt', price: '$45' },
      { name: 'Linen Shirt', price: '$55' },
    ] } },
    { type: 'footer', props: { text: '© 2025 My Store', links: ['Privacy', 'Terms', 'Contact'] } },
  ],

  'portfolio': [
    { type: 'navbar', props: { logo: 'Jane Doe', links: ['Work', 'About', 'Contact'], cta: 'Hire me' } },
    { type: 'hero', props: { title: 'Designer & Maker', subtitle: 'Selected work from the last few years.', ctaText: 'View work', bgColor: '#f4f4f5' } },
    { type: 'image', props: { src: '', alt: 'Project one', width: 'full', height: 360, borderRadius: 12, objectFit: 'cover' } },
    { type: 'image', props: { src: '', alt: 'Project two', width: 'half', height: 240, borderRadius: 12, objectFit: 'cover' } },
    { type: 'image', props: { src: '', alt: 'Project three', width: 'half', height: 240, borderRadius: 12, objectFit: 'cover' } },
    { type: 'footer', props: { text: '© 2025 Jane Doe', links: ['Instagram', 'Dribbble', 'Email'] } },
  ],

  'blog': [
    { type: 'navbar', props: { logo: 'The Journal', links: ['Latest', 'Topics', 'About'], cta: 'Subscribe' } },
    { type: 'heading', props: { text: 'Featured Story', level: 'h1' } },
    { type: 'text', props: { content: 'A deep dive into the ideas and people shaping what comes next. Read our editor’s pick for this week.' } },
    { type: 'heading', props: { text: 'Building in Public', level: 'h2' } },
    { type: 'text', props: { content: 'Notes on shipping early, learning from users, and the messy middle of building a product from scratch.' } },
    { type: 'heading', props: { text: 'The Long Read', level: 'h2' } },
    { type: 'text', props: { content: 'An essay on focus, craft, and doing fewer things better in a world optimized for more.' } },
    { type: 'footer', props: { text: '© 2025 The Journal', links: ['RSS', 'Twitter', 'Contact'] } },
  ],

  'saas': [
    { type: 'navbar', props: { logo: 'Flowbase', links: ['Features', 'Pricing', 'Docs'], cta: 'Start free' } },
    { type: 'hero', props: { title: 'Ship faster, together', subtitle: 'The all-in-one workspace for modern teams to plan, build, and launch.', ctaText: 'Get started free', bgColor: '#eef2ff' } },
    { type: 'columns', props: { count: 3, items: [
      'Realtime collaboration that keeps everyone in sync.',
      'Powerful automations so you spend less time on busywork.',
      'Analytics and insights to measure what matters.',
    ] } },
    { type: 'footer', props: { text: '© 2025 Flowbase', links: ['Privacy', 'Terms', 'Status'] } },
  ],

  'restaurant': [
    { type: 'navbar', props: { logo: 'Olive & Vine', links: ['Menu', 'Hours', 'Reservations'], cta: 'Book a table' } },
    { type: 'hero', props: { title: 'Seasonal Italian Kitchen', subtitle: 'Fresh pasta, wood-fired plates, and natural wine in the heart of downtown.', ctaText: 'Reserve now', bgColor: '#faf6f0' } },
    { type: 'columns', props: { count: 3, items: [
      'Starters — burrata, focaccia, and market salads.',
      'Mains — handmade pasta and wood-fired specials.',
      'Dessert — tiramisu, gelato, and affogato.',
    ] } },
    { type: 'footer', props: { text: '© 2025 Olive & Vine', links: ['Directions', 'Hours', 'Contact'] } },
  ],

  'agency': [
    { type: 'navbar', props: { logo: 'Northwind', links: ['Work', 'Services', 'Team'], cta: 'Get in touch' } },
    { type: 'hero', props: { title: 'We build brands that move', subtitle: 'A creative studio for ambitious companies ready for their next chapter.', ctaText: 'Start a project', bgColor: '#f5f5f5' } },
    { type: 'columns', props: { count: 3, items: [
      'Strategy — positioning, research, and brand foundations.',
      'Design — identity, websites, and product experiences.',
      'Growth — campaigns, content, and performance marketing.',
    ] } },
    { type: 'footer', props: { text: '© 2025 Northwind', links: ['Careers', 'LinkedIn', 'Contact'] } },
  ],
};

// Catalog metadata for the Templates page. Kept alongside TEMPLATE_CONTENT so
// the id set stays in sync: every entry here must have matching blocks above.
// Served by GET /api/templates so the frontend doesn't hardcode this list.
const TEMPLATES_META = [
  { id: 'ecom-pro',   name: 'E-Commerce Pro', category: 'E-Commerce', price: 29, description: 'Storefront layout with hero banner, product search, and product grid.' },
  { id: 'portfolio',  name: 'Portfolio',      category: 'Portfolio',   price: 0,  description: 'Minimal layout with hero and a three-image project gallery.' },
  { id: 'blog',       name: 'Blog Starter',   category: 'Blog',        price: 0,  description: 'Clean editorial layout with a featured story and article teasers.' },
  { id: 'saas',       name: 'SaaS Landing',   category: 'SaaS',        price: 49, description: 'Landing layout with hero and three-column feature highlights.' },
  { id: 'restaurant', name: 'Restaurant',     category: 'Restaurant',  price: 19, description: 'Restaurant layout with hero and three-column menu highlights.' },
  { id: 'agency',     name: 'Agency',         category: 'Portfolio',   price: 39, description: 'Studio layout with hero and three-column services overview.' },
];

// Deep-copy a template's blocks and stamp each with a fresh unique id, matching
// the { id, type, props } shape the editor creates for new blocks.
function buildTemplateBlocks(templateId) {
  const template = TEMPLATE_CONTENT[templateId];
  if (!template) return [];
  return template.map((block) => ({
    id: crypto.randomUUID(),
    type: block.type,
    props: JSON.parse(JSON.stringify(block.props)),
  }));
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
    }
  }
}));
// CORS for the authenticated app API (/api/sites, /api/checkout, …). Same-origin
// requests (no Origin header) always pass; this only matters when the frontend is
// served from a DIFFERENT origin than this backend (e.g. Vercel frontend + Render
// backend). Allowed origins come from env (APP_URL) — never hardcoded — plus the
// Vite dev origin in non-production. The public /api/chat widget endpoint does NOT
// rely on this list: it sets its own per-site CORS headers further down.
const allowedOrigins = [
  process.env.APP_URL,
  process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : null,
].filter(Boolean).map((o) => o.replace(/\/+$/, ''));

app.use(cors({
  origin(origin, cb) {
    // No Origin header => same-origin or non-browser caller; allow it.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin.replace(/\/+$/, ''))) return cb(null, true);
    // Unknown origin: don't emit CORS headers (the browser blocks the cross-origin
    // read). /api/chat handles its own origins, so it's unaffected.
    return cb(null, false);
  },
}));

// Stripe webhook — Stripe signs the *raw* request body, so this route must read
// it with express.raw() and be registered BEFORE express.json() below (which
// would otherwise consume and re-encode the body, breaking signature checks).
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // We stamped the buyer's user id on the session at creation time.
    const userId = session.client_reference_id || session.metadata?.user_id;
    if (userId) {
      try {
        // Account-level upgrade: the profiles row is the source of truth for
        // "is this user Pro". Store the Stripe customer id so we can later open
        // the billing portal for them.
        await pool.query(
          `INSERT INTO profiles (user_id, subscription_tier, stripe_customer_id, updated_at)
           VALUES ($1, 'pro', $2, NOW())
           ON CONFLICT (user_id) DO UPDATE
             SET subscription_tier = 'pro',
                 stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, profiles.stripe_customer_id),
                 updated_at = NOW()`,
          [userId, session.customer ?? null]
        );
        // Keep the legacy per-site column in sync so existing code keeps working.
        await pool.query(
          "UPDATE sites SET subscription_tier = 'pro' WHERE owner_id = $1",
          [userId]
        );
      } catch (err) {
        // Return 500 so Stripe retries the webhook rather than dropping the upgrade.
        console.error('Stripe webhook: failed to upgrade account:', err);
        return res.status(500).json({ error: 'Internal server error.' });
      }
    } else {
      console.warn('Stripe webhook: checkout.session.completed had no user id.');
    }
  }

  res.json({ received: true });
});

app.use(express.json());

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Serve static files from public/ (e.g. the embeddable /widget.js) but NOT
// index.html at "/" — the landing page is now a route in the React SPA.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Public template catalog ─────────────────────────────────────────────────────
// No auth: this is just template data the Templates page renders previews from.

app.get('/api/templates', (_req, res) => {
  res.json(TEMPLATES_META);
});

app.get('/api/templates/:id/preview', (req, res) => {
  const blocks = TEMPLATE_CONTENT[req.params.id];
  if (!blocks) {
    return res.status(404).json({ error: 'Template not found.' });
  }
  res.json(blocks);
});

// Plain-text digest of a site's blocks for the chat agent's system prompt, so
// the assistant can answer questions about what's actually on the page. Walks
// each block's props generically and collects human-readable strings, skipping
// styling/asset values (colors, URLs, dimensions). Capped so a large page can't
// blow up the prompt.
const DIGEST_SKIP_KEYS = /color|bg|src|href|url|image|font|align|width|height|radius|level|fit|variant|placeholder|date|^type$/i;
const DIGEST_CHAR_CAP = 2000;

function collectPropText(value, out) {
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.length > 1 && !/^(#|https?:|data:|\/)/i.test(s)) out.push(s);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectPropText(v, out));
  } else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (DIGEST_SKIP_KEYS.test(key)) continue;
      collectPropText(v, out);
    }
  }
}

function buildSiteDigest(blocks) {
  const lines = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const texts = [];
    collectPropText(block?.props, texts);
    if (texts.length) lines.push(`${block.type}: ${texts.join(' · ')}`);
  }
  let digest = lines.join('\n');
  if (digest.length > DIGEST_CHAR_CAP) digest = digest.slice(0, DIGEST_CHAR_CAP) + '…';
  return digest;
}

app.options('/api/chat', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
  const { apiKey, message, conversationId } = req.body;

  // 1. Validate apiKey exists in sites table and site is active
  if (!apiKey || !message) {
    return res.status(400).json({ error: 'apiKey and message are required.' });
  }

  let site;
  try {
    const result = await pool.query(
      'SELECT id, name, domain_url, subscription_tier, is_active, slug, content FROM sites WHERE api_key = $1',
      [apiKey]
    );
    site = result.rows[0];
  } catch (err) {
    console.error('DB error looking up site:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }

  if (!site) {
    return res.status(401).json({ error: 'Invalid API key.' });
  }

  if (!site.is_active) {
    return res.status(403).json({ error: 'Site is inactive.' });
  }

  // 2. Validate the request source. Two cases are allowed:
  //    a) the site's own external domain (external embed on a non-Tribox site), and
  //    b) our own published page at /s/:slug for THIS site. Behind the Vite dev
  //       proxy the page origin (localhost:5173) differs from Express's host
  //       (localhost:3000), so comparing Origin to the server's own host is
  //       unreliable. Instead, trust the request when the Referer path points at
  //       /s/<this site's slug> — that page only renders for a valid published
  //       site and carries this site's api_key, and it's host/port-agnostic.
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const normalise = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();

  const matchesDomain = site.domain_url && normalise(origin) === normalise(site.domain_url);

  let matchesPublishedPage = false;
  if (site.slug) {
    try {
      // Compare only the path so host/port (proxy vs. origin server) don't matter.
      const refPath = normalise(new URL(referer).pathname);
      matchesPublishedPage = refPath === normalise(`/s/${site.slug}`);
    } catch {
      matchesPublishedPage = false;
    }
  }

  //    c) same-origin request from our own served page. The published page is
  //       served by this same backend (directly in prod, via the Vite proxy in
  //       dev). When the browser's Referrer-Policy trims the Referer down to the
  //       bare origin, (b) can't see the /s/:slug path, so also trust the request
  //       when its Origin equals the origin this server is being addressed on
  //       (Host, or X-Forwarded-Host when behind the proxy).
  const fwdProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const scheme = fwdProto || req.protocol || 'http';
  const serverOrigins = [
    req.headers.host ? `${scheme}://${req.headers.host}` : null,
    req.headers['x-forwarded-host'] ? `${scheme}://${req.headers['x-forwarded-host']}` : null,
  ].filter(Boolean);
  const matchesServerOrigin =
    !!origin && serverOrigins.some((o) => normalise(o) === normalise(origin));

  if (!matchesDomain && !matchesPublishedPage && !matchesServerOrigin) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  // Echo back the matched origin only (never a wildcard for a specific site).
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 3. Check daily usage limit for free tier
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let usageCount = 0;
  try {
    const usageResult = await pool.query(
      'SELECT message_count FROM usage_logs WHERE site_id = $1 AND date = $2',
      [site.id, today]
    );
    usageCount = usageResult.rows[0]?.message_count ?? 0;
  } catch (err) {
    console.error('DB error reading usage_logs:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }

  if (site.subscription_tier === 'free' && usageCount >= 50) {
    return res.status(429).json({
      error: 'daily_limit_reached',
      upgradeUrl: '/pricing',
    });
  }

  // 4. Upsert conversation
  let resolvedConversationId;
  try {
    if (conversationId) {
      // Validate the existing conversation belongs to this site
      const convResult = await pool.query(
        'SELECT id FROM conversations WHERE id = $1 AND site_id = $2',
        [conversationId, site.id]
      );
      if (!convResult.rows[0]) {
        return res.status(404).json({ error: 'Conversation not found.' });
      }
      resolvedConversationId = conversationId;

      // Keep last_message_at current
      await pool.query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
        [resolvedConversationId]
      );
    } else {
      // Create a new conversation for this site
      const newConv = await pool.query(
        'INSERT INTO conversations (site_id, last_message_at) VALUES ($1, NOW()) RETURNING id',
        [site.id]
      );
      resolvedConversationId = newConv.rows[0].id;
    }
  } catch (err) {
    console.error('DB error upserting conversation:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }

  // 5. Save user message
  try {
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [resolvedConversationId, 'user', message]
    );
  } catch (err) {
    console.error('DB error saving user message:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }

  // 6. Fetch last 10 messages for context, then call Gemini
  let previousMessages = [];
  try {
    const msgResult = await pool.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 10',
      [resolvedConversationId]
    );
    previousMessages = msgResult.rows;
  } catch (err) {
    console.error('DB error fetching message history:', err);
  }

  let reply;
  try {
    const history = previousMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Ground the assistant in the site's actual page content so it can answer
    // real questions about products, copy, and policies that appear on the page.
    let siteDigest = '';
    try {
      let siteBlocks = site.content ?? [];
      if (typeof siteBlocks === 'string') siteBlocks = JSON.parse(siteBlocks);
      siteDigest = buildSiteDigest(siteBlocks);
    } catch {
      // Malformed content — fall back to the generic prompt.
    }

    const systemText =
      `You are a helpful customer support assistant for ${site.name}. Be concise and friendly.` +
      (siteDigest
        ? `\n\nThe site's published page content is below. Answer visitor questions from it; if something isn't covered, say you're not sure rather than guessing.\n\n${siteDigest}`
        : '');

    const chat = geminiModel.startChat({
      history,
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemText }]
      },
    });

    const result = await chat.sendMessage(message);
    reply = result.response.text();
  } catch (err) {
    console.error('Gemini error:', err);
    return res.status(500).json({ error: 'ai_unavailable' });
  }

  // 7. Save assistant message
  try {
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [resolvedConversationId, 'assistant', reply]
    );
  } catch (err) {
    console.error('DB error saving assistant message:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }

  // 8. Increment usage_logs for today (upsert via composite PK)
  try {
    await pool.query(
      `INSERT INTO usage_logs (site_id, date, message_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (site_id, date)
       DO UPDATE SET message_count = usage_logs.message_count + 1`,
      [site.id, today]
    );
  } catch (err) {
    // Non-fatal: log and continue
    console.error('DB error incrementing usage_logs:', err);
  }

  return res.json({ reply, conversationId: resolvedConversationId });
  } catch (err) {
    console.error('[/api/chat error]', err);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    return res.status(500).json({ error: err.message });
  }
});

// ── Dashboard API ─────────────────────────────────────────────────────────────

app.get('/api/sites', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, domain_url, api_key, subscription_tier, is_active, created_at FROM sites WHERE owner_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/sites error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/sites', requireAuth, async (req, res) => {
  try {
    const { name = 'My Site', templateId } = req.body;
    const apiKey = crypto.randomUUID();
    // With a templateId, start from that template's pre-built layout; otherwise
    // a blank canvas (content stays []).
    const content = templateId ? buildTemplateBlocks(templateId) : [];
    const result = await pool.query(
      `INSERT INTO sites (name, owner_id, api_key, domain_url, subscription_tier, is_active, content)
       VALUES ($1, $2, $3, '', 'free', true, $4)
       RETURNING id, name, domain_url, api_key, subscription_tier, is_active, created_at`,
      [name, req.user.id, apiKey, JSON.stringify(content)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/sites error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Single site (owner-scoped) — backs the Settings page, which needs the slug
// and api_key that the list endpoint omits.
app.get('/api/sites/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, domain_url, api_key, subscription_tier, is_active, slug, is_published, chatbot_enabled, created_at FROM sites WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/sites/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Update site name and settings (custom domain, widget enable/disable).
// Only the fields present in the body are touched, so the UI can PATCH a
// single section at a time.
app.patch('/api/sites/:id', requireAuth, async (req, res) => {
  try {
    const { name, domain_url, is_active, chatbot_enabled } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Name must be a non-empty string.' });
      }
      fields.push(`name = $${i++}`);
      values.push(name.trim());
    }
    if (domain_url !== undefined) {
      if (typeof domain_url !== 'string') {
        return res.status(400).json({ error: 'domain_url must be a string.' });
      }
      fields.push(`domain_url = $${i++}`);
      values.push(domain_url.trim());
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${i++}`);
      values.push(Boolean(is_active));
    }
    if (chatbot_enabled !== undefined) {
      fields.push(`chatbot_enabled = $${i++}`);
      values.push(Boolean(chatbot_enabled));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided.' });
    }

    fields.push('updated_at = NOW()');
    values.push(req.params.id, req.user.id);

    const result = await pool.query(
      `UPDATE sites SET ${fields.join(', ')} WHERE id = $${i++} AND owner_id = $${i}
       RETURNING id, name, domain_url, api_key, subscription_tier, is_active, slug, is_published, chatbot_enabled, created_at`,
      values
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /api/sites/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.delete('/api/sites/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM sites WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/sites/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Billing API ─────────────────────────────────────────────────────────────

// Create a Stripe Checkout Session for the $29/mo Pro subscription and return
// its hosted-checkout URL. The frontend redirects the browser to that URL; on
// success Stripe sends us a checkout.session.completed webhook (above) that
// flips the user's sites to the 'pro' tier.
app.post('/api/checkout', requireAuth, async (req, res) => {
  try {
    // Prefer the requesting page's origin so redirects land back on the same
    // host the user came from; fall back to a configured app URL.
    const baseUrl = req.headers.origin || process.env.APP_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: req.user.id,
      customer_email: req.user.email,
      metadata: { user_id: req.user.id },
      success_url: `${baseUrl}/dashboard?upgraded=true`,
      cancel_url: `${baseUrl}/pricing`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('POST /api/checkout error:', err);
    res.status(500).json({ error: 'Could not start checkout.' });
  }
});

// Current user's account-level subscription tier. The profiles row is the
// source of truth; users without a row yet are treated as free.
app.get('/api/me/subscription', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT subscription_tier, stripe_customer_id FROM profiles WHERE user_id = $1',
      [req.user.id]
    );
    const row = result.rows[0];
    res.json({
      tier: row?.subscription_tier ?? 'free',
      has_billing: Boolean(row?.stripe_customer_id),
    });
  } catch (err) {
    console.error('GET /api/me/subscription error:', err);
    res.status(500).json({ error: 'Could not load subscription.' });
  }
});

// Open the Stripe Customer Portal so a Pro user can manage / cancel their
// subscription. Returns the portal URL for the frontend to redirect to.
app.post('/api/billing-portal', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT stripe_customer_id FROM profiles WHERE user_id = $1',
      [req.user.id]
    );
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'No active subscription to manage.' });
    }
    const baseUrl = req.headers.origin || process.env.APP_URL || 'http://localhost:5173';
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/account`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('POST /api/billing-portal error:', err);
    res.status(500).json({ error: 'Could not open billing portal.' });
  }
});

// ── Editor content API ───────────────────────────────────────────────────────

app.get('/api/sites/:id/content', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, content FROM sites WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found.' });
    console.log('GET content result:', result.rows[0]);
    const { id, name, content } = result.rows[0];
    // content may come back as a jsonb (already parsed) or as a text string
    let blocks = content ?? [];
    if (typeof blocks === 'string') {
      try { blocks = JSON.parse(blocks); } catch { blocks = []; }
    }
    if (!Array.isArray(blocks)) blocks = [];
    res.json({ id, name, blocks });
  } catch (err) {
    console.error('GET /api/sites/:id/content error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.put('/api/sites/:id/content', requireAuth, async (req, res) => {
  try {
    const { blocks } = req.body;
    console.log('PUT content, body:', req.body, 'user:', req.user?.id);
    if (!Array.isArray(blocks)) return res.status(400).json({ error: 'blocks must be an array.' });
    const result = await pool.query(
      'UPDATE sites SET content = $1 WHERE id = $2 AND owner_id = $3 RETURNING id',
      [JSON.stringify(blocks), req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/sites/:id/content error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Publishing API ─────────────────────────────────────────────────────────────

// "My Site!" → "my-site"; empty/symbol-only names fall back to "site".
function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'site';
}

app.post('/api/sites/:id/publish', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, slug FROM sites WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    const site = result.rows[0];
    if (!site) return res.status(404).json({ error: 'Not found.' });

    // 1. Reuse an existing slug; otherwise generate "<name>-<suffix>", retrying
    //    on the rare UNIQUE collision.
    let slug = site.slug;
    if (!slug) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = `${slugify(site.name)}-${crypto.randomBytes(2).toString('hex')}`;
        try {
          const upd = await pool.query(
            'UPDATE sites SET slug = $1, is_published = true WHERE id = $2 RETURNING slug',
            [candidate, site.id]
          );
          slug = upd.rows[0].slug;
          break;
        } catch (err) {
          if (err.code === '23505') continue; // unique_violation — try a new suffix
          throw err;
        }
      }
      if (!slug) return res.status(500).json({ error: 'Could not generate a unique URL.' });
    } else {
      // 2. Already has a slug — just flip the published flag.
      await pool.query('UPDATE sites SET is_published = true WHERE id = $1', [site.id]);
    }

    // 3. Return the public URL.
    res.json({ slug, url: `/s/${slug}` });
  } catch (err) {
    console.error('POST /api/sites/:id/publish error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Public, no-auth page for a published site.
app.get('/s/:slug', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, content, chatbot_enabled, api_key FROM sites WHERE slug = $1 AND is_published = true',
      [req.params.slug]
    );
    const site = result.rows[0];
    if (!site) {
      return res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Site not found</title>
  <style>
    body { font-family: Inter, -apple-system, sans-serif; background: #fafafa; color: #333;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100vh; margin: 0; text-align: center; }
    h1 { font-size: 64px; margin: 0; color: #111; }
    p { color: #666; }
  </style>
</head>
<body>
  <h1>404</h1>
  <p>This site doesn't exist or hasn't been published yet.</p>
</body>
</html>`);
    }

    let blocks = site.content ?? [];
    if (typeof blocks === 'string') {
      try { blocks = JSON.parse(blocks); } catch { blocks = []; }
    }
    if (!Array.isArray(blocks)) blocks = [];

    // Published pages may reference images hosted on Supabase Storage and other
    // origins, run the inline interactivity runtime (accordion/tabs/carousel/
    // countdown/form/entrance), and embed video/map iframes — so relax the
    // editor's strict CSP for this public route. The inline <script> is fully
    // static (no user data), so 'unsafe-inline' here doesn't widen XSS surface.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src * data:; font-src 'self' data: https://fonts.gstatic.com; frame-src https:"
    );
    // The embedded chat widget POSTs to our own same-origin /api/chat, which
    // authorises the request by checking the Referer points at this /s/:slug page.
    // Helmet's global default is Referrer-Policy: no-referrer, which strips the
    // Referer entirely and breaks that check in the browser. Override it here to
    // "same-origin": the browser still sends the full Referer (path included) to
    // our own API, but leaks nothing to cross-origin destinations.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.type('html').send(renderBlocksToHTML(blocks, site.name, {
      chatbotEnabled: site.chatbot_enabled === true,
      apiKey: site.api_key,
    }));
  } catch (err) {
    console.error('GET /s/:slug error:', err);
    res.status(500).type('html').send('<h1>500</h1><p>Something went wrong.</p>');
  }
});

// ── Production: serve the built React SPA ───────────────────────────────────────
// In development, Vite (port 5173) serves the app and proxies /api here, so this
// block is inactive. In production, Express serves the compiled client and lets
// React Router handle client-side routes via the catch-all below. It is mounted
// last so /api/*, /widget.js, and /s/:slug always take precedence.
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Global error handler — ensures CORS header is set even on unexpected crashes
app.use((err, req, res, _next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
module.exports.renderBlocksToHTML = renderBlocksToHTML;
