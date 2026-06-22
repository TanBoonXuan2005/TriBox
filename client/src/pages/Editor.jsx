import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { renderToStaticMarkup } from 'react-dom/server'
import { Highlight, themes } from 'prism-react-renderer'
import { supabase } from '../lib/supabase'
import BlockRenderer, {
  BLOCK_DEFINITIONS, SECTION_DEFAULTS, normalizeStyle, cloneProps,
  FONT_OPTIONS, FONT_WEIGHTS, SHADOW_OPTIONS, HOVER_OPTIONS, ENTRANCE_OPTIONS,
  WIDTH_OPTIONS, DISPLAY_OPTIONS, BORDER_STYLES, GRADIENT_DIRECTIONS,
  IMAGE_WIDTH_OPTIONS, OBJECT_FIT_OPTIONS, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES,
} from '../components/BlockRenderer'

const COMPONENT_CATEGORIES = [
  { name: 'Layout',      items: ['Navbar', 'Hero', 'Columns', 'Footer'] },
  { name: 'Content',     items: ['Heading', 'Text', 'Image', 'Button', 'Video', 'Accordion', 'Tabs', 'Gallery'] },
  { name: 'Marketing',   items: ['Testimonials', 'FAQ', 'Pricing Table', 'CTA'] },
  { name: 'Ecommerce',   items: ['Product Grid', 'Search Bar', 'Cart', 'Reviews', 'Product Filter', 'Checkout'] },
  { name: 'Interactive', items: ['Form', 'Countdown', 'Carousel', 'Map'] },
  { name: 'AI',          items: ['AI Chat'] },
]

// Left-panel labels → internal block types
const LABEL_TO_TYPE = {
  'Navbar': 'navbar',
  'Hero': 'hero',
  'Columns': 'columns',
  'Footer': 'footer',
  'Heading': 'heading',
  'Text': 'text',
  'Image': 'image',
  'Button': 'button',
  'Product Grid': 'productGrid',
  'Search Bar': 'searchBar',
  // Marketing
  'Testimonials': 'testimonials',
  'FAQ': 'faq',
  'Pricing Table': 'pricingTable',
  'CTA': 'cta',
  // Content
  'Video': 'video',
  'Accordion': 'accordion',
  'Tabs': 'tabs',
  'Gallery': 'gallery',
  // Ecommerce
  'Cart': 'cart',
  'Reviews': 'reviews',
  'Product Filter': 'productFilter',
  'Checkout': 'checkout',
  // Interactive
  'Form': 'form',
  'Countdown': 'countdown',
  'Carousel': 'carousel',
  'Map': 'map',
  // AI
  'AI Chat': 'aiChat',
}

const VIEWPORT_WIDTHS = { desktop: 1100, tablet: 768, mobile: 375 }


/* ────────────────────────────────────────────────────────────────
   CODE GENERATION
   generateCode(blocks, format) turns the blocks array into readable
   source. It returns { code, lineMap } where lineMap[i] holds the
   block id that line i belongs to (or null for boilerplate) — that
   mapping powers the block-to-code highlighting + click-to-select.
   ──────────────────────────────────────────────────────────────── */

/* Serialize a JS value as a source literal: 'str', 42, [a, b], { k: v } */
function jsLiteral(v) {
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[${v.map(jsLiteral).join(', ')}]`
  if (v && typeof v === 'object') {
    return `{ ${Object.entries(v).map(([k, val]) => `${k}: ${jsLiteral(val)}`).join(', ')} }`
  }
  return 'null'
}

/* Build the JSX attribute strings for one block's props */
function jsxProps(props) {
  const parts = []
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue
    if (typeof v === 'string') parts.push(`${k}="${v.replace(/"/g, '&quot;')}"`)
    else parts.push(`${k}={${jsLiteral(v)}}`)
  }
  return parts
}

/* Lightweight HTML pretty-printer: breaks a markup string onto indented
   lines so the generated HTML is readable in the code view. */
const VOID_TAG = /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i
function prettyHtml(html) {
  if (!html) return []
  const out = []
  let depth = 0
  for (let line of html.replace(/>\s*</g, '>\n<').split('\n')) {
    line = line.trim()
    if (!line) continue
    const isClosing = line.startsWith('</')
    const isComment = line.startsWith('<!')
    const isSelfClose = line.endsWith('/>')
    const isVoid = VOID_TAG.test(line)
    const inlineClose = /^<[^/!][^>]*>.*<\/[^>]+>$/.test(line) // <tag>text</tag> on one line
    if (isClosing) depth = Math.max(0, depth - 1)
    out.push('  '.repeat(depth) + line)
    if (line.startsWith('<') && !isClosing && !isComment && !isSelfClose && !isVoid && !inlineClose) {
      depth++
    }
  }
  return out
}

function generateCode(blocks, format) {
  const lines = []
  const push = (text, blockId = null) => lines.push({ text, blockId })
  const visible = blocks.filter((b) => !b.hidden)

  if (format === 'html') {
    push('<div>')
    if (visible.length === 0) {
      push('  <!-- Drag components onto the canvas to generate code -->')
    } else {
      for (const b of visible) {
        const label = BLOCK_DEFINITIONS[b.type]?.label ?? b.type
        push(`  <!-- ${label} Section -->`, b.id)
        let markup = ''
        try { markup = renderToStaticMarkup(<BlockRenderer block={b} />) } catch { /* ignore */ }
        for (const ln of prettyHtml(markup)) push('  ' + ln, b.id)
      }
    }
    push('</div>')
  } else {
    push('export default function MyPage() {')
    push('  return (')
    push('    <div>')
    if (visible.length === 0) {
      push('      {/* Drag components onto the canvas to generate code */}')
    } else {
      for (const b of visible) {
        const label = BLOCK_DEFINITIONS[b.type]?.label ?? b.type
        const Comp = b.type.charAt(0).toUpperCase() + b.type.slice(1)
        push(`      {/* ${label} Section */}`, b.id)
        const props = jsxProps(b.props)
        const single = props.length ? `<${Comp} ${props.join(' ')} />` : `<${Comp} />`
        if (('      ' + single).length <= 90) {
          push('      ' + single, b.id)
        } else {
          // wrap long prop lists, one prop per line, all mapped to the block
          push(`      <${Comp}`, b.id)
          for (const p of props) push('        ' + p, b.id)
          push('      />', b.id)
        }
      }
    }
    push('    </div>')
    push('  )')
    push('}')
  }

  return { code: lines.map((l) => l.text).join('\n'), lineMap: lines.map((l) => l.blockId) }
}

function DesktopIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function TabletIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  )
}

function MobileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function MoveIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
    </svg>
  )
}

function DuplicateIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <path d="M1 1l22 22M6.61 6.61A18.5 18.5 0 001 12s4 8 11 8a9.12 9.12 0 005.39-1.61" strokeLinecap="round" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="28" height="28" viewBox="0 0 50 50">
      <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="5" />
      <circle cx="25" cy="25" r="20" fill="none" stroke="#378ADD" strokeWidth="5"
        strokeLinecap="round" strokeDasharray="80 45">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25"
          dur="0.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

/* Small monogram-style icon per block type, used in the Layers list */
function LayerIcon({ type }) {
  const c = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }
  switch (type) {
    case 'navbar':      return <svg {...c}><rect x="3" y="5" width="18" height="5" rx="1.5" /></svg>
    case 'hero':        return <svg {...c}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="7" y1="10" x2="17" y2="10" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
    case 'heading':     return <svg {...c} strokeLinecap="round"><path d="M5 5v14M19 5v14M5 12h14" /></svg>
    case 'text':        return <svg {...c} strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
    case 'image':       return <svg {...c}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
    case 'button':      return <svg {...c}><rect x="3" y="8" width="18" height="8" rx="4" /></svg>
    case 'columns':     return <svg {...c}><rect x="3" y="4" width="5" height="16" /><rect x="10" y="4" width="4" height="16" /><rect x="16" y="4" width="5" height="16" /></svg>
    case 'productGrid': return <svg {...c}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
    case 'searchBar':   return <svg {...c} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
    case 'footer':      return <svg {...c}><rect x="3" y="14" width="18" height="5" rx="1.5" /></svg>
    case 'testimonials':return <svg {...c}><path d="M7 8h7M7 12h4" strokeLinecap="round" /><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 17l-2 3v-3" /></svg>
    case 'faq':         return <svg {...c} strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 015 .2c0 1.8-2.5 2-2.5 3.3" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
    case 'pricingTable':return <svg {...c}><rect x="3" y="5" width="5" height="14" rx="1" /><rect x="9.5" y="3" width="5" height="16" rx="1" /><rect x="16" y="5" width="5" height="14" rx="1" /></svg>
    case 'cta':         return <svg {...c}><rect x="3" y="6" width="18" height="12" rx="2" /><rect x="8" y="10" width="8" height="4" rx="2" fill="currentColor" stroke="none" /></svg>
    case 'video':       return <svg {...c}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" /></svg>
    case 'accordion':   return <svg {...c} strokeLinecap="round"><rect x="3" y="4" width="18" height="5" rx="1.5" /><rect x="3" y="12" width="18" height="8" rx="1.5" /><path d="M17 15.5l-1.5 1.5" /></svg>
    case 'tabs':        return <svg {...c}><path d="M3 9h6V5h12v14H3z" /><line x1="9" y1="5" x2="9" y2="9" /></svg>
    case 'gallery':     return <svg {...c}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>
    case 'cart':        return <svg {...c} strokeLinecap="round"><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M3 4h2l2.5 12h11l2-8H6" /></svg>
    case 'reviews':     return <svg {...c}><path d="M12 4l2.3 4.7 5.2.7-3.8 3.6.9 5.1L12 15.8 7.4 18.2l.9-5.1L4.5 9.4l5.2-.7z" /></svg>
    case 'productFilter':return <svg {...c} strokeLinecap="round"><path d="M4 5h16l-6 7v6l-4 2v-8z" /></svg>
    case 'checkout':    return <svg {...c}><rect x="3" y="6" width="18" height="12" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
    case 'form':        return <svg {...c} strokeLinecap="round"><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></svg>
    case 'countdown':   return <svg {...c} strokeLinecap="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>
    case 'carousel':    return <svg {...c}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M3 9v6M21 9v6" strokeLinecap="round" /></svg>
    case 'map':         return <svg {...c}><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><line x1="9" y1="4" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="20" /></svg>
    case 'aiChat':      return <svg {...c} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 01-.9-3.8A8.38 8.38 0 0112.5 3 8.38 8.38 0 0121 11.5z" /><path d="M9 11h.01M12 11h.01M15 11h.01" /></svg>
    default:            return <svg {...c}><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
  }
}

