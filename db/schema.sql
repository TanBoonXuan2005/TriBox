CREATE TYPE subscription_tier AS ENUM ('free', 'pro');
CREATE TYPE message_role AS ENUM ('user', 'assistant');

CREATE TABLE sites (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         UUID NOT NULL,
    name             VARCHAR(255) NOT NULL,
    domain_url       VARCHAR(255) NOT NULL,
    api_key          VARCHAR(64)  NOT NULL UNIQUE,
    subscription_tier subscription_tier NOT NULL DEFAULT 'free',
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    slug             TEXT UNIQUE,
    is_published     BOOLEAN NOT NULL DEFAULT FALSE,
    chatbot_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    -- Editor blocks as a JSON array; rendered by GET /s/:slug and digested
    -- into the chat agent's system prompt by POST /api/chat.
    content          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    visitor_id      VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ
);

CREATE INDEX idx_conversations_site_id ON conversations(site_id);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            message_role NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

CREATE TABLE usage_logs (
    id            UUID NOT NULL DEFAULT gen_random_uuid(),
    site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (site_id, date)
);

CREATE INDEX idx_usage_logs_site_id ON usage_logs(site_id);

-- Account-level subscription status, keyed by the Supabase auth user id.
-- Source of truth for "is this user Pro" (the sites.subscription_tier column is
-- kept in sync for legacy per-site code).
CREATE TABLE profiles (
    user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_tier  subscription_tier NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
