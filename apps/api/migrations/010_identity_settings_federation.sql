-- Mageus account settings and federated identities.
-- Identity providers and cross-application connections.
-- External identities are linked only after a provider callback has been verified.
CREATE TABLE IF NOT EXISTS user_external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'facebook', 'dollareus_oidc')),
  provider_subject text NOT NULL,
  provider_email text,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS user_external_identities_user_idx
  ON user_external_identities (user_id, created_at);

-- Preferences are kept separate from public profile data.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'UTC',
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  profile_visibility text NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private')),
  discoverable_by_email boolean NOT NULL DEFAULT false,
  email_notifications boolean NOT NULL DEFAULT true,
  push_notifications boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Records which external application a user has explicitly connected.
-- Revoking this row disconnects the UI integration; OAuth tokens/sessions are separately revocable.
CREATE TABLE IF NOT EXISTS connected_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application text NOT NULL CHECK (application IN ('dollareus', 'mageus')),
  external_user_id text,
  external_username text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  UNIQUE (user_id, application)
);
CREATE INDEX IF NOT EXISTS connected_applications_active_idx
  ON connected_applications (user_id, application) WHERE disconnected_at IS NULL;

-- OAuth/OIDC authorization-code flow records. Store only hashes of one-time codes.
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  nonce text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expiry_idx
  ON oauth_authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id text PRIMARY KEY,
  application text NOT NULL CHECK (application IN ('mageus', 'dollareus')),
  client_name text NOT NULL,
  redirect_uris text[] NOT NULL,
  allowed_scopes text[] NOT NULL DEFAULT ARRAY['openid','profile','email']::text[],
  is_confidential boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(redirect_uris) > 0)
);
