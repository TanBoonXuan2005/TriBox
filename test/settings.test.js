// Integration test for the Settings API: GET /api/sites/:id and
// PATCH /api/sites/:id. Exercises the real Express app over HTTP with `pg` and
// `@supabase/supabase-js` mocked, so it needs no live DB.
// Run: node test/settings.test.js
const assert = require('assert');

// ── In-memory "database" ────────────────────────────────────────────────────
const SITE = {
  id: 'site-1',
  owner_id: 'user-1',
  name: 'My Site',
  domain_url: '',
  api_key: 'live_key_abc123',
  subscription_tier: 'free',
  is_active: true,
  slug: 'my-site-9f2a',
  is_published: true,
  chatbot_enabled: false,
  created_at: '2026-01-01T00:00:00Z',
};

const norm = (s) => s.replace(/\s+/g, ' ').trim();

const mockPool = {
  async query(text, params = []) {
    const sql = norm(text);

    // single-site fetch (owner-scoped)
    if (sql.startsWith('SELECT id, name, domain_url, api_key, subscription_tier, is_active, slug, is_published, chatbot_enabled, created_at FROM sites WHERE id = $1 AND owner_id = $2')) {
      const row = SITE.id === params[0] && SITE.owner_id === params[1] ? { ...SITE } : undefined;
      return { rows: row ? [row] : [] };
    }

    // PATCH: dynamic UPDATE of whichever fields were sent. The owner id and site
    // id are always the last two params; the rest map to the SET assignments.
    if (sql.startsWith('UPDATE sites SET')) {
      const ownerId = params[params.length - 1];
      const siteId = params[params.length - 2];
      if (siteId !== SITE.id || ownerId !== SITE.owner_id) return { rows: [] };
      // Apply each "col = $n" assignment in order using the leading params.
      const assignments = sql.slice('UPDATE sites SET'.length, sql.indexOf(' WHERE ')).split(',');
      let p = 0;
      for (const a of assignments) {
        const col = a.trim().split('=')[0].trim();
        if (col === 'updated_at') continue;
        SITE[col] = params[p++];
      }
      return { rows: [{ ...SITE }] };
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
// Stripe is constructed at module load; a no-op stub is enough for these tests.
mockModule('stripe', function () { return {}; });

const app = require('../server');

// ── Drive the app over real HTTP ────────────────────────────────────────────
(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: 'Bearer good-token' };

  try {
    // 1. Unauthenticated fetch is rejected.
    let res = await fetch(`${base}/api/sites/site-1`);
    assert.strictEqual(res.status, 401, 'GET without auth → 401');

    // 2. Authenticated fetch returns the slug + api_key the Settings page needs.
    res = await fetch(`${base}/api/sites/site-1`, { headers: auth });
    assert.strictEqual(res.status, 200, 'authed GET → 200');
    let body = await res.json();
    assert.strictEqual(body.api_key, 'live_key_abc123', 'returns real api_key');
    assert.strictEqual(body.slug, 'my-site-9f2a', 'returns subdomain slug');

    // 3. PATCH the site name.
    res = await fetch(`${base}/api/sites/site-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'Renamed Site' }),
    });
    assert.strictEqual(res.status, 200, 'PATCH name → 200');
    body = await res.json();
    assert.strictEqual(body.name, 'Renamed Site', 'name updated');

    // 4. PATCH the widget toggle + custom domain together.
    res = await fetch(`${base}/api/sites/site-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ is_active: false, domain_url: 'https://shop.example.com' }),
    });
    body = await res.json();
    assert.strictEqual(body.is_active, false, 'widget disabled');
    assert.strictEqual(body.domain_url, 'https://shop.example.com', 'custom domain saved');

    // 4b. PATCH the global AI Assistant toggle (chatbot_enabled).
    res = await fetch(`${base}/api/sites/site-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ chatbot_enabled: true }),
    });
    assert.strictEqual(res.status, 200, 'PATCH chatbot_enabled → 200');
    body = await res.json();
    assert.strictEqual(body.chatbot_enabled, true, 'AI Assistant enabled');

    // 5. Empty name is rejected.
    res = await fetch(`${base}/api/sites/site-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: '   ' }),
    });
    assert.strictEqual(res.status, 400, 'blank name → 400');

    // 6. No updatable fields is rejected.
    res = await fetch(`${base}/api/sites/site-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ nonsense: true }),
    });
    assert.strictEqual(res.status, 400, 'no fields → 400');

    console.log('✓ settings API: all assertions passed');
  } finally {
    server.close();
  }
})().catch((err) => {
  console.error('✗ settings API test failed:');
  console.error(err);
  process.exit(1);
});
