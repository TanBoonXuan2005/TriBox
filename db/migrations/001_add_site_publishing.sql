-- Publishing: public slug + published flag for live sites.
-- Run against existing databases that predate these columns.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
