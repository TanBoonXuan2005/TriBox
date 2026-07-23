// Standalone check of the server-side renderer. Run: node test/render.test.js
const assert = require('assert');
const { renderBlocksToHTML } = require('../server');

const blocks = [
  { id: '1', type: 'navbar', props: { logo: 'Acme', links: ['Home', 'Shop'], cta: 'Sign up' } },
  { id: '2', type: 'hero', props: { title: 'Hello <world>', subtitle: 'A & B', ctaText: 'Go', bgColor: '#eef' } },
  { id: '3', type: 'heading', props: { text: 'About', level: 'h3' } },
  { id: '4', type: 'text', props: { content: 'Paragraph "quoted" text.' } },
  { id: '5', type: 'button', props: { text: 'Buy', variant: 'outline' } },
  { id: '6', type: 'image', props: { src: '', alt: 'Placeholder', width: 'half', borderRadius: 12 } },
  { id: '7', type: 'columns', props: { count: 2, items: ['A', 'B', 'C'] } },
  { id: '8', type: 'productGrid', props: { columns: 2, products: [{ name: 'P1', price: '$9' }] } },
  { id: '9', type: 'searchBar', props: { placeholder: 'Find…' } },
  { id: '10', type: 'footer', props: { text: '© 2026', links: ['Privacy'], style: { padding: 40, background: '#000', align: 'center' } } },
  { id: '11', type: 'text', props: { content: 'HIDDEN' }, hidden: true },
];

const html = renderBlocksToHTML(blocks, 'My <Test> Site');

