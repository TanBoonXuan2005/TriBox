-- AI Assistant on published sites: a per-site flag that injects the chat widget
-- into the published /s/:slug page. Distinct from is_active (which gates the
-- /api/chat backend) — this controls the global toggle in Settings.
-- Run against existing databases that predate this column.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN NOT NULL DEFAULT false;