const s = {
  root: {
    display: 'flex',
    height: '100vh',
    background: '#09090b',
    fontFamily: 'Inter, -apple-system, sans-serif',
    color: '#fafafa',
    overflow: 'hidden',
  },

  // ── LEFT PANEL ─────────────────────────────────────────────
  left: {
    width: '220px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '0.5px solid rgba(255,255,255,0.07)',
    background: '#0c0c0e',
  },
  leftTop: {
    padding: '14px 14px 0',
  },
  panelTitle: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)',
    marginBottom: '10px',
  },
  tabBar: {
    display: 'flex',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '8px',
    padding: '3px',
    marginBottom: '10px',
  },
  tab: (active) => ({
    flex: 1,
    padding: '5px 0',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    border: 'none',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#fafafa' : 'rgba(255,255,255,0.38)',
    fontFamily: 'inherit',
    transition: 'background 0.12s, color 0.12s',
  }),
  leftScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 10px 16px',
  },
  catLabel: {
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.22)',
    padding: '10px 4px 5px',
  },
  compItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '7px 10px',
    borderRadius: '6px',
    cursor: 'grab',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: '1px',
    transition: 'background 0.1s, color 0.1s',
    userSelect: 'none',
  },
  compDot: {
    width: '5px',
    height: '5px',
    borderRadius: '1px',
    background: 'rgba(255,255,255,0.18)',
    flexShrink: 0,
  },
  layersEmpty: {
    padding: '32px 8px',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  layerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    fontSize: '13px',
    marginBottom: '1px',
    userSelect: 'none',
  },
  layerHandle: {
    display: 'flex',
    alignItems: 'center',
    color: 'rgba(255,255,255,0.3)',
    cursor: 'grab',
    flexShrink: 0,
  },
  layerName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  eyeBtn: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    border: 'none',
    borderRadius: '5px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },

  // ── CENTER PANEL ────────────────────────────────────────────
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
    minHeight: 0,
  },
  toolbar: {
    height: '44px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
    padding: '0 10px',
    background: '#0c0c0e',
  },
  toolGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    height: '28px',
    padding: '0 9px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'inherit',
    transition: 'background 0.1s, color 0.1s',
  },
  backLogo: {
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    color: '#fafafa',
  },
  leavingHint: {
    fontSize: '11px',
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    whiteSpace: 'nowrap',
    marginLeft: '4px',
  },
  vpBtn: (active) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#fafafa' : 'rgba(255,255,255,0.32)',
    fontFamily: 'inherit',
    transition: 'background 0.1s, color 0.1s',
  }),
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: 'rgba(255,255,255,0.32)',
    fontFamily: 'inherit',
  },
  divider: {
    width: '1px',
    height: '18px',
    background: 'rgba(255,255,255,0.08)',
    margin: '0 6px',
  },
  saveBtn: {
    background: 'rgba(255,255,255,0.07)',
    border: '0.5px solid rgba(255,255,255,0.11)',
    color: 'rgba(255,255,255,0.65)',
    borderRadius: '7px',
    padding: '5px 13px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  previewBtn: {
    background: 'transparent',
    border: '0.5px solid rgba(255,255,255,0.11)',
    color: 'rgba(255,255,255,0.65)',
    borderRadius: '7px',
    padding: '5px 13px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginLeft: '6px',
  },
  deployBtn: {
    background: '#e4e4e7',
    color: '#09090b',
    border: 'none',
    borderRadius: '7px',
    padding: '5px 13px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginLeft: '6px',
  },
  iconBtnDisabled: {
    color: 'rgba(255,255,255,0.13)',
    cursor: 'default',
  },
  saveStatus: (dirty) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: '500',
    color: dirty ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.32)',
    marginRight: '8px',
    whiteSpace: 'nowrap',
  }),
  saveStatusDot: (dirty) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: dirty ? '#f59e0b' : '#22c55e',
    flexShrink: 0,
  }),
  loadingOverlay: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    background: '#111113',
    color: 'rgba(255,255,255,0.4)',
    fontSize: '13px',
  },

  // ── PAGE TAB BAR ────────────────────────────────────────────
  pageBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    height: '38px',
    padding: '0 8px',
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
    background: '#0c0c0e',
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  pageTab: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: '27px',
    padding: '0 6px 0 11px',
    borderRadius: '7px',
    cursor: 'pointer',
    flexShrink: 0,
    maxWidth: '180px',
    border: active ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid transparent',
    background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
    color: active ? '#fafafa' : 'rgba(255,255,255,0.5)',
    fontSize: '12.5px',
    fontWeight: active ? 600 : 500,
    fontFamily: 'inherit',
    transition: 'background 0.1s, color 0.1s',
  }),
  pageTabName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pageHomeDot: {
    fontSize: '10px',
    color: '#f5b301',
    flexShrink: 0,
    lineHeight: 1,
  },
  pageTabMenuBtn: (active) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '17px',
    height: '17px',
    border: 'none',
    borderRadius: '4px',
    background: 'transparent',
    color: active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
    flexShrink: 0,
  }),
  pageAddBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    flexShrink: 0,
    border: '0.5px dashed rgba(255,255,255,0.18)',
    borderRadius: '7px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    fontFamily: 'inherit',
  },
  pageMenu: {
    position: 'absolute',
    zIndex: 50,
    minWidth: '160px',
    padding: '5px',
    borderRadius: '9px',
    background: '#161618',
    border: '0.5px solid rgba(255,255,255,0.12)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  pageMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '8px 10px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '12.5px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
  pageMenuItemDanger: {
    color: '#f87171',
  },
  pageMenuDivider: {
    height: '0.5px',
    background: 'rgba(255,255,255,0.08)',
    margin: '4px 2px',
  },
  pageModalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  pageModalCard: {
    width: '100%',
    maxWidth: '380px',
    background: '#141416',
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '14px',
    padding: '22px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  },
  pageModalTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#fafafa',
    margin: '0 0 16px',
  },
  pageModalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '18px',
  },
  pageModalBtn: (primary) => ({
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: primary ? 'none' : '0.5px solid rgba(255,255,255,0.14)',
    background: primary ? '#e4e4e7' : 'transparent',
    color: primary ? '#09090b' : 'rgba(255,255,255,0.7)',
  }),
  pageModalError: {
    marginTop: '10px',
    fontSize: '12px',
    color: '#f87171',
  },

  canvasArea: {
    flex: 1,
    // min-height:0 lets this flex child shrink below its content height so
    // overflowY:auto actually scrolls tall pages instead of overflowing.
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    justifyContent: 'center',
    // flex-start (not the default stretch): the card must take its natural
    // content height. With align-items:stretch the card is forced to this
    // container's *visible* height, and because canvasCard has overflow:hidden
    // the tall block content gets clipped inside the card — so this scroll
    // container never sees an over-tall child and never scrolls.
    alignItems: 'flex-start',
    padding: '28px 24px 40px',
    background: '#111113',
  },
  canvasCard: (maxW) => ({
    width: '100%',
    maxWidth: `${maxW}px`,
    minHeight: '520px',
    background: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 0 0 0.5px rgba(0,0,0,0.12), 0 8px 32px rgba(0,0,0,0.4)',
    transition: 'max-width 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
  }),
  emptyDrop: (over) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: '520px',
    gap: '12px',
    color: over ? '#378ADD' : 'rgba(0,0,0,0.22)',
    fontSize: '13px',
    border: over ? '1.5px dashed #378ADD' : '1.5px dashed rgba(0,0,0,0.12)',
    borderRadius: '8px',
    margin: '0',
    transition: 'color 0.12s, border-color 0.12s',
  }),

  // ── RIGHT PANEL ─────────────────────────────────────────────
  right: {
    width: '260px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    borderLeft: '0.5px solid rgba(255,255,255,0.07)',
    background: '#0c0c0e',
  },
  rightTop: {
    padding: '14px 14px 0',
  },
  propEmpty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.22)',
    padding: '0 18px',
    textAlign: 'center',
  },

  // ── PROPERTIES PANEL FORM ───────────────────────────────────
  rightScroll: {
    flex: 1,
    // min-height:0 so the full form (including the Delete block button at the
    // bottom) becomes scrollable instead of being clipped by the viewport.
    minHeight: 0,
    overflowY: 'auto',
    padding: '4px 16px 20px',
  },
  blockName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#fafafa',
    margin: '6px 0 4px',
  },
  groupTitle: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)',
    margin: '18px 0 11px',
    paddingBottom: '7px',
    borderBottom: '0.5px solid rgba(255,255,255,0.06)',
  },
  field: {
    marginBottom: '12px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '10px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: '5px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    padding: '7px 9px',
    fontSize: '12px',
    color: '#fafafa',
    fontFamily: 'inherit',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '64px',
    resize: 'vertical',
    background: 'rgba(255,255,255,0.05)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    padding: '7px 9px',
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#fafafa',
    fontFamily: 'inherit',
    outline: 'none',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    // Solid (non-translucent) background so the closed control AND the native
    // options popup stay dark — translucent white rendered the open menu as
    // white-on-white. The `select option` CSS rule below covers the popup items.
    background: '#161618',
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    padding: '7px 9px',
    fontSize: '12px',
    color: '#fafafa',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  colorSwatch: {
    width: '30px',
    height: '30px',
    padding: 0,
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    background: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
  },
  arrayItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    marginBottom: '6px',
  },
  arrayItemBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    minWidth: 0,
  },
  removeBtn: {
    flexShrink: 0,
    width: '26px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    color: 'rgba(255,255,255,0.45)',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
    fontFamily: 'inherit',
  },
  addBtn: {
    width: '100%',
    marginTop: '2px',
    padding: '6px 0',
    background: 'rgba(255,255,255,0.05)',
    border: '0.5px dashed rgba(255,255,255,0.16)',
    borderRadius: '6px',
    color: 'rgba(255,255,255,0.55)',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  alignRow: {
    display: 'flex',
    gap: '4px',
  },
  alignBtn: (active) => ({
    flex: 1,
    padding: '6px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: active ? '#fafafa' : 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sliderVal: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.55)',
    minWidth: '34px',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  uploadZone: (over) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minHeight: '120px',
    padding: '18px 12px',
    borderRadius: '8px',
    border: over ? '1.5px dashed #378ADD' : '1.5px dashed rgba(255,255,255,0.16)',
    background: over ? 'rgba(55,138,221,0.08)' : 'rgba(255,255,255,0.03)',
    color: over ? '#7ab6f0' : 'rgba(255,255,255,0.45)',
    fontSize: '12px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.12s, background 0.12s, color 0.12s',
  }),
  uploadHint: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.3)',
    lineHeight: 1.4,
  },
  uploadPreview: {
    position: 'relative',
    width: '100%',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '0.5px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
  },
  uploadThumb: {
    display: 'block',
    width: '100%',
    height: '120px',
    objectFit: 'cover',
  },
  uploadBtnRow: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
  },
  uploadBtn: {
    flex: 1,
    padding: '6px 0',
    background: 'rgba(255,255,255,0.05)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: 'rgba(255,255,255,0.65)',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  uploadOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: 'rgba(10,10,12,0.72)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '11px',
  },
  uploadError: {
    marginTop: '7px',
    fontSize: '11px',
    color: '#f87171',
    lineHeight: 1.4,
  },
  deleteBlockBtn: {
    width: '100%',
    marginTop: '24px',
    padding: '8px 0',
    background: 'transparent',
    border: '0.5px solid rgba(239,68,68,0.35)',
    borderRadius: '7px',
    color: '#ef4444',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── COLLAPSIBLE STYLE SECTIONS ──────────────────────────────
  section: {
    borderBottom: '0.5px solid rgba(255,255,255,0.06)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '12px 2px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  sectionChevron: (open) => ({
    display: 'flex',
    color: 'rgba(255,255,255,0.4)',
    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: 'transform 0.14s ease',
    flexShrink: 0,
  }),
  sectionTitle: {
    flex: 1,
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  resetBtn: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    border: 'none',
    borderRadius: '5px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.32)',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  sectionBody: {
    paddingBottom: '8px',
  },
  // 4-sided box (padding / margin) editor
  boxRow: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '8px',
  },
  boxGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    gap: '5px',
  },
  boxCell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
  },
  boxInput: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    padding: '6px 4px',
    fontSize: '12px',
    color: '#fafafa',
    fontFamily: 'inherit',
    outline: 'none',
    textAlign: 'center',
    MozAppearance: 'textfield',
  },
  boxCellLabel: {
    fontSize: '9px',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: '0.04em',
  },
  linkBtn: (linked) => ({
    flexShrink: 0,
    width: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: linked ? 'rgba(55,138,221,0.18)' : 'rgba(255,255,255,0.04)',
    border: linked ? '0.5px solid rgba(55,138,221,0.5)' : '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: linked ? '#7ab6f0' : 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
    alignSelf: 'flex-start',
    height: '30px',
  }),
  swatchRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
  },
  hint: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.3)',
    marginTop: '4px',
    lineHeight: 1.4,
  },

  // ── CODE DRAWER ─────────────────────────────────────────────
  codeBtn: (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    background: active ? 'rgba(55,138,221,0.16)' : 'transparent',
    border: active ? '0.5px solid rgba(55,138,221,0.5)' : '0.5px solid rgba(255,255,255,0.11)',
    color: active ? '#7ab6f0' : 'rgba(255,255,255,0.65)',
    borderRadius: '7px',
    padding: '5px 11px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginLeft: '6px',
  }),
  codeDrawer: {
    height: '300px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#0a0a0c',
    borderTop: '0.5px solid rgba(255,255,255,0.1)',
  },
  codeHeader: {
    height: '38px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px 0 4px',
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
  },
  codeTabs: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  codeTab: (active) => ({
    padding: '5px 14px',
    fontSize: '12px',
    fontWeight: '500',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
    color: active ? '#fafafa' : 'rgba(255,255,255,0.4)',
    fontFamily: 'inherit',
    fontVariantLigatures: 'none',
  }),
  codeHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  codeCopyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(255,255,255,0.06)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.7)',
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  codeCloseBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    fontFamily: 'inherit',
  },
  codeScroll: {
    flex: 1,
    overflow: 'auto',
    fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
    fontSize: '12.5px',
    lineHeight: '20px',
  },
  codeLine: (highlighted, clickable) => ({
    display: 'flex',
    background: highlighted ? 'rgba(55,138,221,0.18)' : 'transparent',
    cursor: clickable ? 'pointer' : 'default',
    boxShadow: highlighted ? 'inset 2px 0 0 #378ADD' : 'none',
  }),
  codeGutter: {
    flexShrink: 0,
    width: '44px',
    textAlign: 'right',
    paddingRight: '14px',
    color: 'rgba(255,255,255,0.25)',
    userSelect: 'none',
    fontVariantNumeric: 'tabular-nums',
  },
  codeContent: {
    flex: 1,
    paddingRight: '18px',
    whiteSpace: 'pre',
  },
}

