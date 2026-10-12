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