// Document scaffolding.
assert(html.startsWith('<!DOCTYPE html>'), 'starts with doctype');
assert(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1" />'), 'has viewport');
assert(html.includes('<title>My &lt;Test&gt; Site</title>'), 'escaped title in head');

// Content + escaping.
assert(html.includes('Acme') && html.includes('Sign up'), 'navbar content');
assert(html.includes('Hello &lt;world&gt;') && html.includes('A &amp; B'), 'hero escaped');
assert(html.includes('<h3 '), 'heading level honored');
assert(html.includes('Paragraph &quot;quoted&quot; text.'), 'text escaped');
assert(html.includes('1.5px solid #378ADD'), 'outline button style');
assert(html.includes('grid-template-columns:repeat(2, 1fr)'), 'product grid columns');
assert(html.includes('width:50%'), 'image half width');
assert(html.includes('border-radius:12px'), 'image radius');

// Columns count limits items to 2.
const colCount = (html.match(/background:#f7f7f8/g) || []).length;
assert.strictEqual(colCount, 2, 'columns respects count');

// Universal style wrapper applied to footer.
assert(html.includes('padding:40px') && html.includes('text-align:center'), 'style wrapper');

// Hidden block omitted.
assert(!html.includes('HIDDEN'), 'hidden block skipped');

// Edge cases: empty + non-array.
assert(renderBlocksToHTML([], 'Empty').includes('<body>'), 'empty blocks ok');
assert(renderBlocksToHTML(null, 'Null').includes('<body>'), 'null blocks ok');

console.log('✓ renderBlocksToHTML: all assertions passed');

// ── New component types (mirrors of BlockRenderer.jsx) ──────────────────────────
const newBlocks = [
  { id: 'p', type: 'pricingTable', props: { plans: [
    { name: 'Starter', price: '$9', features: ['1 project'], highlighted: false },
    { name: 'Pro', price: '$29', features: ['Unlimited projects', 'Analytics'], highlighted: true },
  ] } },
  { id: 'f', type: 'form', props: { fields: [
    { label: 'Name', type: 'text', required: true },
    { label: 'Message', type: 'textarea', required: false },
  ], submitText: 'Send message' } },
  { id: 'c', type: 'cta', props: { heading: 'Ready?', subtext: 'Join us', buttonText: 'Start', bgColor: '#222' } },
  { id: 't', type: 'testimonials', props: { title: 'Loved', items: [{ quote: 'Great <stuff>', author: 'Ada', role: 'CEO' }] } },
  { id: 'q', type: 'faq', props: { title: 'FAQ', items: [{ question: 'Q1?', answer: 'A1' }, { question: 'Q2?', answer: 'A2' }] } },
  { id: 'a', type: 'accordion', props: { items: [{ title: 'T1', content: 'C1' }, { title: 'T2', content: 'C2' }] } },
  { id: 'b', type: 'tabs', props: { tabs: [{ label: 'One', content: 'First' }, { label: 'Two', content: 'Second' }] } },
  { id: 'd', type: 'countdown', props: { targetDate: '2030-01-01T00:00:00', label: 'Soon' } },
  { id: 'r', type: 'carousel', props: { slides: ['Alpha', 'Beta'] } },
  { id: 'g', type: 'gallery', props: { images: ['', ''], columns: 2 } },
  { id: 'v', type: 'video', props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', aspectRatio: '16:9' } },
  { id: 'm', type: 'map', props: { address: 'Golden Gate Bridge', zoom: 13 } },
  { id: 'ct', type: 'cart', props: {} },
  { id: 'rv', type: 'reviews', props: { items: [{ stars: 4, text: 'Nice', author: 'Sam' }] } },
  { id: 'pf', type: 'productFilter', props: { categories: ['A', 'B'], priceRange: '$0 – $99' } },
  { id: 'co', type: 'checkout', props: {} },
];
const h2 = renderBlocksToHTML(newBlocks, 'New Blocks');

// Pricing table: highlighted Pro plan + features + price.
assert(h2.includes('POPULAR'), 'pricing highlighted plan badge');
assert(h2.includes('linear-gradient(165deg,#378ADD,#2f6fc0)'), 'pricing highlighted gradient');
assert(h2.includes('Unlimited projects') && h2.includes('$29'), 'pricing features/price');
assert(h2.includes('Get started'), 'pricing CTA');

// Form: fields, required marker, submit button hook.
assert(h2.includes('data-tn-form'), 'form runtime hook');
assert(h2.includes('<textarea'), 'form textarea field');
assert(h2.includes('data-submit-text="Send message"'), 'form submit text');
assert(h2.includes('required'), 'form required attr');

// CTA + testimonials escape user content.
assert(h2.includes('background:#222') && h2.includes('Ready?'), 'cta heading + bg');
assert(h2.includes('Great &lt;stuff&gt;'), 'testimonial escaped');

// Interactive hooks present for the runtime to wire up. (faq + accordion each
// emit a data-accordion container; the runtime script references it once more.)
assert((h2.match(/data-accordion/g) || []).length >= 2, 'faq + accordion both use data-accordion');
assert(h2.includes('Q1?') && h2.includes('T1'), 'faq + accordion content rendered');
assert(h2.includes('data-tabs') && h2.includes('data-tab-panel="1"'), 'tabs hooks');
assert(h2.includes('data-carousel') && h2.includes('data-dot="1"'), 'carousel hooks');
assert(/data-countdown="\d+"/.test(h2), 'countdown target timestamp');
assert(h2.includes('data-unit="s"'), 'countdown unit hook');

// Embeds resolve to real iframe sources.
assert(h2.includes('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'video youtube embed');
assert(h2.includes('maps.google.com/maps?q=Golden%20Gate%20Bridge'), 'map embed');

// Static ecommerce blocks render their fixtures.
assert(h2.includes('Your cart (3)'), 'cart fixture');
assert(h2.includes('Pay $196.00'), 'checkout total');
assert(h2.includes('Filters'), 'product filter');

// Document ships the runtime + hover/entrance CSS.
assert(h2.includes('<script>') && h2.includes('IntersectionObserver'), 'runtime script injected');
assert(h2.includes('@keyframes tnSlideUp'), 'entrance keyframes injected');
assert(h2.includes('.tn-hover-lift:hover'), 'hover css injected');

// Full style wrapper port: gradient bg, shadow preset, hover + entrance.
const styled = renderBlocksToHTML([
  { id: 's1', type: 'heading', props: { text: 'Styled', level: 'h2', style: {
    bgType: 'gradient', gradientFrom: '#111', gradientTo: '#222', gradientDir: '90deg',
    boxShadow: 'lg', fontSize: 50, hoverEffect: 'lift', entrance: 'slide-up',
  } } },
], 'Styled');
assert(styled.includes('linear-gradient(90deg, #111, #222)'), 'wrapper gradient bg');
assert(styled.includes('0 10px 30px rgba(0,0,0,0.18)'), 'wrapper shadow preset (lg)');
assert(styled.includes('font-size:50px'), 'wrapper font size');
assert(styled.includes('class="tn-block tn-hover-lift"'), 'wrapper hover class');
assert(styled.includes('data-entrance="slide-up"'), 'wrapper entrance attr');

console.log('✓ new block types + style wrapper: all assertions passed');

// ── CTA button links (navbar / hero / cta / pricing plans) ──────────────────────
// All four reuse the Button block's link shape and the buttonLinkHref resolver.
const linkCtx = { navContext: { siteSlug: 'acme', pagesById: {
  home: { id: 'home', page_slug: 'home', is_home: true },
  p1: { id: 'p1', page_slug: 'pricing', is_home: false },
} } };

const linked = renderBlocksToHTML([
  { id: 'n', type: 'navbar', props: { logo: 'A', links: [], cta: 'Sign up', ctaLink: { type: 'page', pageId: 'home' } } },
  { id: 'h', type: 'hero', props: { title: 'Hi', subtitle: 's', ctaText: 'Go', ctaLink: { type: 'url', url: 'https://ext.example' } } },
  { id: 'c', type: 'cta', props: { heading: 'R?', subtext: 'j', buttonText: 'Start', buttonLink: { type: 'page', pageId: 'p1' } } },
  { id: 'p', type: 'pricingTable', props: { plans: [
    { name: 'Pro', price: '$29', features: ['X'], highlighted: true, link: { type: 'page', pageId: 'p1' } },
    { name: 'Old', price: '$9', features: ['Y'], highlighted: false }, // legacy plan, no link key
  ] } },
], 'Linked', linkCtx);
assert(linked.includes('<a href="/s/acme"') && linked.includes('>Sign up</a>'), 'navbar cta links to home page');
assert(linked.includes('<a href="https://ext.example"') && linked.includes('>Go</a>'), 'hero cta links to external url');
assert(linked.includes('<a href="/s/acme/pricing"') && linked.includes('>Start</a>'), 'cta block links to internal page');
assert(/<a href="\/s\/acme\/pricing" style="display:block;[^"]*">Get started<\/a>/.test(linked), 'pricing plan button is a block-level anchor');
assert(linked.includes('<div style="text-align:center;padding:11px 0;border-radius:9px;font-size:14px;font-weight:700;background:#378ADD;color:#fff;">Get started</div>'), 'legacy plan without link keeps inert div');

// A deleted target page degrades to the inert element (no crash, no <a>).
const dangling = renderBlocksToHTML([
  { id: 'h', type: 'hero', props: { title: 'Hi', subtitle: 's', ctaText: 'Go', ctaLink: { type: 'page', pageId: 'gone' } } },
  { id: 'p', type: 'pricingTable', props: { plans: [
    { name: 'Pro', price: '$29', features: ['X'], highlighted: false, link: { type: 'page', pageId: 'gone' } },
  ] } },
], 'Dangling', linkCtx);
assert(!dangling.includes('<a href'), 'deleted page target renders no anchor');
assert(dangling.includes('>Go</span>') && dangling.includes('>Get started</div>'), 'deleted page target stays inert');

// Legacy blocks (no link props at all) render the same inert markup as before.
const legacy = renderBlocksToHTML([
  { id: 'n', type: 'navbar', props: { logo: 'A', links: [], cta: 'Sign up' } },
  { id: 'h', type: 'hero', props: { title: 'Hi', subtitle: 's', ctaText: 'Go' } },
  { id: 'c', type: 'cta', props: { heading: 'R?', subtext: 'j', buttonText: 'Start' } },
], 'Legacy', linkCtx);
assert(!legacy.includes('<a href'), 'legacy blocks render no anchors');
assert(legacy.includes('<span style="background:#111;color:#fff;padding:8px 16px;border-radius:7px;font-size:13px;font-weight:600;">Sign up</span>'), 'legacy navbar cta span unchanged');
assert(legacy.includes('<span style="display:inline-block;background:#378ADD;color:#fff;padding:13px 28px;border-radius:9px;font-size:15px;font-weight:600;">Go</span>'), 'legacy hero cta span unchanged');
assert(legacy.includes('<span style="display:inline-block;background:#fff;color:#111;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">Start</span>'), 'legacy cta block span unchanged');

console.log('✓ CTA button links: all assertions passed');

// ── AI Chat widget injection ────────────────────────────────────────────────────
const KEY = 'live_key_xyz';
const oneBlock = [{ id: 'h', type: 'hero', props: { title: 'Hi', subtitle: 'x', ctaText: 'Go' } }];

// No injection when neither the toggle nor an aiChat block is present.
const off = renderBlocksToHTML(oneBlock, 'Off', { apiKey: KEY });
assert(!off.includes('/widget.js'), 'widget not injected when disabled');

// Global toggle injects the widget script once, with the real api_key and a
// RELATIVE src so the published page stays same-origin under `script-src 'self'`.
const toggled = renderBlocksToHTML(oneBlock, 'On', { chatbotEnabled: true, apiKey: KEY });
assert(toggled.includes(`<script src="/widget.js" data-api-key="${KEY}"></script>`), 'toggle injects widget tag with relative src');
assert((toggled.match(/widget\.js/g) || []).length === 1, 'toggle injects exactly once');

// An aiChat block injects the widget too — and renders no inline content itself.
const withBlock = renderBlocksToHTML(
  [...oneBlock, { id: 'ai', type: 'aiChat', props: {} }],
  'Block', { apiKey: KEY }
);
assert(withBlock.includes('src="/widget.js"'), 'aiChat block injects widget');

// Toggle + aiChat block together still inject only ONCE (dedupe).
const both = renderBlocksToHTML(
  [...oneBlock, { id: 'ai', type: 'aiChat', props: {} }],
  'Both', { chatbotEnabled: true, apiKey: KEY }
);
assert((both.match(/widget\.js/g) || []).length === 1, 'toggle + block dedupe to one widget');

// No api_key → no widget (nothing to authenticate the chat with).
const noKey = renderBlocksToHTML(oneBlock, 'NoKey', { chatbotEnabled: true, apiKey: '' });
assert(!noKey.includes('/widget.js'), 'no widget without an api_key');

console.log('✓ AI Chat widget injection: all assertions passed');
