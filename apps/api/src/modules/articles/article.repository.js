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
  const article = rows[0] ?? null;
  if (!article || !Array.isArray(article.blocks)) return article;

  const commerceBlocks = article.blocks.filter((block) =>
    block?.type === 'commerce_collection' &&
    ['product', 'service', 'menu_item'].includes(block.itemType) &&
    Array.isArray(block.itemIds)
  );
  const idsByType = new Map();
  for (const block of commerceBlocks) {
    const validIds = block.itemIds.filter((id) =>
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    );
    idsByType.set(block.itemType, [...new Set([...(idsByType.get(block.itemType) ?? []), ...validIds])]);
  }

  const resolvedByType = new Map();
  for (const [type, ids] of idsByType) {
    if (!ids.length) { resolvedByType.set(type, new Map()); continue; }
    let query;
    if (type === 'product') {
      query = await pool.query(
        `SELECT p.id, p.name, p.description, p.image_url, p.price_amount, p.currency
           FROM store_products p
           JOIN storefronts s ON s.id = p.storefront_id
          WHERE p.id = ANY($1::uuid[]) AND p.status = 'published' AND s.status = 'published'
          ORDER BY array_position($1::uuid[], p.id)`,
        [ids]
      );
    } else if (type === 'service') {
      query = await pool.query(
        `SELECT p.id, p.name, p.description, p.image_url, p.price_amount, p.currency
           FROM store_services p
           JOIN storefronts s ON s.id = p.storefront_id
          WHERE p.id = ANY($1::uuid[]) AND p.status = 'published' AND s.status = 'published'
          ORDER BY array_position($1::uuid[], p.id)`,
        [ids]
      );
    } else {
      query = await pool.query(
        `SELECT i.id, i.name, i.description, i.image_url, i.price_amount, i.currency
           FROM location_menu_items i
           JOIN location_menus m ON m.id = i.menu_id
           JOIN business_locations l ON l.id = m.location_id AND l.channel_id = m.channel_id
          WHERE i.id = ANY($1::uuid[]) AND i.is_available = true AND m.status = 'published'
          ORDER BY array_position($1::uuid[], i.id)`,
        [ids]
      );
    }
    resolvedByType.set(type, new Map(query.rows.map((item) => [item.id, item])));
  }

  article.blocks = article.blocks.map((block) => {
    if (block?.type !== 'commerce_collection') return block;
    const lookup = resolvedByType.get(block.itemType) ?? new Map();
    const resolvedItems = (Array.isArray(block.itemIds) ? block.itemIds : [])
      .map((id) => lookup.get(id))
      .filter(Boolean);
    return { ...block, resolvedItems };
  });
  return article;
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
