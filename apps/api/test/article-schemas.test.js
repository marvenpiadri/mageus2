import test from 'node:test';
import assert from 'node:assert/strict';
import { articleBlockSchema, articleBlocksSchema, articleDraftInputSchema } from '../src/modules/articles/article.schemas.js';

test('accepts a valid text block with a stable identity and schema version', () => {
  const result = articleBlockSchema.safeParse({ id: 'block-a', version: 1, type: 'text', html: '<p>Hello</p>' });
  assert.equal(result.success, true);
});

test('rejects unknown block types instead of silently persisting unrenderable content', () => {
  const result = articleBlockSchema.safeParse({ id: 'x', version: 1, type: 'mystery', payload: {} });
  assert.equal(result.success, false);
});

test('bounds document size to 300 blocks', () => {
  const blocks = Array.from({ length: 301 }, (_, i) => ({ id: `text-${i}`, version: 1, type: 'text', html: 'x' }));
  assert.equal(articleBlocksSchema.safeParse(blocks).success, false);
});

test('accepts a draft with empty blocks while requiring a title', () => {
  assert.equal(articleDraftInputSchema.safeParse({ title: 'Draft', blocks: [] }).success, true);
  assert.equal(articleDraftInputSchema.safeParse({ title: '   ', blocks: [] }).success, false);
});

test('rejects unsafe image URL schemes', () => {
  const result = articleBlockSchema.safeParse({
    id: 'image-a', version: 1, type: 'image', imageUrl: 'javascript:alert(1)', alt: '', width: 'normal'
  });
  assert.equal(result.success, false);
});
