-- Mageus local PostgreSQL bootstrap schema.
-- Generated from migrations 001-009 plus migration 010 identity/settings tables.
-- For an empty local database: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/mageus-local-postgres.sql
-- This file is a fresh-database bootstrap, not an incremental migration for an existing DB.

-- ===== 001_initial_publishing.sql =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
  CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._-]{1,29}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channels_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._-]{1,29}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS channels_username_unique ON channels (username);

CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  cover_image_url text,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archival')),
  seo_title text,
  seo_description text,
  canonical_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT articles_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT published_articles_have_timestamp CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT articles_channel_slug_unique UNIQUE (channel_id, slug)
);
CREATE INDEX IF NOT EXISTS articles_publication_feed_idx
  ON articles (published_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS articles_channel_status_idx
  ON articles (channel_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS article_likes (
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

CREATE TABLE IF NOT EXISTS article_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES article_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS article_comments_thread_idx
  ON article_comments (article_id, created_at) WHERE status = 'visible';

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  storage_key text NOT NULL UNIQUE,
  public_url text,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width integer,
  height integer,
  alt_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ===== 002_auth_sessions.sql =====
CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;


-- ===== 003_article_revisions.sql =====
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

-- Drafts may coexist with the published version of the same slug. Public URLs remain unique.
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_channel_slug_unique;
CREATE UNIQUE INDEX IF NOT EXISTS articles_channel_published_slug_unique
  ON articles (channel_id, slug) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS articles_channel_drafts_updated_idx
  ON articles (channel_id, updated_at DESC) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS article_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL,
  edited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, revision)
);
CREATE INDEX IF NOT EXISTS article_revisions_article_history_idx
  ON article_revisions (article_id, revision DESC);


-- ===== 004_article_jsonb_document.sql =====
-- Keep a complete, versioned article payload in JSONB while retaining relational
-- columns for ownership checks, indexing, and public URL lookups.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS document jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION sync_article_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.document := jsonb_build_object(
    'article_id', NEW.id,
    'title', NEW.title,
    'sub_title', NEW.subtitle,
    'image', NEW.cover_image_url,
    'slug', NEW.slug,
    'excerpt', NEW.excerpt,
    'category', NEW.category,
    'language', NEW.language,
    'tags', to_jsonb(NEW.tags),
    'blocks', NEW.blocks,
    'schema_version', NEW.schema_version,
    'status', NEW.status,
    'seo_title', NEW.seo_title,
    'seo_description', NEW.seo_description,
    'canonical_url', NEW.canonical_url,
    'published_at', NEW.published_at,
    'revision', NEW.revision,
    'created_at', NEW.created_at,
    'updated_at', NEW.updated_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS articles_sync_document ON articles;
CREATE TRIGGER articles_sync_document
BEFORE INSERT OR UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION sync_article_document();

-- Backfill existing rows using the same trigger-backed canonical document.
UPDATE articles SET updated_at = updated_at;


-- ===== 005_keep_article_metadata_relational.sql =====
-- Correct the accidental whole-article JSONB document design.
-- Article content blocks alone use JSONB; metadata and relationships remain relational.
DROP TRIGGER IF EXISTS articles_sync_document ON articles;
DROP FUNCTION IF EXISTS sync_article_document();
ALTER TABLE articles DROP COLUMN IF EXISTS document;

COMMENT ON COLUMN articles.blocks IS
  'Typed article content blocks stored as JSONB. Article metadata and relations remain in relational columns/tables.';


-- ===== 006_revision_blocks_jsonb_only.sql =====
-- Keep article revision metadata relational too. Only each revision's modular
-- Studio content blocks are JSONB, matching the articles table.
ALTER TABLE article_revisions
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS excerpt text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Preserve any existing history while moving its fields into normal columns.
UPDATE article_revisions
SET slug = COALESCE(slug, snapshot->>'slug'),
    title = COALESCE(title, snapshot->>'title'),
    subtitle = COALESCE(subtitle, snapshot->>'subtitle'),
    excerpt = COALESCE(excerpt, snapshot->>'excerpt'),
    category = COALESCE(category, snapshot->>'category'),
    language = COALESCE(language, snapshot->>'language'),
    tags = CASE
      WHEN snapshot ? 'tags' AND jsonb_typeof(snapshot->'tags') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(snapshot->'tags'))
      ELSE tags
    END,
    cover_image_url = COALESCE(cover_image_url, snapshot->>'cover_image_url'),
    blocks = CASE
      WHEN snapshot ? 'blocks' AND jsonb_typeof(snapshot->'blocks') = 'array'
        THEN snapshot->'blocks'
      ELSE blocks
    END,
    schema_version = COALESCE((snapshot->>'schema_version')::integer, schema_version),
    status = COALESCE(status, snapshot->>'status'),
    seo_title = COALESCE(seo_title, snapshot->>'seo_title'),
    seo_description = COALESCE(seo_description, snapshot->>'seo_description'),
    canonical_url = COALESCE(canonical_url, snapshot->>'canonical_url'),
    published_at = COALESCE((snapshot->>'published_at')::timestamptz, published_at)
WHERE snapshot IS NOT NULL;

ALTER TABLE article_revisions DROP COLUMN IF EXISTS snapshot;


-- ===== 007_article_schema_guardrails.sql =====
-- Strengthen the relational publishing model without changing its shape.
-- Article Studio modules stay flexible JSONB arrays; all metadata remains relational.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'articles_blocks_must_be_array'
      AND conrelid = 'articles'::regclass
  ) THEN
    ALTER TABLE articles
      ADD CONSTRAINT articles_blocks_must_be_array
      CHECK (jsonb_typeof(blocks) = 'array') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'article_revisions_blocks_must_be_array'
      AND conrelid = 'article_revisions'::regclass
  ) THEN
    ALTER TABLE article_revisions
      ADD CONSTRAINT article_revisions_blocks_must_be_array
      CHECK (jsonb_typeof(blocks) = 'array') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'article_revisions_schema_version_positive'
      AND conrelid = 'article_revisions'::regclass
  ) THEN
    ALTER TABLE article_revisions
      ADD CONSTRAINT article_revisions_schema_version_positive
      CHECK (schema_version > 0) NOT VALID;
  END IF;
