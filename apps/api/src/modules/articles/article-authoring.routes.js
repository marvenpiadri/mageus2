import { Router } from 'express';
import { z } from 'zod';
import { pool, requireDatabase } from '../../db/pool.js';
import { requireVerifiedIdentity } from '../auth/auth.service.js';
import { articleBlocksSchema, articleDraftInputSchema, articleDraftPatchSchema } from './article.schemas.js';

export const articleAuthoringRoutes = Router();
articleAuthoringRoutes.use(requireDatabase);

const uuid = z.string().uuid();
const articleColumns = `
  id, channel_id, slug, title, subtitle, excerpt, category, language, tags,
  cover_image_url, blocks, schema_version, status, seo_title, seo_description,
  canonical_url, published_at, created_at, updated_at, revision
`;
const publicArticleFields = `
  a.id, a.slug, a.title, a.subtitle, a.excerpt, a.category, a.language, a.tags, a.cover_image_url,
  a.blocks, a.schema_version, a.status, a.seo_title, a.seo_description,
  a.canonical_url, a.published_at, a.created_at, a.updated_at, a.revision,
  c.username AS author_username, c.display_name AS author_name
`;

function slugify(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180).replace(/-+$/g, '');
}
function dto(row) {
  return {
    id: row.id, channelId: row.channel_id, slug: row.slug, title: row.title,
    subtitle: row.subtitle, excerpt: row.excerpt, category: row.category, language: row.language,
    tags: row.tags, coverImageUrl: row.cover_image_url, blocks: row.blocks,
    schemaVersion: row.schema_version, status: row.status, seoTitle: row.seo_title,
    seoDescription: row.seo_description, canonicalUrl: row.canonical_url,
    publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at,
    revision: row.revision
  };
}
async function snapshotRevision(client, row, userId) {
  await client.query(
    `INSERT INTO article_revisions (article_id, revision, snapshot, edited_by)
     VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (article_id, revision) DO NOTHING`,
    [row.id, row.revision ?? 1, JSON.stringify(row), userId]
  );
}
function publicationIssues(article) {
  const issues = [];
  if (!article.title?.trim()) issues.push('An article title is required.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug ?? '')) issues.push('Use a valid lowercase public URL slug.');
  const validUrl = (value) => {
    try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; }
    catch { return false; }
  };
  if (article.cover_image_url && !validUrl(article.cover_image_url)) issues.push('The cover image URL must use HTTP or HTTPS.');
  if (article.canonical_url && !validUrl(article.canonical_url)) issues.push('The canonical URL must use HTTP or HTTPS.');
  if (!Array.isArray(article.blocks) || !article.blocks.length) issues.push('Add at least one content block.');
  const parsed = articleBlocksSchema.safeParse(article.blocks);
  if (!parsed.success) issues.push('One or more blocks have invalid data. Review the affected blocks.');
  if (parsed.success) for (const [index, block] of parsed.data.entries()) {
    const label = `Block ${index + 1}`;
    if (block.type === 'text' && !block.html.replace(/<[^>]*>/g, '').trim()) issues.push(`${label}: add text content.`);
    if (block.type === 'image' && (!block.imageUrl.trim() || !block.alt.trim())) issues.push(`${label}: add an image and its alternative text.`);
    if (block.type === 'gallery' && (!block.images.length || block.images.some((image) => !image.url.trim() || !image.alt.trim()))) issues.push(`${label}: add gallery images with URLs and alternative text.`);
    if (block.type === 'slide' && (!block.slides.length || block.slides.some((slide) => !slide.imageUrl.trim()))) issues.push(`${label}: add at least one slide with an image.`);
    if (block.type === 'quote' && !block.quote.trim()) issues.push(`${label}: add the quotation text.`);
    if (block.type === 'embed' && !validUrl(block.url)) issues.push(`${label}: enter a valid HTTP(S) URL.`);
    if (block.type === 'before_after' && (!validUrl(block.beforeImage) || !validUrl(block.afterImage))) issues.push(`${label}: add valid before and after image URLs.`);
    if (block.type === 'hotspot' && (!validUrl(block.imageUrl) || !block.points.length || block.points.some((point) => !point.title.trim()))) issues.push(`${label}: add a valid base image and titled hotspots.`);
    if (block.type === 'timeline' && (!block.events.length || block.events.some((event) => !event.title.trim()))) issues.push(`${label}: add at least one titled timeline event.`);
    if (block.type === 'steps' && (!block.steps.length || block.steps.some((step) => !step.title.trim()))) issues.push(`${label}: add at least one titled step.`);
    if (block.type === 'data_viz' && (!block.values.length || block.values.some((item) => !item.label.trim() || !Number.isFinite(item.value)))) issues.push(`${label}: add labelled finite data values.`);
    if (block.type === 'math' && !block.formula.trim()) issues.push(`${label}: add the formula.`);
    if (block.type === 'product' && !block.productId.trim()) issues.push(`${label}: select a product reference.`);
    if (block.type === 'product_collection' && !block.productIds.some((value) => value.trim())) issues.push(`${label}: select at least one product reference.`);
    if (block.type === 'magazine_ref' && !block.magazineId.trim()) issues.push(`${label}: select a magazine reference.`);
  }
  return issues;
}

