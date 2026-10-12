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