// ── Field configuration ───────────────────────────────────────
// Which prop keys render as which control inside the PropertiesPanel.
const TEXTAREA_KEYS = new Set(['content', 'subtitle', 'text', 'subtext', 'answer', 'quote'])
const COLOR_KEYS = new Set(['bgColor'])
const SELECT_OPTIONS = {
  level: ['h1', 'h2', 'h3', 'h4'],
  variant: ['filled', 'outline'],
  columns: [2, 3, 4],
  count: [2, 3, 4],
  aspectRatio: ['16:9', '4:3', '1:1'],
  zoom: [10, 11, 12, 13, 14, 15, 16],
  stars: [1, 2, 3, 4, 5],
  type: ['text', 'email', 'number', 'tel', 'date', 'textarea'],
}
const NUMERIC_KEYS = new Set(['columns', 'count', 'zoom', 'stars'])
const BOOLEAN_KEYS = new Set(['autoplay', 'highlighted', 'required'])
const ALIGNMENTS = ['left', 'center', 'right']

// camelCase / lowercase key → friendly label, e.g. ctaText → "Cta Text"
function humanize(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

/* Draggable palette item (left panel) */
function PaletteItem({ label }) {
  const type = LABEL_TO_TYPE[label]
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${label}`,
    data: { isPalette: true, type },
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ ...s.compItem, opacity: isDragging ? 0.4 : 1 }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fafafa' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
    >
      <div style={s.compDot} />
      {label}
    </div>
  )
}

/* A block rendered on the canvas: sortable, selectable, with a hover toolbar */
function SortableBlock({ block, selected, onSelect, onHover, onDuplicate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const [hovered, setHovered] = useState(false)

  const wrap = {
    position: 'relative',
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    outline: selected ? '2px solid #378ADD' : '2px solid transparent',
    outlineOffset: '-2px',
    cursor: 'pointer',
  }

  const tbBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '24px', height: '24px', border: 'none', borderRadius: '5px',
    background: 'transparent', color: '#fff', cursor: 'pointer', padding: 0,
  }

  return (
    <div
      ref={setNodeRef}
      style={wrap}
      onMouseEnter={() => { setHovered(true); onHover?.(block.id) }}
      onMouseLeave={() => { setHovered(false); onHover?.(null) }}
      onClick={(e) => { e.stopPropagation(); onSelect(block.id) }}
    >
      {(hovered || selected) && (
        <div style={{
          position: 'absolute', top: '6px', right: '6px', zIndex: 5,
          display: 'flex', gap: '1px', padding: '3px',
          background: 'rgba(20,20,23,0.92)', borderRadius: '7px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <button
            title="Move"
            style={{ ...tbBtn, cursor: 'grab' }}
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
          ><MoveIcon /></button>
          <button
            title="Duplicate"
            style={tbBtn}
            onClick={(e) => { e.stopPropagation(); onDuplicate(block.id) }}
          ><DuplicateIcon /></button>
          <button
            title="Delete"
            style={tbBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(block.id) }}
          ><DeleteIcon /></button>
        </div>
      )}
      <BlockRenderer block={block} />
    </div>
  )
}

/* A color picker (swatch + hex text) bound to a single prop */
function ColorField({ value, onChange }) {
  const color = value || '#ffffff'
  return (
    <div style={s.colorRow}>
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        style={s.colorSwatch}
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#ffffff"
        style={s.input}
      />
    </div>
  )
}

/* ── Collapsible-section building blocks ──────────────────────── */
function ChevronIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v6h6" />
      <path d="M3.5 8a9 9 0 1 0 2.3-3.3L3 8" />
    </svg>
  )
}

function LinkIcon({ linked }) {
  return linked ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
    </svg>
  )
}

/* Remembers each section's open/closed state in localStorage so it persists
   across block selections and reloads. */
function useCollapsibleState(id, initial) {
  const key = `tn-section-${id}`
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(key); return v == null ? initial : v === '1' }
    catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, open ? '1' : '0') } catch { /* ignore */ }
  }, [key, open])
  return [open, setOpen]
}

/* A collapsible panel section with a header, optional reset, and body. */
function Section({ id, title, onReset, defaultOpen = true, children }) {
  const [open, setOpen] = useCollapsibleState(id, defaultOpen)
  return (
    <div style={s.section}>
      <div style={s.sectionHeader} onClick={() => setOpen((o) => !o)}>
        <span style={s.sectionChevron(open)}><ChevronIcon /></span>
        <span style={s.sectionTitle}>{title}</span>
        {onReset && (
          <button
            type="button"
            title="Reset section to defaults"
            style={s.resetBtn}
            onClick={(e) => { e.stopPropagation(); onReset() }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#fafafa' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.32)' }}
          >
            <ResetIcon />
          </button>
        )}
      </div>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  )
}

/* A labelled slider that shows its live value and debounces commits so the
   canvas doesn't re-render on every pixel of the drag. */
function Slider({ value, min, max, step = 1, suffix = 'px', format, onChange }) {
  const [local, setLocal] = useState(value)
  const timer = useRef(null)
  useEffect(() => { setLocal(value) }, [value])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function handle(v) {
    setLocal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(v), 110)
  }

  const display = format ? format(local) : `${local}${suffix}`
  return (
    <div style={s.sliderRow}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => handle(Number(e.target.value))}
        style={{ flex: 1, accentColor: '#378ADD' }}
      />
      <span style={s.sliderVal}>{display}</span>
    </div>
  )
}

/* A dark <select> bound to a style value. Empty-string option shows as label. */
function StyleSelect({ value, options, labels, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={s.select}>
      {options.map((opt) => (
        <option key={opt} value={opt}>{labels?.[opt] ?? (opt === '' ? 'Default' : humanize(String(opt)))}</option>
      ))}
    </select>
  )
}

/* The 4-input top/right/bottom/left editor for padding & margin, with a
   "link all sides" toggle. Commits via onChange(patchObject). */
function BoxField({ prefix, st, onChange }) {
  const linked = st[`${prefix}Linked`]
  const sides = ['Top', 'Right', 'Bottom', 'Left']

  function setSide(side, v) {
    const num = Number.isFinite(v) ? v : 0
    if (linked) {
      onChange({
        [`${prefix}Top`]: num, [`${prefix}Right`]: num,
        [`${prefix}Bottom`]: num, [`${prefix}Left`]: num,
        padding: undefined,
      })
    } else {
      onChange({ [`${prefix}${side}`]: num, padding: undefined })
    }
  }

  return (
    <div style={s.boxRow}>
      <div style={s.boxGrid}>
        {sides.map((side) => (
          <div key={side} style={s.boxCell}>
            <input
              type="number"
              value={st[`${prefix}${side}`] ?? 0}
              onChange={(e) => setSide(side, parseInt(e.target.value, 10))}
              style={s.boxInput}
            />
            <span style={s.boxCellLabel}>{side[0]}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        title={linked ? 'Sides linked' : 'Sides independent'}
        style={s.linkBtn(linked)}
        onClick={() => onChange({ [`${prefix}Linked`]: !linked })}
      >
        <LinkIcon linked={linked} />
      </button>
    </div>
  )
}

/* A repeatable list of strings or {key:value} objects, with add/remove */
/* One labelled control for a single key inside an object-array row. Handles
   nested string-lists (newline editor), booleans (checkbox), selects, long
   text (textarea) and plain strings, so structures like pricing plans
   (features[], highlighted) and form fields (type, required) stay editable. */
function ObjectFieldInput({ fieldKey, value, onChange }) {
  // Nested array of strings → newline-separated editor.
  if (Array.isArray(value)) {
    return (
      <textarea
        value={value.join('\n')}
        placeholder={`${humanize(fieldKey)} (one per line)`}
        onChange={(e) => onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
        style={{ ...s.textarea, minHeight: '52px' }}
      />
    )
  }
  // Boolean → checkbox toggle.
  if (typeof value === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '2px 0' }}>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: '#378ADD', width: '15px', height: '15px' }} />
        {humanize(fieldKey)}
      </label>
    )
  }
  // Known enum → select.
  if (SELECT_OPTIONS[fieldKey]) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(NUMERIC_KEYS.has(fieldKey) ? Number(e.target.value) : e.target.value)}
        style={s.select}
      >
        {SELECT_OPTIONS[fieldKey].map((opt) => (
          <option key={opt} value={opt}>{humanize(String(opt))}</option>
        ))}
      </select>
    )
  }
  // Long-form text → textarea.
  if (TEXTAREA_KEYS.has(fieldKey)) {
    return (
      <textarea
        value={value ?? ''}
        placeholder={humanize(fieldKey)}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...s.textarea, minHeight: '52px' }}
      />
    )
  }
  return (
    <input
      type="text"
      value={value ?? ''}
      placeholder={humanize(fieldKey)}
      onChange={(e) => onChange(NUMERIC_KEYS.has(fieldKey) && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
      style={s.input}
    />
  )
}

function ArrayField({ value, onChange }) {
  const items = Array.isArray(value) ? value : []
  const isObj = items.length > 0 && typeof items[0] === 'object' && items[0] !== null

  function updateItem(idx, next) {
    const copy = items.slice()
    copy[idx] = next
    onChange(copy)
  }
  function removeItem(idx) {
    onChange(items.filter((_, i) => i !== idx))
  }
  function addItem() {
    if (isObj) {
      // Build a fresh template that preserves each field's type (arrays → [],
      // booleans → false, everything else → '') so new rows stay editable.
      const template = Object.fromEntries(Object.keys(items[0]).map((k) => {
        const sample = items[0][k]
        if (Array.isArray(sample)) return [k, []]
        if (typeof sample === 'boolean') return [k, false]
        return [k, '']
      }))
      onChange([...items, template])
    } else {
      onChange([...items, ''])
    }
  }

  return (
    <div>
      {items.map((item, idx) => (
        <div key={idx} style={s.arrayItem}>
          <div style={s.arrayItemBody}>
            {isObj ? (
              Object.keys(item).map((k) => (
                <ObjectFieldInput
                  key={k}
                  fieldKey={k}
                  value={item[k]}
                  onChange={(v) => updateItem(idx, { ...item, [k]: v })}
                />
              ))
            ) : (
              <input
                type="text"
                value={item ?? ''}
                onChange={(e) => updateItem(idx, e.target.value)}
                style={s.input}
              />
            )}
          </div>
          <button
            type="button"
            title="Remove"
            style={s.removeBtn}
            onClick={() => removeItem(idx)}
          >×</button>
        </div>
      ))}
      <button type="button" style={s.addBtn} onClick={addItem}>+ Add item</button>
    </div>
  )
}

/* Renders the right control for one prop based on its key / value */
function PropField({ fieldKey, value, onChange }) {
  if (Array.isArray(value)) {
    return <ArrayField value={value} onChange={onChange} />
  }
  if (typeof value === 'boolean' || BOOLEAN_KEYS.has(fieldKey)) {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', padding: '2px 0' }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: '#378ADD', width: '15px', height: '15px' }} />
        Enabled
      </label>
    )
  }
  if (SELECT_OPTIONS[fieldKey]) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(NUMERIC_KEYS.has(fieldKey) ? Number(e.target.value) : e.target.value)}
        style={s.select}
      >
        {SELECT_OPTIONS[fieldKey].map((opt) => (
          <option key={opt} value={opt}>{String(opt)}</option>
        ))}
      </select>
    )
  }
  if (COLOR_KEYS.has(fieldKey)) {
    return <ColorField value={value} onChange={onChange} />
  }
  if (TEXTAREA_KEYS.has(fieldKey)) {
    return (
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={s.textarea}
      />
    )
  }
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={s.input}
    />
  )
}

/* Drag-and-drop image uploader backed by Supabase Storage ('site-images'
   bucket). Validates type/size, uploads under `${siteId}/<ts>-<name>`, then
   hands the public URL back via onChange. */
function ImageUploader({ value, siteId, onChange }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState(null)

  async function handleFile(file) {
    setError(null)
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Unsupported file type. Use PNG, JPG, WEBP or GIF.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('File is too large. Maximum size is 5MB.')
      return
    }
    setUploading(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${siteId || 'unassigned'}/${Date.now()}-${safeName}`
      const { data, error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('site-images').getPublicUrl(data.path)
      onChange(pub.publicUrl)
    } catch (err) {
      console.error('Image upload failed:', err)
      setError(err?.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }}
      />

      {value ? (
        <>
          <div style={s.uploadPreview}>
            <img src={value} alt="Preview" style={s.uploadThumb} />
            {uploading && (
              <div style={s.uploadOverlay}>
                <Spinner />
                <span>Uploading…</span>
              </div>
            )}
          </div>
          <div style={s.uploadBtnRow}>
            <button type="button" style={s.uploadBtn} disabled={uploading} onClick={() => inputRef.current?.click()}>
              Replace
            </button>
            <button type="button" style={s.uploadBtn} disabled={uploading} onClick={() => { setError(null); onChange('') }}>
              Remove
            </button>
          </div>
        </>
      ) : (
        <div
          style={s.uploadZone(dragOver)}
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <>
              <Spinner />
              <span>Uploading…</span>
            </>
          ) : (
            <>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Drop image here or click to upload</span>
              <span style={s.uploadHint}>PNG, JPG, WEBP, GIF · up to 5MB</span>
            </>
          )}
        </div>
      )}

      {error && <div style={s.uploadError}>{error}</div>}
    </div>
  )
}

/* Content + style controls specific to the Image block. */
function ImageFields({ block, siteId, onChangeProp }) {
  const p = block.props
  return (
    <>
      <div style={s.groupTitle}>Image</div>

      <div style={s.field}>
        <ImageUploader value={p.src} siteId={siteId} onChange={(url) => onChangeProp('src', url)} />
      </div>

      <div style={s.field}>
        <label style={s.fieldLabel}>or paste image URL</label>
        <input
          type="text"
          value={p.src ?? ''}
          placeholder="https://…"
          onChange={(e) => onChangeProp('src', e.target.value)}
          style={s.input}
        />
      </div>

      <div style={s.field}>
        <label style={s.fieldLabel}>Alt text</label>
        <input
          type="text"
          value={p.alt ?? ''}
          onChange={(e) => onChangeProp('alt', e.target.value)}
          style={s.input}
        />
      </div>

      <div style={s.groupTitle}>Image style</div>

      <div style={s.field}>
        <label style={s.fieldLabel}>Width</label>
        <select value={p.width || 'full'} onChange={(e) => onChangeProp('width', e.target.value)} style={s.select}>
          {IMAGE_WIDTH_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{humanize(opt)}</option>
          ))}
        </select>
      </div>

      <div style={s.field}>
        <label style={s.fieldLabel}>Object fit</label>
        <select value={p.objectFit || 'cover'} onChange={(e) => onChangeProp('objectFit', e.target.value)} style={s.select}>
          {OBJECT_FIT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{humanize(opt)}</option>
          ))}
        </select>
      </div>

      <div style={s.field}>
        <label style={s.fieldLabel}>Border radius</label>
        <div style={s.sliderRow}>
          <input
            type="range"
            min="0"
            max="40"
            value={p.borderRadius ?? 8}
            onChange={(e) => onChangeProp('borderRadius', Number(e.target.value))}
            style={{ flex: 1, accentColor: '#378ADD' }}
          />
          <span style={s.sliderVal}>{p.borderRadius ?? 8}px</span>
        </div>
      </div>

      <div style={s.field}>
        <label style={s.fieldLabel}>Height</label>
        <div style={s.sliderRow}>
          <input
            type="range"
            min="0"
            max="600"
            step="10"
            value={p.height ?? 0}
            onChange={(e) => onChangeProp('height', Number(e.target.value))}
            style={{ flex: 1, accentColor: '#378ADD' }}
          />
          <span style={s.sliderVal}>{p.height ? `${p.height}px` : 'Auto'}</span>
        </div>
      </div>
    </>
  )
}

/* The right-hand editing form for the selected block */
/* One labelled field row */
function Field({ label, children }) {
  return (
    <div style={s.field}>
      {label && <label style={s.fieldLabel}>{label}</label>}
      {children}
    </div>
  )
}

/* A link in a Navbar / Footer. May be a legacy plain string (text only) or an
   object { label, type:'page'|'url', pageId, url }. The editor normalises to the
   object form for editing and serialises back to a string when "no link". */
function normalizeNavLink(link) {
  if (typeof link === 'string') return { label: link, type: 'none', pageId: '', url: '' }
  return {
    label: link?.label || '',
    type: link?.type === 'page' || link?.type === 'url' ? link.type : 'none',
    pageId: link?.pageId || '',
    url: link?.url || '',
  }
}
function serializeNavLink(obj) {
  if (obj.type === 'page') return { label: obj.label, type: 'page', pageId: obj.pageId }
  if (obj.type === 'url') return { label: obj.label, type: 'url', url: obj.url }
  return obj.label // "no link" → plain string (keeps data backward-compatible)
}

/* Per-link editor for Navbar / Footer links: a label, a destination dropdown
   (a page of this site, an external URL, or no link), and a URL field when
   "External URL" is chosen. */
