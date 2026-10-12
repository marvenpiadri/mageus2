-- Correct the accidental whole-article JSONB document design.
-- Article content blocks alone use JSONB; metadata and relationships remain relational.
DROP TRIGGER IF EXISTS articles_sync_document ON articles;
DROP FUNCTION IF EXISTS sync_article_document();
ALTER TABLE articles DROP COLUMN IF EXISTS document;

COMMENT ON COLUMN articles.blocks IS
  'Typed article content blocks stored as JSONB. Article metadata and relations remain in relational columns/tables.';
