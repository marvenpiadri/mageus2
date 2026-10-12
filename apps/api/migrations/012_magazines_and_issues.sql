-- Editorial collections: magazines are persistent publications; issues are dated/numbered editions.
CREATE TABLE IF NOT EXISTS magazines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archival')),
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT magazines_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT published_magazines_have_timestamp CHECK (status <> 'published' OR published_at IS NOT NULL),
  UNIQUE (channel_id, slug),
  UNIQUE (id, channel_id)
);
CREATE INDEX IF NOT EXISTS magazines_publication_idx
  ON magazines (published_at DESC, id DESC) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS magazine_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  magazine_id uuid NOT NULL REFERENCES magazines(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  issue_number integer NOT NULL CHECK (issue_number > 0),
  summary text NOT NULL DEFAULT '',
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archival')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT magazine_issues_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT published_issues_have_timestamp CHECK (status <> 'published' OR published_at IS NOT NULL),
  UNIQUE (magazine_id, slug),
  UNIQUE (magazine_id, issue_number),
  UNIQUE (id, magazine_id)
);
CREATE INDEX IF NOT EXISTS magazine_issues_publication_idx
  ON magazine_issues (magazine_id, published_at DESC, issue_number DESC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS magazine_issue_articles (
  issue_id uuid NOT NULL REFERENCES magazine_issues(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  section_title text NOT NULL DEFAULT '',
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, article_id)
);
CREATE INDEX IF NOT EXISTS magazine_issue_articles_order_idx
  ON magazine_issue_articles (issue_id, sort_order, added_at);
