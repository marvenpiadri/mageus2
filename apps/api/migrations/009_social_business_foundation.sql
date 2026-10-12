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
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  UNIQUE (channel_id, slug)
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
  UNIQUE (location_id, slug)
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
