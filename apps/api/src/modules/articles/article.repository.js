import { pool } from '../../db/pool.js';

const publicFields = `
  a.id, a.slug, a.title, a.subtitle, a.excerpt, a.cover_image_url,
  a.blocks, a.schema_version, a.published_at, a.updated_at,
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
    values.push(cursor);
    cursorClause = `AND a.published_at < $2::timestamptz`;
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
  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.published_at ?? null : null
  };
}
