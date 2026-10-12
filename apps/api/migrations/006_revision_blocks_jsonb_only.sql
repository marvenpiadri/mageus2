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
