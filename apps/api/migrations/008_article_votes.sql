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
