-- Lead capture: published sites with a Form block now collect visitor
-- submissions. Each row is one form submission for a site; `data` holds the
-- submitted field values (name, email, message, plus any custom fields) keyed
-- by field label. Merchants read these in the dashboard Messages view.
-- Run against existing databases that predate this table.
CREATE TABLE IF NOT EXISTS leads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_site_id ON leads(site_id);
