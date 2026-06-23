-- Multi-page support: a site can now have multiple pages, each with its own
-- name, URL slug, and block array. This migration adds the `pages` table and
-- backfills one "Home" page per existing site from its current sites.content.
--
-- Safe to run once on an existing database. It is IDEMPOTENT: the table is
-- created with IF NOT EXISTS, and the backfill skips any site that already has
-- at least one page row (so re-running it is a no-op).
--
-- The sites.content column is intentionally NOT dropped — it is kept in sync
-- with the home page so legacy readers (e.g. the chat digest) keep working.

CREATE TABLE IF NOT EXISTS pages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Home',
    page_slug   TEXT NOT NULL DEFAULT '',
    blocks      JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_home     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (site_id, page_slug)
);

CREATE INDEX IF NOT EXISTS idx_pages_site_id ON pages(site_id);

-- Backfill: one home page per site, carrying that site's existing blocks.
-- sites.content holds a JSON array (or is NULL/empty). Casting through ::text
-- first makes this work whether the column is TEXT or JSONB: empty / NULL / JSON
-- null collapse to an empty array, everything else round-trips to jsonb. Only
-- sites that have no pages yet are touched, so this is safe to re-run.
INSERT INTO pages (site_id, name, page_slug, blocks, sort_order, is_home)
SELECT
    s.id,
    'Home',
    '',
    CASE
        WHEN s.content IS NULL OR btrim(s.content::text) IN ('', 'null') THEN '[]'::jsonb
        ELSE s.content::text::jsonb
    END,
    0,
    TRUE
FROM sites s
WHERE NOT EXISTS (
    SELECT 1 FROM pages p WHERE p.site_id = s.id
);