articleAuthoringRoutes.get('/mine', requireVerifiedIdentity, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${publicArticleFields}
         FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE c.owner_user_id = $1 ORDER BY a.updated_at DESC LIMIT 200`,
      [req.auth.userId]
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ articles: rows });
  } catch (error) { next(error); }
});

articleAuthoringRoutes.post('/', requireVerifiedIdentity, async (req, res, next) => {
  const parsed = articleDraftInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_ARTICLE', message: 'Article metadata or blocks are invalid.' } });
  const data = parsed.data;
  const slug = data.slug || slugify(data.title) || `story-${Date.now()}`;
  try {
    const { rows } = await pool.query(
      `INSERT INTO articles (
         channel_id, slug, title, subtitle, excerpt, category, language, tags, cover_image_url, blocks,
         schema_version, status, seo_title, seo_description, canonical_url, revision
       )
       SELECT c.id, $2, $3, $4, $5, $6, $7, $8::text[], NULLIF($9, ''), $10::jsonb, $11, 'draft', $12, $13, NULLIF($14, ''), 1
         FROM channels c WHERE c.owner_user_id = $1 ORDER BY c.created_at ASC LIMIT 1
       RETURNING ${articleColumns}`,
      [req.auth.userId, slug, data.title, data.subtitle, data.excerpt, data.category, data.language, data.tags,
       data.coverImageUrl, JSON.stringify(data.blocks), data.schemaVersion, data.seoTitle ?? null,
       data.seoDescription ?? null, data.canonicalUrl ?? '']
    );
    if (!rows[0]) return res.status(409).json({ error: { code: 'CHANNEL_REQUIRED', message: 'Create a channel before writing an article.' } });
    return res.status(201).json({ article: dto(rows[0]) });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'SLUG_EXISTS', message: 'This URL is already published on your channel.' } });
    next(error);
  }
});

articleAuthoringRoutes.patch('/:articleId', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  const parsed = articleDraftPatchSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_ARTICLE', message: 'Include expectedRevision and valid article fields.' } });
  const { expectedRevision, ...patch } = parsed.data;
  if (!Object.keys(patch).length) return res.status(400).json({ error: { code: 'EMPTY_PATCH', message: 'Provide at least one field to update.' } });

  const columns = {
    title: 'title', subtitle: 'subtitle', slug: 'slug', excerpt: 'excerpt', category: 'category',
    language: 'language', tags: 'tags', coverImageUrl: 'cover_image_url', blocks: 'blocks',
    schemaVersion: 'schema_version', seoTitle: 'seo_title', seoDescription: 'seo_description', canonicalUrl: 'canonical_url'
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT a.* FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE a.id = $1 AND c.owner_user_id = $2 FOR UPDATE OF a`,
      [id.data, req.auth.userId]
    );
    const current = selected.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    }
    if (current.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'DRAFT_REQUIRED', message: 'Fork the published article to edit without changing the public version.' } });
    }
    if (current.revision !== expectedRevision) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'REVISION_CONFLICT', message: 'This draft changed elsewhere. Reload before saving.', currentRevision: current.revision } });
    }
    await snapshotRevision(client, current, req.auth.userId);
    const values = [id.data];
    const sets = [];
    for (const [key, column] of Object.entries(columns)) {
      if (!Object.hasOwn(patch, key)) continue;
      let value = patch[key];
      if (key === 'blocks') value = JSON.stringify(value);
      if (key === 'coverImageUrl' || key === 'canonicalUrl') value = value || null;
      values.push(value);
      sets.push(`${column} = $${values.length}${key === 'blocks' ? '::jsonb' : ''}`);
    }
    sets.push('revision = revision + 1', 'updated_at = now()');
    const { rows } = await client.query(`UPDATE articles SET ${sets.join(', ')} WHERE id = $1 RETURNING ${articleColumns}`, values);
    await client.query('COMMIT');
    return res.json({ article: dto(rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') return res.status(409).json({ error: { code: 'SLUG_EXISTS', message: 'This URL is already in use.' } });
    next(error);
  } finally { client.release(); }
});

