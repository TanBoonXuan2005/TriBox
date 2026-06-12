-- Dedicated "Tribox" site whose api_key powers the chat widget embedded on
-- OUR OWN landing page (client/src/pages/Landing.jsx). Dogfoods the AI agent:
-- the Gemini system prompt uses the site name, so the bot introduces itself
-- as the assistant for "Tribox" and answers questions about the product.
--
-- Run once against the app database:
--   psql "$DATABASE_URL" -f db/seed-tribox.sql
--
-- The api_key below must match VITE_TRIBOX_WIDGET_KEY (client/.env) or the
-- fallback constant in Landing.jsx. It is not a secret — every embedded
-- widget key ships in public HTML by design.
--
-- subscription_tier is 'pro' so the landing demo never hits the free tier's
-- 50-message daily cap. Idempotent: re-running refreshes the row in place.
--
-- content holds blocks describing Tribox itself (the product, the three
-- pillars, Free vs Pro, publishing). /api/chat digests these into the Gemini
-- system prompt, so the landing widget can genuinely answer "What is Tribox?"
-- and "How much is Pro?". Every claim here must stay true of the product —
-- same rule as the landing page copy it sits behind.

INSERT INTO sites (owner_id, name, domain_url, api_key, subscription_tier, is_active, chatbot_enabled, content)
VALUES (
  gen_random_uuid(),
  'Tribox',
  'https://tribox.app',
  'tribox_landing_key',
  'pro',
  TRUE,
  TRUE,
  '[
    { "id": "tribox-1", "type": "heading", "props": { "text": "Tribox — the all-in-one website platform for small business", "level": "h1" } },
    { "id": "tribox-2", "type": "text", "props": { "content": "Tribox is a no-code website builder. Design pages on a drag-and-drop canvas, start from professionally designed templates, publish to a live URL in one click, and add a built-in AI support agent powered by Google Gemini." } },
    { "id": "tribox-3", "type": "columns", "props": { "count": 3, "items": [
      "The Canvas — a visual drag-and-drop editor with 27 components, desktop, tablet and mobile preview, undo and redo, and a live code view showing the JSX and HTML behind your page.",
      "The Templates — 6 starter kits (E-Commerce, Portfolio, Blog, SaaS Landing, Restaurant, Agency) so you launch from a designed layout instead of a blank canvas.",
      "The Agent — an embeddable chat bubble powered by Google Gemini. Add one script tag to any site and it answers visitor questions using your published page content."
    ] } },
    { "id": "tribox-4", "type": "pricingTable", "props": { "plans": [
      { "name": "Free", "price": "$0", "features": ["1 site", "Basic templates", "50 AI messages per day", "500MB storage", "Community support"], "highlighted": false },
      { "name": "Pro", "price": "$29/mo", "features": ["Unlimited sites", "All templates", "Unlimited AI agent messages", "Custom domain", "10GB storage", "Priority support"], "highlighted": true }
    ] } },
    { "id": "tribox-5", "type": "faq", "props": { "title": "Common questions", "items": [
      { "question": "How does publishing work?", "answer": "One click publishes your site to a live URL at tribox.app/s/your-site. Pro plans can connect a custom domain." },
      { "question": "How much does Pro cost?", "answer": "Pro is $29 per month, or $23 per month billed yearly (20% off). Upgrade or cancel anytime — billing is handled securely by Stripe." },
      { "question": "Is there a free trial?", "answer": "No trial needed — the Free plan is free forever. Build and publish one site with 50 AI messages a day, and upgrade only when you need more." },
      { "question": "How do I contact support?", "answer": "Email support@tribox.app and the team will help you out." }
    ] } }
  ]'
)
ON CONFLICT (api_key) DO UPDATE SET
  name              = EXCLUDED.name,
  domain_url        = EXCLUDED.domain_url,
  subscription_tier = EXCLUDED.subscription_tier,
  is_active         = EXCLUDED.is_active,
  chatbot_enabled   = EXCLUDED.chatbot_enabled,
  content           = EXCLUDED.content;
