-- Account-level subscription status.
--
-- "Pro" is a property of the *account* (Supabase auth user), not of an
-- individual site. This table is the source of truth for "is this user Pro".
-- The legacy sites.subscription_tier column is kept in sync for now so existing
-- per-site code (e.g. the AI usage gate) keeps working.
--
-- Reuses the subscription_tier enum created in schema.sql.
CREATE TABLE IF NOT EXISTS profiles (
    user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_tier  subscription_tier NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill: every existing auth user starts on the free plan.
INSERT INTO profiles (user_id, subscription_tier)
SELECT id, 'free' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
