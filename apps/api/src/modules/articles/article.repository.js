import { pool } from '../../db/pool.js';

const publicFields = `
  a.id, a.slug, a.title, a.subtitle, a.excerpt, a.category, a.language, a.tags, a.cover_image_url,
  a.blocks, a.schema_version, a.published_at, a.updated_at,
  a.seo_title, a.seo_description, a.canonical_url,
  c.username AS author_username, c.display_name AS author_name,
  c.avatar_url AS author_avatar_url
`;

export async function findPublishedArticle(username, slug) {
  const { rows } = await pool.query(
    `SELECT ${publicFields}
       FROM articles a
       JOIN channels c ON c.id = a.channel_id
      WHERE c.username = $1
        AND a.slug = $2
        AND a.status = 'published'
        AND a.published_at IS NOT NULL
      LIMIT 1`,
    [username, slug]
  );
  return rows[0] ?? null;
}

export async function listPublishedArticles({ limit, cursor }) {
  const values = [limit + 1];
  let cursorClause = '';
  if (cursor) {
    let decoded;
    try { decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { decoded = null; }
    if (!decoded || typeof decoded.publishedAt !== 'string' ||
        !Number.isFinite(Date.parse(decoded.publishedAt)) ||
        typeof decoded.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.id)) {
      const error = new Error('Invalid article pagination cursor.');
      error.name = 'InvalidCursorError';
      throw error;
    }
    values.push(decoded.publishedAt, decoded.id);
    cursorClause = `AND (a.published_at, a.id) < ($2::timestamptz, $3::uuid)`;
  }

  const { rows } = await pool.query(
    `SELECT ${publicFields}
       FROM articles a
       JOIN channels c ON c.id = a.channel_id
      WHERE a.status = 'published'
        AND a.published_at IS NOT NULL
        ${cursorClause}
      ORDER BY a.published_at DESC, a.id DESC
      LIMIT $1`,
    values
  );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? Buffer.from(JSON.stringify({ publishedAt: last.published_at, id: last.id })).toString('base64url')
      : null
  };
}