END $$;

-- Validate after installation so existing rows are checked, not just new writes.
ALTER TABLE articles VALIDATE CONSTRAINT articles_blocks_must_be_array;
ALTER TABLE article_revisions VALIDATE CONSTRAINT article_revisions_blocks_must_be_array;
ALTER TABLE article_revisions VALIDATE CONSTRAINT article_revisions_schema_version_positive;

-- Support common ownership, tag-filtering, and threaded-comment queries.
CREATE INDEX IF NOT EXISTS channels_owner_updated_idx
  ON channels (owner_user_id, updated_at DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS articles_tags_gin_idx
  ON articles USING gin (tags);

CREATE INDEX IF NOT EXISTS article_revisions_editor_history_idx
  ON article_revisions (edited_by, created_at DESC)
  WHERE edited_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS article_comments_parent_thread_idx
  ON article_comments (article_id, parent_comment_id, created_at)
  WHERE status = 'visible';

CREATE INDEX IF NOT EXISTS media_assets_owner_created_idx
  ON media_assets (owner_user_id, created_at DESC)
  WHERE owner_user_id IS NOT NULL;


-- ===== 008_article_votes.sql =====
-- A user's 0–100 rating is a single mutable vote per published article.
-- Keep ratings relational: this is engagement data, not article-block JSONB.
CREATE TABLE IF NOT EXISTS article_votes (
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

CREATE INDEX IF NOT EXISTS article_votes_article_value_idx
  ON article_votes (article_id, value);


-- ===== 009_social_business_foundation.sql =====
-- Social identity and business structures for Mageus.
-- Public-facing content belongs to a channel; authenticated actions belong to a user.
CREATE TABLE IF NOT EXISTS channel_follows (
  follower_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, followed_channel_id)
);
CREATE INDEX IF NOT EXISTS channel_follows_followed_idx
  ON channel_follows (followed_channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS channel_follows_follower_idx
  ON channel_follows (follower_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('follow', 'like', 'comment', 'vote', 'mention', 'publication', 'system')),
  entity_type text CHECK (entity_type IS NULL OR entity_type IN ('channel', 'article', 'comment', 'product', 'service', 'menu', 'video', 'magazine')),
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx
  ON notifications (recipient_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (recipient_user_id, created_at DESC) WHERE read_at IS NULL;

-- Store a server-generated, non-reversible visitor hash rather than exposing raw IPs in analytics.
CREATE TABLE IF NOT EXISTS content_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('channel', 'article', 'shop', 'product', 'service', 'menu', 'video', 'magazine')),
  content_id uuid NOT NULL,
  viewer_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  anonymous_visitor_hash text,
  referrer_host text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_views_viewer_present CHECK (viewer_user_id IS NOT NULL OR anonymous_visitor_hash IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS content_views_content_time_idx
  ON content_views (content_type, content_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS content_views_channel_time_idx
  ON content_views (channel_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS content_views_user_time_idx
  ON content_views (viewer_user_id, viewed_at DESC) WHERE viewer_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS business_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  address text NOT NULL DEFAULT '',
  google_place_id text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  phone text,
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(opening_hours) = 'object'),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_locations_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT business_locations_coordinates CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  UNIQUE (channel_id, slug),
  UNIQUE (id, channel_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS business_locations_google_place_unique
  ON business_locations (channel_id, google_place_id) WHERE google_place_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS business_locations_one_primary_idx
  ON business_locations (channel_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  location_id uuid REFERENCES business_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  fulfillment_type text NOT NULL DEFAULT 'online' CHECK (fulfillment_type IN ('physical', 'online', 'hybrid')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storefronts_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  UNIQUE (channel_id, slug)
);
CREATE INDEX IF NOT EXISTS storefronts_channel_status_idx
  ON storefronts (channel_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS storefronts_location_idx
  ON storefronts (location_id) WHERE location_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_id uuid NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  price_amount numeric(12,2) CHECK (price_amount IS NULL OR price_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_products_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  UNIQUE (storefront_id, slug)
);
CREATE INDEX IF NOT EXISTS store_products_public_idx
  ON store_products (storefront_id, created_at DESC) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS store_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_id uuid NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  price_amount numeric(12,2) CHECK (price_amount IS NULL OR price_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  booking_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_services_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  UNIQUE (storefront_id, slug)
);
CREATE INDEX IF NOT EXISTS store_services_public_idx
  ON store_services (storefront_id, created_at DESC) WHERE status = 'published';

-- Each menu belongs to one specific location, avoiding a single oversized menu for a whole chain.
CREATE TABLE IF NOT EXISTS location_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  pdf_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_menus_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  UNIQUE (location_id, slug),
  CONSTRAINT location_menus_same_channel FOREIGN KEY (location_id, channel_id)
    REFERENCES business_locations(id, channel_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS location_menus_public_idx
  ON location_menus (location_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS location_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES location_menus(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  price_amount numeric(12,2) CHECK (price_amount IS NULL OR price_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  category text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS location_menu_items_order_idx
  ON location_menu_items (menu_id, sort_order, created_at);


-- ===== 010_identity_settings_federation.sql =====
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


-- Helpful account/profile defaults for existing and new users.
INSERT INTO user_settings (user_id) SELECT id FROM users ON CONFLICT (user_id) DO NOTHING;
