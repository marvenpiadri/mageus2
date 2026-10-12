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