articleAuthoringRoutes.post('/:articleId/fork', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const source = await pool.query(
      `SELECT a.* FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE a.id = $1 AND c.owner_user_id = $2 AND a.status = 'published' LIMIT 1`,
      [id.data, req.auth.userId]
    );
    const live = source.rows[0];
    if (!live) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Published article not found.' } });
    const { rows } = await pool.query(
      `INSERT INTO articles (
         channel_id, slug, title, subtitle, excerpt, category, language, tags, cover_image_url, blocks,
         schema_version, status, seo_title, seo_description, canonical_url, revision
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'draft',$12,$13,$14,1)
       RETURNING ${articleColumns}`,
      [live.channel_id,live.slug,live.title,live.subtitle,live.excerpt,live.category,live.language,live.tags,
       live.cover_image_url,JSON.stringify(live.blocks),live.schema_version,live.seo_title,live.seo_description,live.canonical_url]
    );
    return res.status(201).json({ article: dto(rows[0]) });
  } catch (error) { next(error); }
});

articleAuthoringRoutes.post('/:articleId/publish', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  const expected = z.object({ expectedRevision: z.number().int().positive() }).safeParse(req.body ?? {});
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  if (!expected.success) return res.status(400).json({ error: { code: 'INVALID_REVISION', message: 'Include the current expectedRevision.' } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT a.*, c.username AS author_username FROM articles a JOIN channels c ON c.id = a.channel_id
        WHERE a.id = $1 AND c.owner_user_id = $2 FOR UPDATE OF a`,
      [id.data, req.auth.userId]
    );
    const draft = selected.rows[0];
    if (!draft || draft.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'DRAFT_NOT_FOUND', message: 'Editable draft not found.' } });
    }
    if (draft.revision !== expected.data.expectedRevision) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: { code: 'REVISION_CONFLICT', message: 'This draft changed elsewhere. Reload before publishing.', currentRevision: draft.revision } });
    }
    const issues = publicationIssues(draft);
    if (issues.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: { code: 'PUBLISH_VALIDATION_FAILED', message: 'The article needs attention before publishing.', issues } });
    }
    await snapshotRevision(client, draft, req.auth.userId);
    const collision = await client.query(
      `SELECT a.* FROM articles a WHERE a.channel_id=$1 AND a.slug=$2 AND a.status='published' FOR UPDATE`,
      [draft.channel_id, draft.slug]
    );
    let published;
    if (collision.rows[0]) {
      const live = collision.rows[0];
      await snapshotRevision(client, live, req.auth.userId);
      const updated = await client.query(
        `UPDATE articles SET title=$2, subtitle=$3, excerpt=$4, category=$5, language=$6, tags=$7,
            cover_image_url=$8, blocks=$9::jsonb, schema_version=$10, seo_title=$11,
            seo_description=$12, canonical_url=$13, revision=revision+1, updated_at=now(), published_at=now()
          WHERE id=$1 RETURNING ${articleColumns}`,
        [live.id,draft.title,draft.subtitle,draft.excerpt,draft.category,draft.language,draft.tags,
         draft.cover_image_url,JSON.stringify(draft.blocks),draft.schema_version,draft.seo_title,draft.seo_description,draft.canonical_url]
      );
      published = updated.rows[0];
      await client.query('DELETE FROM articles WHERE id=$1', [draft.id]);
    } else {
      const updated = await client.query(
        `UPDATE articles SET status='published', published_at=now(), revision=revision+1, updated_at=now()
          WHERE id=$1 RETURNING ${articleColumns}`,
        [draft.id]
      );
      published = updated.rows[0];
    }
    await client.query('COMMIT');
    const author = await pool.query('SELECT username FROM channels WHERE id=$1', [published.channel_id]);
    return res.json({ article: dto(published), publicPath: `/${author.rows[0]?.username ?? ''}/${published.slug}` });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

articleAuthoringRoutes.delete('/:articleId', requireVerifiedIdentity, async (req, res, next) => {
  const id = uuid.safeParse(req.params.articleId);
  if (!id.success) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
  try {
    const { rows } = await pool.query(
      `UPDATE articles a SET status = 'archival', updated_at = now(), revision = revision + 1
         FROM channels c WHERE a.id = $1 AND c.id = a.channel_id AND c.owner_user_id = $2
       RETURNING a.id`,
      [id.data, req.auth.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    return res.status(204).end();
  } catch (error) { next(error); }
});
