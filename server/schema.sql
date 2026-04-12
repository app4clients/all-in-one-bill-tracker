CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  phone_number TEXT,
  username TEXT,
  username_normalized TEXT,
  email TEXT,
  email_normalized TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username_normalized TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_normalized TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_username_normalized
  ON app_users(username_normalized)
  WHERE username_normalized IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_email_normalized
  ON app_users(email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'google_play'),
  product_id TEXT NOT NULL,
  purchase_token TEXT NOT NULL UNIQUE,
  base_plan_id TEXT,
  offer_id TEXT,
  latest_order_id TEXT,
  subscription_state TEXT NOT NULL,
  is_auto_renewing BOOLEAN NOT NULL DEFAULT FALSE,
  is_refunded BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);

CREATE TABLE IF NOT EXISTS billing_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  provider TEXT NOT NULL CHECK (provider = 'google_play'),
  event_type TEXT NOT NULL,
  purchase_token TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_rejection_events (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  username_normalized TEXT,
  email_normalized TEXT,
  phone_number TEXT,
  ip_address TEXT,
  user_agent TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rejections_created_at ON auth_rejection_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_rejections_reason ON auth_rejection_events(reason_code);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash);