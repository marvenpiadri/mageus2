import { Router } from 'express';
import { z } from 'zod';
import { requireDatabase } from '../../db/pool.js';
import { findPublishedArticle, listPublishedArticles } from './article.repository.js';

export const articleRoutes = Router();
const usernamePattern = /^[a-z0-9][a-z0-9._-]{1,29}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

articleRoutes.get('/', requireDatabase, async (req, res, next) => {
  try {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().datetime().optional()
    }).safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'Invalid pagination parameters.' } });
    }
    res.set('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    res.json(await listPublishedArticles(query.data));
  } catch (error) { next(error); }
});

articleRoutes.get('/:username/:slug', requireDatabase, async (req, res, next) => {
  try {
    const username = req.params.username.toLowerCase();
    const slug = req.params.slug.toLowerCase();
    if (!usernamePattern.test(username) || !slugPattern.test(slug)) {
      return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    }
    const article = await findPublishedArticle(username, slug);
    if (!article) {
      return res.status(404).json({ error: { code: 'ARTICLE_NOT_FOUND', message: 'Article not found.' } });
    }
    res.set('Cache-Control', 'public, max-age=30, s-maxage=300, stale-while-revalidate=1800');
    res.set('X-Robots-Tag', 'index, follow');
    res.json({ article });
  } catch (error) { next(error); }
});
