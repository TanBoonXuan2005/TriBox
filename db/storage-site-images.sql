-- ─────────────────────────────────────────────────────────────────────────
-- Supabase Storage: "site-images" bucket
--
-- Stores user-uploaded images used by the website Editor's Image block.
-- Files are stored under `<site_id>/<timestamp>-<filename>`.
--
-- Setup via the Supabase Dashboard (recommended for the bucket itself):
--   Storage → New bucket → name: "site-images" → toggle "Public bucket" ON.
--
-- Then run the policies below in the SQL editor. (Creating the bucket via SQL
-- is also shown for completeness — skip the INSERT if you made it in the UI.)
-- ─────────────────────────────────────────────────────────────────────────

-- Create the public bucket (id == name). Safe to re-run.
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Anyone (anon + authenticated) can READ objects in this bucket.
-- A public bucket already serves files over its public URL; this policy makes
-- the read intent explicit and covers API-level SELECTs.
CREATE POLICY "site-images public read"
ON storage.objects
FOR SELECT
TO public
USING ( bucket_id = 'site-images' );

-- Authenticated users can UPLOAD into the bucket.
CREATE POLICY "site-images authenticated upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'site-images' );

-- Authenticated users can REPLACE (upsert / overwrite) objects.
CREATE POLICY "site-images authenticated update"
ON storage.objects
FOR UPDATE
TO authenticated
USING ( bucket_id = 'site-images' )
WITH CHECK ( bucket_id = 'site-images' );

-- Authenticated users can DELETE objects (used by the "Remove" action if you
-- later choose to purge the underlying file).
CREATE POLICY "site-images authenticated delete"
ON storage.objects
FOR DELETE
TO authenticated
USING ( bucket_id = 'site-images' );
