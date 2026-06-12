// Integration test for the publish flow. Exercises the real Express app over
// HTTP with `pg` and `@supabase/supabase-js` mocked, so it needs no live DB.
// Run: node test/publish.test.js
const assert = require('assert');

// ── In-memory "database" ────────────────────────────────────────────────────
const SITE = {
  id: 'site-1',
  owner_id: 'user-1',
  name: 'My Cool Site!',
  slug: null,
  is_published: false,
  content: JSON.stringify([
    { id: 'a', type: 'hero', props: { title: 'Welcome Aboard', subtitle: 'Built with the editor', ctaText: 'Start' } },
    { id: 'b', type: 'text', props: { content: 'A & B <world> "quoted"' } },
  ]),
};
const usedSlugs = new Set();

const norm = (s) => s.replace(/\s+/g, ' ').trim();

const mockPool = {
  async query(text, params = []) {
    const sql = norm(text);

    // publish: load the owner's site
    if (sql.startsWith('SELECT id, name, slug FROM sites WHERE id = $1 AND owner_id = $2')) {
      const row = SITE.id === params[0] && SITE.owner_id === params[1]
        ? { id: SITE.id, name: SITE.name, slug: SITE.slug } : undefined;
      return { rows: row ? [row] : [] };
    }

    // publish: assign a fresh slug (simulate UNIQUE constraint)
    if (sql.startsWith('UPDATE sites SET slug = $1, is_published = true')) {
      const candidate = params[0];
      if (usedSlugs.has(candidate)) { const e = new Error('dup'); e.code = '23505'; throw e; }
      usedSlugs.add(candidate);
      SITE.slug = candidate;
      SITE.is_published = true;
      return { rows: [{ slug: candidate }] };
    }

    // publish: re-publish an already-slugged site
    if (sql.startsWith('UPDATE sites SET is_published = true WHERE id = $1')) {
      SITE.is_published = true;
      return { rows: [{ id: SITE.id }] };
    }

    // serve: look up a published site by slug
    if (sql.startsWith('SELECT name, content, chatbot_enabled, api_key FROM sites WHERE slug = $1 AND is_published = true')) {
      const row = SITE.slug === params[0] && SITE.is_published
        ? { name: SITE.name, content: SITE.content, chatbot_enabled: SITE.chatbot_enabled ?? false, api_key: SITE.api_key ?? null } : undefined;
      return { rows: row ? [row] : [] };
    }

    throw new Error('Unexpected query in test: ' + sql);
  },
};

// ── Mock the modules server.js requires, before requiring it ────────────────
function mockModule(id, exports) {
  const resolved = require.resolve(id);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('pg', { Pool: function () { return mockPool; } });
mockModule('@supabase/supabase-js', {
  createClient: () => ({
    auth: {
      getUser: async (token) =>
        token === 'good-token'
          ? { data: { user: { id: 'user-1' } }, error: null }
          : { data: { user: null }, error: { message: 'bad token' } },
    },
  }),
});

const app = require('../server');

// ── Drive the app over real HTTP ────────────────────────────────────────────
(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Unauthenticated publish is rejected.
    let res = await fetch(`${base}/api/sites/site-1/publish`, { method: 'POST' });
    assert.strictEqual(res.status, 401, 'publish without auth → 401');

    // 2. Authenticated publish generates a slug and returns the public URL.
    res = await fetch(`${base}/api/sites/site-1/publish`, {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });
    assert.strictEqual(res.status, 200, 'authed publish → 200');
    const body = await res.json();
    assert(/^my-cool-site-[0-9a-f]+$/.test(body.slug), `slug shape ok (${body.slug})`);
    assert.strictEqual(body.url, `/s/${body.slug}`, 'returns /s/:slug url');

    // 3. The public page renders the built blocks as standalone HTML.
    res = await fetch(`${base}${body.url}`);
    assert.strictEqual(res.status, 200, 'public page → 200');
    assert((res.headers.get('content-type') || '').includes('text/html'), 'served as HTML');
    const html = await res.text();
    assert(html.startsWith('<!DOCTYPE html>'), 'standalone document');
    assert(html.includes('<title>My Cool Site!</title>'), 'site name in title');
    assert(html.includes('Welcome Aboard'), 'hero title rendered');
    assert(html.includes('A &amp; B &lt;world&gt; &quot;quoted&quot;'), 'text escaped');
    // chatbot_enabled is false by default → no widget on the published page.
    assert(!html.includes('/widget.js'), 'no chat widget when disabled');

    // 3b. With the AI Assistant enabled, the page injects the widget once, with
    //     the site's api_key and a RELATIVE script src so it stays same-origin as
    //     the page (satisfying `script-src 'self'` in dev via Vite and in prod).
    SITE.chatbot_enabled = true;
    SITE.api_key = 'live_key_pub';
    res = await fetch(`${base}${body.url}`);
    const html2 = await res.text();
    assert(html2.includes('<script src="/widget.js"'), 'widget src is relative (same-origin)');
    assert(html2.includes('data-api-key="live_key_pub"'), 'widget stamped with real api_key');
    assert((html2.match(/widget\.js/g) || []).length === 1, 'widget injected exactly once');
    SITE.chatbot_enabled = false;

    // 4. Re-publishing reuses the same slug (idempotent).
    res = await fetch(`${base}/api/sites/site-1/publish`, {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });
    const body2 = await res.json();
    assert.strictEqual(body2.slug, body.slug, 're-publish keeps slug');

    // 5. Unknown slug returns a 404 page.
    res = await fetch(`${base}/s/does-not-exist`);
    assert.strictEqual(res.status, 404, 'unknown slug → 404');
    assert((await res.text()).includes('404'), '404 page body');

    console.log('✓ publish flow: all assertions passed');
  } finally {
    server.close();
  }
})().catch((err) => {
  console.error('✗ publish flow test failed:');
  console.error(err);
  process.exit(1);
});
