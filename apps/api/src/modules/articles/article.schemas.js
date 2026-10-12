import { z } from 'zod';

const base = { id: z.string().min(1).max(128), version: z.number().int().positive().default(1) };
const shortText = z.string().max(2000);
const urlOrEmpty = z.string().max(2048).refine((value) => {
  if (value === '') return true;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch { return false; }
}, 'URL must be a valid HTTP or HTTPS URL.');

export const articleBlockSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('text'), html: z.string().max(100_000) }),
  z.object({ ...base, type: z.literal('heading'), text: z.string().trim().min(1).max(300), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), anchor: z.string().max(120).optional() }),
  z.object({ ...base, type: z.literal('divider'), style: z.enum(['line', 'dots', 'space']) }),
  z.object({ ...base, type: z.literal('callout'), title: shortText.optional(), body: z.string().max(10_000), tone: z.enum(['note', 'tip', 'warning', 'success']) }),
  z.object({ ...base, type: z.literal('table'), headers: z.array(z.string().max(500)).min(1).max(20), rows: z.array(z.array(z.string().max(2_000)).max(20)).max(200), caption: shortText.optional() }),
  z.object({ ...base, type: z.literal('code'), language: z.string().max(32), code: z.string().max(100_000), caption: shortText.optional() }),
  z.object({ ...base, type: z.literal('video'), url: urlOrEmpty, title: z.string().max(500), posterUrl: urlOrEmpty.optional(), caption: shortText.optional() }),
  z.object({ ...base, type: z.literal('audio'), url: urlOrEmpty, title: z.string().max(500), caption: shortText.optional() }),
  z.object({ ...base, type: z.literal('image'), imageUrl: urlOrEmpty, alt: z.string().max(500), caption: shortText.optional(), credit: shortText.optional(), width: z.enum(['normal', 'wide', 'full']) }),
  z.object({ ...base, type: z.literal('gallery'), images: z.array(z.object({ url: urlOrEmpty, alt: z.string().max(500), caption: shortText.optional() })).max(100), layout: z.enum(['grid', 'masonry', 'strip', 'carousel']) }),
  z.object({ ...base, type: z.literal('slide'), slides: z.array(z.object({ imageUrl: urlOrEmpty, label: shortText.optional(), href: urlOrEmpty.optional() })).max(100), ratio: z.enum(['9:16', '1:1', '16:9']) }),
  z.object({ ...base, type: z.literal('quote'), quote: z.string().max(10_000), author: shortText.optional(), citation: shortText.optional() }),
  z.object({ ...base, type: z.literal('embed'), url: urlOrEmpty, provider: shortText.optional(), title: shortText.optional() }),
  z.object({ ...base, type: z.literal('before_after'), beforeImage: urlOrEmpty, afterImage: urlOrEmpty, beforeLabel: shortText.optional(), afterLabel: shortText.optional() }),
  z.object({ ...base, type: z.literal('hotspot'), imageUrl: urlOrEmpty, points: z.array(z.object({ id: z.string().min(1).max(128), x: z.number().min(0).max(100), y: z.number().min(0).max(100), title: shortText, description: z.string().max(5000) })).max(100) }),
  z.object({ ...base, type: z.literal('timeline'), title: shortText.optional(), events: z.array(z.object({ date: shortText, title: shortText, description: z.string().max(5000) })).max(200) }),
  z.object({ ...base, type: z.literal('steps'), title: shortText.optional(), steps: z.array(z.object({ title: shortText, description: z.string().max(5000) })).max(200) }),
  z.object({ ...base, type: z.literal('data_viz'), title: shortText.optional(), chartType: z.enum(['bar', 'progress', 'kpi', 'comparison', 'table']), values: z.array(z.object({ label: shortText, value: z.number().finite() })).max(500) }),
  z.object({ ...base, type: z.literal('math'), formula: z.string().max(10_000), explanation: z.string().max(10_000).optional() }),
  z.object({ ...base, type: z.literal('product'), productId: z.string().max(256), displayMode: z.enum(['card', 'compact', 'featured']) }),
  z.object({ ...base, type: z.literal('product_collection'), productIds: z.array(z.string().max(256)).max(100), title: shortText.optional(), layout: z.enum(['grid', 'carousel', 'list']) }),
  z.object({ ...base, type: z.literal('magazine_ref'), magazineId: z.string().max(256) })
]);

// Stable, unique IDs are required for reliable Studio editing, reordering, and rendering.
export const articleBlocksSchema = z.array(articleBlockSchema).max(300).superRefine((blocks, ctx) => {
  const seen = new Set();
  for (const [index, block] of blocks.entries()) {
    if (seen.has(block.id)) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: 'Each article block must have a unique ID.'
      });
    }
    seen.add(block.id);
  }
});
export const articleDraftInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  subtitle: z.string().max(500).default(''),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  excerpt: z.string().max(1000).default(''),
  category: z.string().max(100).default(''),
  language: z.string().trim().min(2).max(20).default('en'),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  coverImageUrl: urlOrEmpty.default(''),
  blocks: articleBlocksSchema.default([]),
  schemaVersion: z.number().int().positive().default(1),
  seoTitle: z.string().max(240).optional(),
  seoDescription: z.string().max(500).optional(),
  canonicalUrl: urlOrEmpty.optional()
});
export const articleDraftPatchSchema = articleDraftInputSchema.partial().extend({ expectedRevision: z.number().int().positive() });