function NavLinksField({ links, pages, onChange }) {
  const items = Array.isArray(links) ? links : []

  function update(idx, nextObj) {
    const copy = items.slice()
    copy[idx] = serializeNavLink(nextObj)
    onChange(copy)
  }
  function remove(idx) { onChange(items.filter((_, i) => i !== idx)) }
  function add() { onChange([...items, 'Link']) }

  function onDestChange(idx, obj, value) {
    if (value === 'none') update(idx, { ...obj, type: 'none' })
    else if (value === 'url') update(idx, { ...obj, type: 'url' })
    else if (value.startsWith('page:')) update(idx, { ...obj, type: 'page', pageId: value.slice(5) })
  }

  return (
    <div>
      {items.map((raw, idx) => {
        const link = normalizeNavLink(raw)
        const destValue = link.type === 'page' ? `page:${link.pageId}` : link.type === 'url' ? 'url' : 'none'
        return (
          <div key={idx} style={s.arrayItem}>
            <div style={s.arrayItemBody}>
              <input
                type="text"
                value={link.label}
                placeholder="Link text"
                onChange={(e) => update(idx, { ...link, label: e.target.value })}
                style={s.input}
              />
              <select
                value={destValue}
                onChange={(e) => onDestChange(idx, link, e.target.value)}
                style={s.select}
              >
                <option value="none">No link (text only)</option>
                {pages.length > 0 && (
                  <optgroup label="Pages">
                    {pages.map((p) => (
                      <option key={p.id} value={`page:${p.id}`}>
                        {p.name}{p.is_home ? ' (home)' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="url">External URL…</option>
              </select>
              {link.type === 'url' && (
                <input
                  type="text"
                  value={link.url}
                  placeholder="https://example.com"
                  onChange={(e) => update(idx, { ...link, url: e.target.value })}
                  style={s.input}
                />
              )}
              {link.type === 'page' && !pages.some((p) => p.id === link.pageId) && (
                <div style={{ ...s.hint, color: '#f59e0b' }}>Linked page was removed — pick another.</div>
              )}
            </div>
            <button type="button" title="Remove" style={s.removeBtn} onClick={() => remove(idx)}>×</button>
          </div>
        )
      })}
      <button type="button" style={s.addBtn} onClick={add}>+ Add link</button>
    </div>
  )
}

function PropertiesPanel({ block, siteId, pages = [], onChangeProp, onChangeStyle, onChangeStyleMulti, onDelete }) {
  const isNavLinks = (block.type === 'navbar' || block.type === 'footer')
  const def = BLOCK_DEFINITIONS[block.type]
  const isImage = block.type === 'image'
  const st = normalizeStyle(block.props.style)
  const set = onChangeStyle               // single key
  const setM = onChangeStyleMulti          // patch object
  const resetSection = (name) => setM(SECTION_DEFAULTS[name])

  // Bucket the block's own (non-style) props for the CONTENT section.
  const content = []
  const colorProps = []
  const settingsProps = []
  if (!isImage) {
    for (const [key, val] of Object.entries(block.props)) {
      if (key === 'style') continue
      if (COLOR_KEYS.has(key)) colorProps.push([key, val])
      else if (SELECT_OPTIONS[key]) settingsProps.push([key, val])
      else content.push([key, val])
    }
  }

  return (
    <div style={s.rightScroll}>
      <div style={s.blockName}>{def?.label ?? block.type}</div>

      {/* ── CONTENT ── */}
      <Section id="content" title="Content">
        {isImage && <ImageFields block={block} siteId={siteId} onChangeProp={onChangeProp} />}
        {content.map(([key, val]) => (
          <Field key={key} label={humanize(key)}>
            {isNavLinks && key === 'links' ? (
              <NavLinksField links={val} pages={pages} onChange={(v) => onChangeProp(key, v)} />
            ) : (
              <PropField fieldKey={key} value={val} onChange={(v) => onChangeProp(key, v)} />
            )}
          </Field>
        ))}
        {colorProps.map(([key, val]) => (
          <Field key={key} label={humanize(key)}>
            <PropField fieldKey={key} value={val} onChange={(v) => onChangeProp(key, v)} />
          </Field>
        ))}
        {settingsProps.map(([key, val]) => (
          <Field key={key} label={humanize(key)}>
            <PropField fieldKey={key} value={val} onChange={(v) => onChangeProp(key, v)} />
          </Field>
        ))}
        {!isImage && content.length === 0 && colorProps.length === 0 && settingsProps.length === 0 && (
          <div style={s.hint}>This component has no content fields.</div>
        )}
      </Section>

      {/* ── TYPOGRAPHY ── */}
      <Section id="typography" title="Typography" onReset={() => resetSection('typography')}>
        <Field label="Font family">
          <StyleSelect value={st.fontFamily} options={FONT_OPTIONS} onChange={(v) => set('fontFamily', v)} />
        </Field>
        <Field label="Font size">
          <Slider value={st.fontSize} min={0} max={72}
            format={(v) => (v ? `${v}px` : 'Auto')} onChange={(v) => set('fontSize', v)} />
        </Field>
        <Field label="Font weight">
          <StyleSelect value={st.fontWeight} options={FONT_WEIGHTS} onChange={(v) => set('fontWeight', v)} />
        </Field>
        <Field label="Line height">
          <Slider value={st.lineHeight} min={0} max={3} step={0.1}
            format={(v) => (v ? v.toFixed(1) : 'Auto')} onChange={(v) => set('lineHeight', v)} />
        </Field>
        <Field label="Letter spacing">
          <Slider value={st.letterSpacing} min={-2} max={10} step={0.5}
            format={(v) => `${v}px`} onChange={(v) => set('letterSpacing', v)} />
        </Field>
        <Field label="Text color">
          <ColorField value={st.textColor} onChange={(v) => set('textColor', v)} />
        </Field>
      </Section>

      {/* ── SPACING ── */}
      <Section id="spacing" title="Spacing" onReset={() => resetSection('spacing')}>
        <Field label="Padding">
          <BoxField prefix="padding" st={st} onChange={setM} />
        </Field>
        <Field label="Margin">
          <BoxField prefix="margin" st={st} onChange={setM} />
        </Field>
        <Field label="Gap (grid / flex)">
          <Slider value={st.gap} min={0} max={64} onChange={(v) => set('gap', v)} />
        </Field>
      </Section>

      {/* ── BACKGROUND & BORDER ── */}
      <Section id="background" title="Background & Border" onReset={() => resetSection('background')}>
        <Field label="Background type">
          <StyleSelect value={st.bgType} options={['solid', 'gradient']} onChange={(v) => set('bgType', v)} />
        </Field>
        {st.bgType === 'gradient' ? (
          <>
            <div style={s.swatchRow}>
              <Field label="From">
                <ColorField value={st.gradientFrom} onChange={(v) => set('gradientFrom', v)} />
              </Field>
              <Field label="To">
                <ColorField value={st.gradientTo} onChange={(v) => set('gradientTo', v)} />
              </Field>
            </div>
            <Field label="Direction">
              <StyleSelect
                value={st.gradientDir}
                options={GRADIENT_DIRECTIONS}
                labels={{ '90deg': '→ Right', '135deg': '↘ Diagonal', '180deg': '↓ Down', '45deg': '↗ Up' }}
                onChange={(v) => set('gradientDir', v)}
              />
            </Field>
          </>
        ) : (
          <Field label="Background color">
            <ColorField value={st.background} onChange={(v) => set('background', v)} />
          </Field>
        )}

        <Field label="Border width">
          <Slider value={st.borderWidth} min={0} max={12} onChange={(v) => set('borderWidth', v)} />
        </Field>
        {st.borderWidth > 0 && (
          <>
            <Field label="Border color">
              <ColorField value={st.borderColor} onChange={(v) => set('borderColor', v)} />
            </Field>
            <Field label="Border style">
              <StyleSelect value={st.borderStyle} options={BORDER_STYLES} onChange={(v) => set('borderStyle', v)} />
            </Field>
          </>
        )}

        <Field label="Border radius">
          {st.radiusLinked ? (
            <Slider value={st.borderRadius} min={0} max={50} onChange={(v) => set('borderRadius', v)} />
          ) : (
            <div style={s.boxRow}>
              <div style={s.boxGrid}>
                {['TL', 'TR', 'BR', 'BL'].map((c) => (
                  <div key={c} style={s.boxCell}>
                    <input
                      type="number"
                      value={st[`radius${c}`] ?? 0}
                      onChange={(e) => set(`radius${c}`, parseInt(e.target.value, 10) || 0)}
                      style={s.boxInput}
                    />
                    <span style={s.boxCellLabel}>{c}</span>
                  </div>
                ))}
              </div>
              <span style={{ width: '32px' }} />
            </div>
          )}
          <label style={{ ...s.hint, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!st.radiusLinked}
              onChange={(e) => set('radiusLinked', !e.target.checked)}
              style={{ accentColor: '#378ADD' }}
            />
            Per-corner radius
          </label>
        </Field>

        <Field label="Box shadow">
          <StyleSelect value={st.boxShadow} options={SHADOW_OPTIONS} onChange={(v) => set('boxShadow', v)} />
        </Field>
        {st.boxShadow === 'custom' && (
          <Field label="Custom shadow (CSS)">
            <input
              type="text"
              value={st.boxShadowCustom}
              placeholder="0 8px 30px rgba(0,0,0,0.2)"
              onChange={(e) => set('boxShadowCustom', e.target.value)}
              style={s.input}
            />
          </Field>
        )}
      </Section>

      {/* ── EFFECTS ── */}
      <Section id="effects" title="Effects" onReset={() => resetSection('effects')}>
        <Field label="Opacity">
          <Slider value={st.opacity} min={0} max={100} suffix="%" onChange={(v) => set('opacity', v)} />
        </Field>
        <Field label="Hover effect">
          <StyleSelect value={st.hoverEffect} options={HOVER_OPTIONS} onChange={(v) => set('hoverEffect', v)} />
        </Field>
        <Field label="Entrance animation">
          <StyleSelect value={st.entrance} options={ENTRANCE_OPTIONS} onChange={(v) => set('entrance', v)} />
          <div style={s.hint}>Plays in Preview as the block scrolls into view.</div>
        </Field>
        <Field label="Transition duration">
          <Slider value={st.transitionDuration} min={0} max={1000} step={50} suffix="ms"
            onChange={(v) => set('transitionDuration', v)} />
        </Field>
      </Section>

      {/* ── LAYOUT ── */}
      <Section id="layout" title="Layout" onReset={() => resetSection('layout')}>
        <Field label="Width">
          <StyleSelect value={st.width} options={WIDTH_OPTIONS} onChange={(v) => set('width', v)} />
        </Field>
        {st.width === 'custom' && (
          <Field label="Width (px)">
            <Slider value={st.widthPx} min={100} max={1400} step={10} onChange={(v) => set('widthPx', v)} />
          </Field>
        )}
        <Field label="Max width">
          <Slider value={st.maxWidth} min={0} max={1400} step={10}
            format={(v) => (v ? `${v}px` : 'None')} onChange={(v) => set('maxWidth', v)} />
        </Field>
        <Field label="Alignment">
          <div style={s.alignRow}>
            {ALIGNMENTS.map((a) => (
              <button
                key={a}
                type="button"
                title={a}
                style={s.alignBtn((st.align || 'left') === a)}
                onClick={() => set('align', a)}
              >
                <AlignIcon dir={a} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Display">
          <StyleSelect value={st.display} options={DISPLAY_OPTIONS} onChange={(v) => set('display', v)} />
        </Field>
      </Section>

      <button type="button" style={s.deleteBlockBtn} onClick={() => onDelete(block.id)}>
        Delete block
      </button>
    </div>
  )
}

function AlignIcon({ dir }) {
  // shorter lines pushed to the active edge to suggest alignment
  const lines = dir === 'left'
    ? [['3', '21'], ['3', '15'], ['3', '21'], ['3', '15']]
    : dir === 'center'
      ? [['5', '19'], ['8', '16'], ['5', '19'], ['8', '16']]
      : [['3', '21'], ['9', '21'], ['3', '21'], ['9', '21']]
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {lines.map(([x1, x2], i) => (
        <line key={i} x1={x1} y1={6 + i * 4} x2={x2} y2={6 + i * 4} />
      ))}
    </svg>
  )
}

export default function Editor() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const siteId = searchParams.get('id')
  // True while we flush a pending save on the way back to the dashboard.
  const [leaving, setLeaving] = useState(false)
  const [activeTab, setActiveTab] = useState('components')
  const [viewport, setViewport] = useState('desktop')
  const [previewMode, setPreviewMode] = useState(false)
  const [blocks, setBlocks] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [activeDrag, setActiveDrag] = useState(null)
  // Code drawer: collapsed by default; 'jsx' | 'html' tab.
  const [codeOpen, setCodeOpen] = useState(false)
  const [codeFormat, setCodeFormat] = useState('jsx')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!siteId)
  // 'idle' | 'saving' | 'saved' | 'error' — drives the Save button label
  const [saveState, setSaveState] = useState('idle')
  const [dirty, setDirty] = useState(false)

  // Deploy / publish flow.
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState(null)
  const [publishResult, setPublishResult] = useState(null) // { slug, url }

  // First-run onboarding: a one-time, dismissible 3-step hint overlay shown
  // the first time anyone opens the editor on this browser (localStorage flag).
  const [showFirstRunHints, setShowFirstRunHints] = useState(() => {
    try { return localStorage.getItem('tribox_editor_hints_seen') !== '1' } catch { return false }
  })
  function dismissFirstRunHints() {
    setShowFirstRunHints(false)
    try { localStorage.setItem('tribox_editor_hints_seen', '1') } catch { /* ignore */ }
  }

  // Undo/redo history. `past`/`future` hold snapshots of the blocks array.
  // These always reflect the ACTIVE page; switching pages saves the outgoing
  // page's history into pageStatesRef and restores the incoming page's.
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])

  // ── Multi-page state ───────────────────────────────────────────
  // `pages` is the ordered page metadata for the tab bar; the live blocks +
  // undo/redo for each page live in pageStatesRef (keyed by page id) so each
  // page keeps its own history and editing one page never touches another.
  const [pages, setPages] = useState([])           // [{ id, name, page_slug, sort_order, is_home }]
  const [activePageId, setActivePageId] = useState(null)
  const pageStatesRef = useRef({})                 // { [pageId]: { blocks, past, future, dirty } }
  const activePageIdRef = useRef(null); activePageIdRef.current = activePageId

  // Refs that mirror live values for use inside timers / async closures.
  const blocksRef = useRef(blocks); blocksRef.current = blocks
  const prevBlocksRef = useRef(blocks)   // last blocks seen by the dirty effect
  const skipDirty = useRef(false)        // next blocks change is a load (don't mark dirty)
  const autosaveTimer = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  useEffect(() => {
    if (!siteId) { setLoading(false); return }
    fetchPages()
  }, [siteId])

  // Mark dirty + queue autosave whenever `blocks` changes. This effect does NOT
  // touch the undo/redo stacks — history is recorded only by commitBlocks() at
  // the moment of a user edit, so undo/redo can never wipe the future stack.
  // Every change produces a new array reference, so a ref match means "no real
  // change" (e.g. a StrictMode double-invoke) and is ignored. A page load sets
  // skipDirty so the freshly fetched content isn't flagged as unsaved.
  useEffect(() => {
    if (blocks === prevBlocksRef.current) return
    prevBlocksRef.current = blocks
    if (skipDirty.current) {           // load: not a user edit
      skipDirty.current = false
      return
    }
    setDirty(true)
    scheduleAutosave()
  }, [blocks])

  // Clean up a pending autosave on unmount.
  useEffect(() => () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
  }, [])

  // Load all pages (with their blocks) and hydrate the per-page state map, then
  // open the home page. Falls back gracefully so the canvas still renders.
  async function fetchPages() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch(`/api/sites/${siteId}/pages`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data.pages) ? data.pages : []
        const states = {}
        for (const p of list) {
          states[p.id] = {
            blocks: Array.isArray(p.blocks) ? p.blocks : [],
            past: [], future: [], dirty: false,
          }
        }
        pageStatesRef.current = states
        const meta = list.map(({ id, name, page_slug, sort_order, is_home }) =>
          ({ id, name, page_slug, sort_order, is_home }))
        setPages(meta)

        const home = list.find((p) => p.is_home) || list[0]
        if (home) {
          setActivePageId(home.id)
          skipDirty.current = true       // loading isn't a user edit
          setBlocks(states[home.id].blocks)
          setPast([])
          setFuture([])
          setDirty(false)
        }
      } else {
        console.warn('GET pages failed:', res.status, await res.text())
      }
    } catch (err) {
      console.error('GET pages error:', err)
      // silent — will show empty canvas
    } finally {
      setLoading(false)
    }
  }

  function scheduleAutosave() {
    if (!siteId) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => { saveActivePage({ silent: true }) }, 2000)
  }

  // Persist a specific page's blocks via PATCH /pages/:pageId. Used for both the
  // active page (autosave / Save button) and outgoing pages on tab switch, so it
  // takes an explicit pageId + blocks rather than reading live state.
  async function savePage(pageId, blocks, { silent = false } = {}) {
    if (!siteId || !pageId) return
    const st = pageStatesRef.current[pageId]
    setSaving(true)
    if (!silent) setSaveState('saving')
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch(`/api/sites/${siteId}/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ blocks }),
      })
      if (!res.ok) {
        console.error('PATCH page blocks failed:', res.status, await res.text())
        setSaveState('error')
        return
      }
      if (st) { st.blocks = blocks; st.dirty = false }
      // Only clear the active "dirty" flag if this was the active page and
      // nothing changed while the request was in flight.
      if (pageId === activePageIdRef.current && blocksRef.current === blocks) setDirty(false)
      if (!silent) {
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      }
    } catch (err) {
      console.error('PATCH page blocks error:', err)
      setSaveState('error')
    } finally {
      setSaving(false)
    }
  }

  function saveActivePage({ silent = false } = {}) {
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null }
    return savePage(activePageIdRef.current, blocksRef.current, { silent })
  }

  // Save every page that has unsaved edits (used before leaving / publishing).
  async function flushAllDirty() {
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null }
    // Sync the active page's live blocks into the map first.
    const activeId = activePageIdRef.current
    if (activeId && pageStatesRef.current[activeId]) {
      pageStatesRef.current[activeId].blocks = blocksRef.current
      if (dirty) pageStatesRef.current[activeId].dirty = true
    }
    const entries = Object.entries(pageStatesRef.current)
    for (const [pageId, st] of entries) {
      if (st.dirty || pageId === activeId) {
        try { await savePage(pageId, st.blocks, { silent: true }) } catch { /* keep going */ }
      }
    }
  }

  // Switch which page is being edited. Stashes the outgoing page's live blocks +
  // history into the map (and silently persists them), then hydrates the
  // incoming page's blocks + history.
  function switchPage(targetId) {
    if (!targetId || targetId === activePageIdRef.current) return
    const outId = activePageIdRef.current
    const outBlocks = blocksRef.current
    if (outId && pageStatesRef.current[outId]) {
      const outState = pageStatesRef.current[outId]
      outState.blocks = outBlocks
      outState.past = past
      outState.future = future
      outState.dirty = dirty
      if (dirty) savePage(outId, outBlocks, { silent: true })
    }
    const next = pageStatesRef.current[targetId]
    if (!next) return
    setActivePageId(targetId)
    setSelectedId(null)
    skipDirty.current = true
    setBlocks(next.blocks)
    setPast(next.past || [])
    setFuture(next.future || [])
    setDirty(!!next.dirty)
  }

  // Return to the dashboard. Pages auto-save, so we don't prompt — but flush any
  // pending edits first (showing a brief "Saving…") so nothing is lost.
  async function handleBack() {
    if (siteId && (dirty || saving || autosaveTimer.current)) {
      setLeaving(true)
      try {
        await flushAllDirty()
      } catch {
        // Navigate anyway — the dashboard is more useful than a stuck editor.
      }
    }
    navigate('/dashboard')
  }

  // ── Undo / redo ────────────────────────────────────────────────
  // These move snapshots between the past/future stacks and update blocks
  // directly. They deliberately bypass commitBlocks (the only place history is
  // recorded), so an undo/redo never pushes a new history entry or clears the
  // future stack. The dirty/autosave effect still runs off the blocks change.
  function undo() {
    if (past.length === 0) return
    const previous = past[past.length - 1]
    setPast(past.slice(0, -1))
    setFuture((f) => [blocksRef.current, ...f])
    setBlocks(previous)
  }

  function redo() {
    if (future.length === 0) return
    const next = future[0]
    setFuture(future.slice(1))
    setPast((p) => [...p, blocksRef.current])
    setBlocks(next)
  }

  // Keep latest undo/redo reachable from the (stable) keyboard listener.
  const undoRef = useRef(undo); undoRef.current = undo
  const redoRef = useRef(redo); redoRef.current = redo

  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redoRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Apply a user edit to the blocks: snapshot the current blocks onto the past
  // stack, clear the redo (future) stack, then update. This is the single place
  // history is recorded; undo/redo intentionally do NOT go through here. A
  // no-op edit (same reference back) records nothing. `next` may be a value or
  // an updater function, mirroring setState. blocksRef.current is the live
  // blocks (refreshed every render), so it is a reliable "previous".
  function commitBlocks(next) {
    const prev = blocksRef.current
    const value = typeof next === 'function' ? next(prev) : next
    if (value === prev) return
    setPast((p) => [...p, prev])
    setFuture([])
    setBlocks(value)
  }

  // Reorder blocks (driven by the Layers panel drag).
  function reorderBlocks(oldIdx, newIdx) {
    commitBlocks((prev) => arrayMove(prev, oldIdx, newIdx))
  }

  // Toggle a block's visibility (eye icon in the Layers panel).
  function toggleHidden(id) {
    commitBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, hidden: !b.hidden } : b)))
  }

  function makeBlock(type) {
    return { id: crypto.randomUUID(), type, props: cloneProps(BLOCK_DEFINITIONS[type].defaultProps) }
  }

  function handleDragStart(event) {
    setActiveDrag(event.active.data.current?.isPalette ? event.active.data.current.type : null)
  }

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveDrag(null)
    if (!over) return

    // Case 1: a new component was dropped from the palette
    if (active.data.current?.isPalette) {
      const type = active.data.current.type
      if (!type || !BLOCK_DEFINITIONS[type]) return
      const block = makeBlock(type)
      commitBlocks(prev => {
        if (over.id === 'canvas') return [...prev, block]
        const idx = prev.findIndex(b => b.id === over.id)
        if (idx === -1) return [...prev, block]
        const next = [...prev]
        next.splice(idx, 0, block)
        return next
      })
      setSelectedId(block.id)
      return
    }

    // Case 2: an existing block was reordered
    if (active.id !== over.id) {
      commitBlocks(prev => {
        const oldIdx = prev.findIndex(b => b.id === active.id)
        const newIdx = prev.findIndex(b => b.id === over.id)
        if (oldIdx === -1 || newIdx === -1) return prev
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  function duplicateBlock(id) {
    commitBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id)
      if (idx === -1) return prev
      const copy = { id: crypto.randomUUID(), type: prev[idx].type, props: cloneProps(prev[idx].props) }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  function deleteBlock(id) {
    commitBlocks(prev => prev.filter(b => b.id !== id))
    setSelectedId(cur => (cur === id ? null : cur))
  }

  // Real-time prop edit: update one prop of one block; canvas re-renders instantly.
  function updateBlockProp(id, key, value) {
    commitBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, props: { ...b.props, [key]: value } } : b
    ))
  }

  // Universal style controls stored in props.style.
  function updateBlockStyle(id, key, value) {
    commitBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, props: { ...b.props, style: { ...b.props.style, [key]: value } } } : b
    ))
  }

  // Apply several style keys at once (4-sided box edits, section resets).
  function updateBlockStyleMulti(id, patch) {
    commitBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, props: { ...b.props, style: { ...b.props.style, ...patch } } } : b
    ))
  }

  // ── Deploy / publish ───────────────────────────────────────────
  async function handleDeploy() {
    if (!siteId || deploying) return
    setDeploying(true)
    setDeployError(null)
    // Persist the latest edits across ALL pages first so every published page
    // matches the canvas.
    try { await flushAllDirty() } catch { /* publish anyway */ }
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch(`/api/sites/${siteId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Publish failed (${res.status})`)
      }
      const data = await res.json()        // { slug, url }
      setPublishResult(data)
    } catch (err) {
      console.error('Deploy error:', err)
      setDeployError(err.message || 'Deploy failed. Please try again.')
    } finally {
      setDeploying(false)
    }
  }

  // ── Page management ────────────────────────────────────────────
  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }

  // Create a new page; the server derives a unique URL slug from the name (or an
  // explicit slug). Switches to the new page on success.
  async function addPage(name, slugInput) {
    const headers = await authHeaders()
    const res = await fetch(`/api/sites/${siteId}/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, page_slug: slugInput || '' }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Could not add page (${res.status})`)
    }
    const { page } = await res.json()
    pageStatesRef.current[page.id] = {
      blocks: Array.isArray(page.blocks) ? page.blocks : [],
      past: [], future: [], dirty: false,
    }
    setPages((prev) => [...prev, {
      id: page.id, name: page.name, page_slug: page.page_slug,
      sort_order: page.sort_order, is_home: page.is_home,
    }])
    switchPage(page.id)
    return page
  }

  async function renamePage(pageId, name) {
    const headers = await authHeaders()
    const res = await fetch(`/api/sites/${siteId}/pages/${pageId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Could not rename page (${res.status})`)
    }
    const { page } = await res.json()
    setPages((prev) => prev.map((p) => (p.id === pageId
      ? { ...p, name: page.name, page_slug: page.page_slug } : p)))
  }

  // Promote a page to home. The server demotes the old home (and re-slugs it),
  // so refresh metadata from the response set.
  async function setHomePage(pageId) {
    // Persist edits first so re-slugging the old home doesn't drop unsaved work.
    await flushAllDirty()
    const headers = await authHeaders()
    const res = await fetch(`/api/sites/${siteId}/pages/${pageId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ is_home: true }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Could not set home page (${res.status})`)
    }
    // Re-read metadata so the demoted home's new slug + flags are accurate.
    const listRes = await fetch(`/api/sites/${siteId}/pages`, { headers })
    if (listRes.ok) {
      const data = await listRes.json()
      const list = Array.isArray(data.pages) ? data.pages : []
      setPages(list.map(({ id, name, page_slug, sort_order, is_home }) =>
        ({ id, name, page_slug, sort_order, is_home })))
    }
  }

  async function deletePage(pageId) {
    const headers = await authHeaders()
    const res = await fetch(`/api/sites/${siteId}/pages/${pageId}`, { method: 'DELETE', headers })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Could not delete page (${res.status})`)
    }
    delete pageStatesRef.current[pageId]
    let nextPages = []
    setPages((prev) => { nextPages = prev.filter((p) => p.id !== pageId); return nextPages })
    if (activePageIdRef.current === pageId) {
      const fallback = nextPages.find((p) => p.is_home) || nextPages[0]
      if (fallback) {
        // The active page is gone, so hydrate the fallback directly (switchPage
        // would try to stash the now-deleted page).
        const st = pageStatesRef.current[fallback.id]
        setActivePageId(fallback.id)
        setSelectedId(null)
        skipDirty.current = true
        setBlocks(st?.blocks || [])
        setPast(st?.past || [])
        setFuture(st?.future || [])
        setDirty(!!st?.dirty)
      }
    }
  }

  // Move a page one slot left/right and persist the new sort_order for the two
  // swapped pages.
  async function movePage(pageId, dir) {
    const ordered = [...pages].sort((a, b) => a.sort_order - b.sort_order)
    const idx = ordered.findIndex((p) => p.id === pageId)
    const swapIdx = idx + dir
    if (idx === -1 || swapIdx < 0 || swapIdx >= ordered.length) return
    const a = ordered[idx], b = ordered[swapIdx]
    const aOrder = a.sort_order, bOrder = b.sort_order
    setPages((prev) => prev.map((p) => {
      if (p.id === a.id) return { ...p, sort_order: bOrder }
      if (p.id === b.id) return { ...p, sort_order: aOrder }
      return p
    }))
    try {
      const headers = await authHeaders()
      await Promise.all([
        fetch(`/api/sites/${siteId}/pages/${a.id}`, { method: 'PATCH', headers, body: JSON.stringify({ sort_order: bOrder }) }),
        fetch(`/api/sites/${siteId}/pages/${b.id}`, { method: 'PATCH', headers, body: JSON.stringify({ sort_order: aOrder }) }),
      ])
    } catch (err) {
      console.error('Reorder pages error:', err)
    }
  }

  const orderedPages = [...pages].sort((a, b) => a.sort_order - b.sort_order)
  const selectedBlock = blocks.find(b => b.id === selectedId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={s.root}>

        {/* Native <select> popups can't be styled via React inline styles, so a
            real CSS rule keeps both the control and its options readable
            (otherwise the open menu renders white-on-white). */}
        <style>{`
          .trinode-props select { background: #161618; color: #fafafa; }
          .trinode-props select option { background: #161618; color: #fafafa; }
          .trinode-props input[type=number]::-webkit-outer-spin-button,
          .trinode-props input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

          /* Universal block-wrapper hover effects (apply on :hover only). */
          .tn-block { transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease; }
          .tn-hover-lift:hover  { transform: translateY(-5px); box-shadow: 0 16px 40px rgba(0,0,0,0.18); }
          .tn-hover-scale:hover { transform: scale(1.025); }
          .tn-hover-glow:hover  { box-shadow: 0 0 0 3px rgba(55,138,221,0.35), 0 10px 36px rgba(55,138,221,0.4); }

          /* Entrance animation keyframes (triggered in preview via IntersectionObserver). */
          @keyframes tnFade    { from { opacity: 0; } to { opacity: 1; } }
          @keyframes tnSlideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes tnSlideIn { from { opacity: 0; transform: translateX(-48px); } to { opacity: 1; transform: translateX(0); } }
          @keyframes tnZoom    { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        `}</style>

        {/* ── LEFT PANEL ── */}
        <aside style={s.left}>
          <div style={s.leftTop}>
            <div style={s.panelTitle}>Components</div>
            <div style={s.tabBar}>
              <button style={s.tab(activeTab === 'components')} onClick={() => setActiveTab('components')}>
                Components
              </button>
              <button style={s.tab(activeTab === 'layers')} onClick={() => setActiveTab('layers')}>
                Layers
              </button>
            </div>
          </div>

          <div style={s.leftScroll}>
            {activeTab === 'components' ? (
              COMPONENT_CATEGORIES.map(cat => (
                <div key={cat.name}>
                  <div style={s.catLabel}>{cat.name}</div>
                  {cat.items.map(item => (
                    <PaletteItem key={item} label={item} />
                  ))}
                </div>
              ))
            ) : (
              <LayersPanel
                blocks={blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggleHidden={toggleHidden}
                onReorder={reorderBlocks}
              />
            )}
          </div>
        </aside>

        {/* ── CENTER PANEL ── */}
        <main style={s.center}>
          {/* Toolbar */}
          <div style={s.toolbar}>
            {/* Left: back to dashboard + viewport toggles */}
            <div style={s.toolGroup}>
              <button
                style={s.backBtn}
                onClick={handleBack}
                disabled={leaving}
                title="Back to dashboard"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span style={s.backLogo}>tribox</span>
              </button>
              {leaving && <span style={s.leavingHint}>Saving…</span>}
              <div style={s.divider} />
              {[
                { key: 'desktop', Icon: DesktopIcon, label: 'Desktop' },
                { key: 'tablet',  Icon: TabletIcon,  label: 'Tablet' },
                { key: 'mobile',  Icon: MobileIcon,  label: 'Mobile' },
              ].map(({ key, Icon, label }) => (
                <button
                  key={key}
                  title={label}
                  style={s.vpBtn(viewport === key)}
                  onClick={() => setViewport(key)}
                >
                  <Icon />
                </button>
              ))}
            </div>

            {/* Center: undo/redo */}
            <div style={s.toolGroup}>
              <button
                style={{ ...s.iconBtn, ...(past.length === 0 ? s.iconBtnDisabled : null) }}
                title="Undo (Ctrl/Cmd+Z)"
                onClick={undo}
                disabled={past.length === 0}
              ><UndoIcon /></button>
              <button
                style={{ ...s.iconBtn, ...(future.length === 0 ? s.iconBtnDisabled : null) }}
                title="Redo (Ctrl/Cmd+Shift+Z)"
                onClick={redo}
                disabled={future.length === 0}
              ><RedoIcon /></button>
            </div>

            {/* Right: actions */}
            <div style={s.toolGroup}>
              {siteId && (
                <span style={s.saveStatus(dirty)}>
                  <span style={s.saveStatusDot(dirty)} />
                  {saveState === 'error'
                    ? 'Save failed'
                    : dirty ? 'Unsaved changes' : 'All changes saved'}
                </span>
              )}
              <button style={s.saveBtn} onClick={() => saveActivePage()} disabled={saving}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
              </button>
              <button
                style={{
                  ...s.previewBtn,
                  ...(previewMode ? { background: 'rgba(55,138,221,0.16)', borderColor: 'rgba(55,138,221,0.5)', color: '#7ab6f0' } : null),
                }}
                onClick={() => { setPreviewMode((p) => !p); setSelectedId(null) }}
                title="Toggle preview (plays entrance animations)"
              >
                {previewMode ? 'Exit preview' : 'Preview'}
              </button>
              <button
                style={s.codeBtn(codeOpen)}
                onClick={() => setCodeOpen((o) => !o)}
                title="Toggle code view"
              >
                <CodeIcon /> Code
              </button>
              <button style={s.deployBtn} onClick={handleDeploy} disabled={!siteId || deploying}>
                {deploying ? 'Deploying…' : 'Deploy'}
              </button>
            </div>
          </div>

          {/* Page tabs */}
          {siteId && !loading && orderedPages.length > 0 && (
            <PageTabBar
              pages={orderedPages}
              activePageId={activePageId}
              onSwitch={switchPage}
              onAdd={addPage}
              onRename={renamePage}
              onSetHome={setHomePage}
              onDelete={deletePage}
              onMove={movePage}
            />
          )}

          {/* Canvas */}
          {loading ? (
            <div style={s.loadingOverlay}>
              <Spinner />
              <span>Loading…</span>
            </div>
          ) : (
            <div style={s.canvasArea} onClick={() => setSelectedId(null)}>
              <Canvas
                maxW={VIEWPORT_WIDTHS[viewport]}
                blocks={blocks.filter((b) => !b.hidden)}
                selectedId={selectedId}
                preview={previewMode}
                onSelect={setSelectedId}
                onHover={setHoveredId}
                onDuplicate={duplicateBlock}
                onDelete={deleteBlock}
              />
            </div>
          )}

          {/* Live code view */}
          {codeOpen && (
            <CodeDrawer
              blocks={blocks}
              format={codeFormat}
              onFormatChange={setCodeFormat}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelectBlock={setSelectedId}
              onClose={() => setCodeOpen(false)}
            />
          )}
        </main>

        {/* ── RIGHT PANEL ── */}
        <aside className="trinode-props" style={s.right}>
          <div style={s.rightTop}>
            <div style={s.panelTitle}>Properties</div>
          </div>
          {selectedBlock ? (
            <PropertiesPanel
              key={selectedBlock.id}
              block={selectedBlock}
              siteId={siteId}
              pages={orderedPages}
              onChangeProp={(key, value) => updateBlockProp(selectedBlock.id, key, value)}
              onChangeStyle={(key, value) => updateBlockStyle(selectedBlock.id, key, value)}
              onChangeStyleMulti={(patch) => updateBlockStyleMulti(selectedBlock.id, patch)}
              onDelete={deleteBlock}
            />
          ) : (
            <div style={s.propEmpty}>Select a component to edit</div>
          )}
        </aside>

      </div>

      {(publishResult || deployError) && (
        <DeployModal
          result={publishResult}
          error={deployError}
          onRetry={handleDeploy}
          onClose={() => { setPublishResult(null); setDeployError(null) }}
        />
      )}

      {!loading && showFirstRunHints && (
        <FirstRunHints onDismiss={dismissFirstRunHints} />
      )}

      <DragOverlay>
        {activeDrag ? (
          <div style={{
            ...s.compItem,
            background: 'rgba(55,138,221,0.9)',
            color: '#fff',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}>
            <div style={{ ...s.compDot, background: 'rgba(255,255,255,0.7)' }} />
            {BLOCK_DEFINITIONS[activeDrag]?.label ?? activeDrag}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/* Derive a URL slug preview from a page name (mirrors the server's pageSlugify). */
function derivePageSlug(v) {
  const base = String(v || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return base === 'index' ? '' : base
}

/* Browser-style page tabs above the canvas. One tab per page (home marked with
   a star); the active tab is highlighted. Each tab has a kebab menu (rename /
   set as home / move / delete) and there is a "+" to add a page. */
function PageTabBar({ pages, activePageId, onSwitch, onAdd, onRename, onSetHome, onDelete, onMove }) {
  const [menuFor, setMenuFor] = useState(null)   // pageId whose menu is open
  const [modal, setModal] = useState(null)       // { mode, pageId, name, slug, error, busy }

  // Close any open kebab menu on an outside click / Escape.
  useEffect(() => {
    if (!menuFor) return
    function onDocClick() { setMenuFor(null) }
    function onKey(e) { if (e.key === 'Escape') setMenuFor(null) }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey) }
  }, [menuFor])

  function openAdd() {
    setMenuFor(null)
    setModal({ mode: 'add', name: '', slug: '', slugTouched: false, error: null, busy: false })
  }
  function openRename(page) {
    setMenuFor(null)
    setModal({ mode: 'rename', pageId: page.id, name: page.name, error: null, busy: false })
  }

  async function submitModal() {
    if (!modal || modal.busy) return
    const name = (modal.name || '').trim()
    if (!name) { setModal((m) => ({ ...m, error: 'Please enter a page name.' })); return }
    setModal((m) => ({ ...m, busy: true, error: null }))
    try {
      if (modal.mode === 'add') {
        await onAdd(name, modal.slug || derivePageSlug(name))
      } else {
        await onRename(modal.pageId, name)
      }
      setModal(null)
    } catch (err) {
      setModal((m) => ({ ...m, busy: false, error: err.message || 'Something went wrong.' }))
    }
  }

  async function handleSetHome(pageId) {
    setMenuFor(null)
    try { await onSetHome(pageId) } catch (err) { alert(err.message || 'Could not set home page.') }
  }
  async function handleDelete(page) {
    setMenuFor(null)
    if (!window.confirm(`Delete the "${page.name}" page? This can't be undone.`)) return
    try { await onDelete(page.id) } catch (err) { alert(err.message || 'Could not delete page.') }
  }

  return (
    <div style={s.pageBar}>
      {pages.map((page, idx) => {
        const active = page.id === activePageId
        const menuOpen = menuFor === page.id
        return (
          <div key={page.id} style={{ position: 'relative', flexShrink: 0 }}>
            <div
              style={s.pageTab(active)}
              onClick={() => onSwitch(page.id)}
              title={page.is_home ? `${page.name} (home)` : `${page.name} · /${page.page_slug}`}
            >
              {page.is_home && <span style={s.pageHomeDot} title="Home page">★</span>}
              <span style={s.pageTabName}>{page.name}</span>
              <button
                type="button"
                style={s.pageTabMenuBtn(active)}
                title="Page options"
                onClick={(e) => { e.stopPropagation(); setMenuFor(menuOpen ? null : page.id) }}
              >⋯</button>
            </div>

            {menuOpen && (
              <div style={{ ...s.pageMenu, top: '32px', left: 0 }} onClick={(e) => e.stopPropagation()}>
                <button type="button" style={s.pageMenuItem} onClick={() => openRename(page)}>Rename</button>
                {!page.is_home && (
                  <button type="button" style={s.pageMenuItem} onClick={() => handleSetHome(page.id)}>Set as home</button>
                )}
                <div style={s.pageMenuDivider} />
                <button
                  type="button"
                  style={{ ...s.pageMenuItem, opacity: idx === 0 ? 0.4 : 1 }}
                  disabled={idx === 0}
                  onClick={() => { setMenuFor(null); onMove(page.id, -1) }}
                >Move left</button>
                <button
                  type="button"
                  style={{ ...s.pageMenuItem, opacity: idx === pages.length - 1 ? 0.4 : 1 }}
                  disabled={idx === pages.length - 1}
                  onClick={() => { setMenuFor(null); onMove(page.id, 1) }}
                >Move right</button>
                {!page.is_home && (
                  <>
                    <div style={s.pageMenuDivider} />
                    <button
                      type="button"
                      style={{ ...s.pageMenuItem, ...s.pageMenuItemDanger }}
                      onClick={() => handleDelete(page)}
                    >Delete page</button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      <button type="button" style={s.pageAddBtn} title="Add page" onClick={openAdd}>+</button>

      {modal && (
        <div style={s.pageModalOverlay} onClick={() => !modal.busy && setModal(null)}>
          <div style={s.pageModalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={s.pageModalTitle}>{modal.mode === 'add' ? 'Add page' : 'Rename page'}</h3>
            <div style={s.field}>
              <label style={s.fieldLabel}>Page name</label>
              <input
                autoFocus
                type="text"
                value={modal.name}
                placeholder="About"
                style={s.input}
                onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitModal() }}
              />
            </div>
            {modal.mode === 'add' && (
              <div style={s.field}>
                <label style={s.fieldLabel}>URL slug</label>
                <input
                  type="text"
                  value={modal.slugTouched ? modal.slug : derivePageSlug(modal.name)}
                  placeholder="about"
                  style={s.input}
                  onChange={(e) => setModal((m) => ({ ...m, slug: derivePageSlug(e.target.value), slugTouched: true }))}
                />
                <div style={s.hint}>Reached at /s/&lt;site&gt;/{(modal.slugTouched ? modal.slug : derivePageSlug(modal.name)) || 'slug'}</div>
              </div>
            )}
            {modal.error && <div style={s.pageModalError}>{modal.error}</div>}
            <div style={s.pageModalActions}>
              <button type="button" style={s.pageModalBtn(false)} disabled={modal.busy} onClick={() => setModal(null)}>Cancel</button>
              <button type="button" style={s.pageModalBtn(true)} disabled={modal.busy} onClick={submitModal}>
                {modal.busy ? 'Saving…' : (modal.mode === 'add' ? 'Add page' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* The droppable canvas surface holding the sortable list of blocks */
function Canvas({ maxW, blocks, selectedId, preview, onSelect, onHover, onDuplicate, onDelete }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' })

  // Preview mode renders the bare site with no editing chrome and lets the
  // entrance animations play as blocks scroll into view.
  if (preview) {
    return (
      <div style={s.canvasCard(maxW)} onClick={(e) => e.stopPropagation()}>
        {blocks.map((block) => (
          <BlockRenderer key={block.id} block={block} preview />
        ))}
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={s.canvasCard(maxW)}>
      {blocks.length === 0 ? (
        <div style={s.emptyDrop(isOver)}>
          <GridIcon />
          <span>Drag components here to start building</span>
        </div>
      ) : (
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map(block => (
            <SortableBlock
              key={block.id}
              block={block}
              selected={block.id === selectedId}
              onSelect={onSelect}
              onHover={onHover}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
      )}
    </div>
  )
}

/* The collapsible code drawer at the bottom of the canvas. Shows the live
   generated source (JSX or HTML) with syntax highlighting, line numbers, and
   block-to-code highlighting tied to the selected / hovered block. */
function CodeDrawer({ blocks, format, onFormatChange, selectedId, hoveredId, onSelectBlock, onClose }) {
  const [copied, setCopied] = useState(false)

  const { code, lineMap } = generateCode(blocks, format)

  function copyCode() {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      },
      () => { /* clipboard blocked — ignore */ },
    )
  }

  return (
    <div style={s.codeDrawer}>
      <div style={s.codeHeader}>
        <div style={s.codeTabs}>
          <button style={s.codeTab(format === 'jsx')} onClick={() => onFormatChange('jsx')}>JSX</button>
          <button style={s.codeTab(format === 'html')} onClick={() => onFormatChange('html')}>HTML</button>
        </div>
        <div style={s.codeHeaderRight}>
          <button style={s.codeCopyBtn} onClick={copyCode} title="Copy code">
            <CopyIcon />
            {copied ? 'Copied!' : 'Copy code'}
          </button>
          <button style={s.codeCloseBtn} onClick={onClose} title="Close">×</button>
        </div>
      </div>

      <Highlight code={code} language={format === 'html' ? 'markup' : 'jsx'} theme={themes.vsDark}>
        {({ style: preStyle, tokens, getLineProps, getTokenProps }) => (
          <div style={{ ...s.codeScroll, background: '#0a0a0c', color: preStyle.color }}>
            {tokens.map((line, i) => {
              const blockId = lineMap[i]
              const highlighted = blockId != null && (blockId === selectedId || blockId === hoveredId)
              const lineProps = getLineProps({ line })
              return (
                <div
                  key={i}
                  {...lineProps}
                  onClick={() => blockId != null && onSelectBlock(blockId)}
                  style={{ ...lineProps.style, ...s.codeLine(highlighted, blockId != null) }}
                >
                  <span style={s.codeGutter}>{i + 1}</span>
                  <span style={s.codeContent}>
                    {line.map((token, key) => {
                      const tp = getTokenProps({ token })
                      return <span key={key} {...tp} />
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Highlight>
    </div>
  )
}

/* Layers list (left panel): icon + name + visibility toggle, drag to reorder.
   Uses its own DndContext so layer-row drags don't collide with the canvas /
   palette DnD that share the outer context. */
function LayersPanel({ blocks, selectedId, onSelect, onToggleHidden, onReorder }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  if (blocks.length === 0) {
    return (
      <div style={s.layersEmpty}>
        No layers yet.<br />Drag a component onto the canvas.
      </div>
    )
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = blocks.findIndex((b) => b.id === active.id)
    const newIdx = blocks.findIndex((b) => b.id === over.id)
    if (oldIdx !== -1 && newIdx !== -1) onReorder(oldIdx, newIdx)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((b) => (
          <LayerRow
            key={b.id}
            block={b}
            selected={b.id === selectedId}
            onSelect={onSelect}
            onToggleHidden={onToggleHidden}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}

function LayerRow({ block, selected, onSelect, onToggleHidden }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const dim = block.hidden ? 0.4 : 1

  const rowStyle = {
    ...s.layerRow,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: selected ? 'rgba(55,138,221,0.18)' : 'transparent',
    color: selected ? '#fafafa' : 'rgba(255,255,255,0.65)',
  }

  return (
    <div ref={setNodeRef} style={rowStyle} onClick={() => onSelect(block.id)}>
      <span
        style={s.layerHandle}
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder"
      >
        <MoveIcon />
      </span>
      <span style={{ display: 'flex', opacity: dim }}>
        <LayerIcon type={block.type} />
      </span>
      <span style={{ ...s.layerName, opacity: dim }}>
        {BLOCK_DEFINITIONS[block.type]?.label ?? block.type}
      </span>
      <button
        style={s.eyeBtn}
        onClick={(e) => { e.stopPropagation(); onToggleHidden(block.id) }}
        title={block.hidden ? 'Show' : 'Hide'}
      >
        {block.hidden ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}

/* Post-deploy modal: shows the live public URL with Copy + Visit actions.
   Also surfaces a deploy error with a Retry button. */
// One-time welcome overlay for first-time editor users. Plain divs styled like
// DeployModal — no tour library. Dismiss via button or clicking the backdrop.
function FirstRunHints({ onDismiss }) {
  const steps = [
    { n: '1', title: 'Drag components in', body: 'Pick a block from the left panel and drag it onto the canvas.' },
    { n: '2', title: 'Edit its properties', body: 'Select any block to tweak text, colors, and layout on the right.' },
    { n: '3', title: 'Hit Deploy to go live', body: 'One click publishes your site to a shareable link.' },
  ]

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
  }
  const card = {
    width: '480px', maxWidth: 'calc(100vw - 32px)',
    background: '#161618', border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '14px', padding: '24px', color: '#fafafa',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'inherit',
  }
  const stepRow = { display: 'flex', alignItems: 'flex-start', gap: '12px', marginTop: '16px' }
  const stepNum = {
    flexShrink: 0, width: '24px', height: '24px', borderRadius: '50%',
    background: 'rgba(55,138,221,0.16)', border: '0.5px solid rgba(55,138,221,0.5)',
    color: '#7ab6f0', fontSize: '12px', fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const primaryBtn = {
    background: '#e4e4e7', color: '#09090b', border: 'none', borderRadius: '8px',
    padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div style={overlay} onClick={onDismiss}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em' }}>
          Welcome to the editor 👋
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginTop: '6px' }}>
          Three things are all it takes to ship your first site:
        </p>
        {steps.map((step) => (
          <div key={step.n} style={stepRow}>
            <div style={stepNum}>{step.n}</div>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{step.title}</div>
              <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, marginTop: '2px' }}>
                {step.body}
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button style={primaryBtn} onClick={onDismiss}>Got it — let's build</button>
        </div>
      </div>
    </div>
  )
}

function DeployModal({ result, error, onRetry, onClose }) {
  const [copied, setCopied] = useState(false)
  // Build a human-friendly URL like "tribox.app/s/my-site-x4f2" (relative to the current host).
  const displayUrl = result ? `${window.location.host}${result.url}` : ''

  function copy() {
    const full = `${window.location.origin}${result.url}`
    navigator.clipboard?.writeText(full).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1600) },
      () => { /* clipboard blocked — ignore */ },
    )
  }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
  }
  const card = {
    width: '440px', maxWidth: 'calc(100vw - 32px)',
    background: '#161618', border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '14px', padding: '24px', color: '#fafafa',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'inherit',
  }
  const urlRow = {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', padding: '10px 12px', marginTop: '14px',
  }
  const urlText = {
    flex: 1, fontSize: '13px', color: '#fafafa', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontFamily: '"SF Mono", Menlo, Consolas, monospace',
  }
  const copyBtn = {
    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: '#378ADD', color: '#fff', border: 'none', borderRadius: '7px',
    padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  }
  const footer = { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }
  const ghostBtn = {
    background: 'transparent', border: '0.5px solid rgba(255,255,255,0.16)',
    color: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '8px 16px',
    fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  }
  const primaryBtn = {
    background: '#e4e4e7', color: '#09090b', border: 'none', borderRadius: '8px',
    padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {error ? (
          <>
            <div style={{ fontSize: '17px', fontWeight: 700 }}>Deploy failed</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginTop: '10px' }}>
              {error}
            </p>
            <div style={footer}>
              <button style={ghostBtn} onClick={onClose}>Close</button>
              <button style={{ ...primaryBtn, cursor: 'pointer' }} onClick={onRetry}>Try again</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.01em' }}>
              🎉 Your site is live!
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginTop: '8px' }}>
              Anyone with the link can now view your site.
            </p>

            <div style={urlRow}>
              <span style={urlText}>{displayUrl}</span>
              <button style={copyBtn} onClick={copy}>
                <CopyIcon />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginTop: '12px', marginBottom: 0 }}>
              Tip: enable your AI assistant in Settings to support your visitors.
            </p>

            <div style={footer}>
              <button style={ghostBtn} onClick={onClose}>Close</button>
              <a style={primaryBtn} href={result.url} target="_blank" rel="noopener noreferrer">
                Visit site ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
