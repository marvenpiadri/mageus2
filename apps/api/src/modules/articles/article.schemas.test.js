import test from 'node:test';
import assert from 'node:assert/strict';
import {
  articleBlockSchema, articleBlocksSchema, articleDraftInputSchema, articleDraftPatchSchema
} from './article.schemas.js';

test('article drafts receive stable defaults for optional publishing metadata', () => {
  const parsed = articleDraftInputSchema.parse({ title: 'A story' });
  assert.equal(parsed.title, 'A story');
  assert.equal(parsed.language, 'en');
  assert.deepEqual(parsed.tags, []);
  assert.deepEqual(parsed.blocks, []);
  assert.equal(parsed.coverImageUrl, '');
});

test('article block schema accepts a versioned text block', () => {
  const parsed = articleBlockSchema.parse({ id: 'text-1', type: 'text', html: '<p>Public story</p>' });
  assert.equal(parsed.version, 1);
  assert.equal(parsed.type, 'text');
});

test('dedicated nested steps blocks are not part of the new flat block model', () => {
  assert.equal(articleBlockSchema.safeParse({ id: 'steps-1', type: 'steps', title: 'Recipe', steps: [{ title: 'Mix', description: 'Mix ingredients' }] }).success, false);
});

test('text blocks accept optional regular or step presentation metadata', () => {
  const regular = articleBlockSchema.parse({ id: 'text-regular', type: 'text', html: '<p>Paragraph</p>', presentation: 'regular' });
  const step = articleBlockSchema.parse({ id: 'text-step', type: 'text', html: '<p>Prepare the ingredients</p>', presentation: 'step' });
  assert.equal(regular.presentation, 'regular');
  assert.equal(step.presentation, 'step');
  assert.equal(articleBlockSchema.safeParse({ id: 'text-invalid', type: 'text', html: '<p>Text</p>', presentation: 'nested-step' }).success, false);
});

test('article block schema rejects unsafe non-HTTP media URLs', () => {
  const result = articleBlockSchema.safeParse({
    id: 'image-1', type: 'image', imageUrl: 'javascript:alert(1)', alt: 'Unsafe URL', width: 'normal'
  });
  assert.equal(result.success, false);
});

test('article block schema constrains hotspot coordinates to image percentages', () => {
  const result = articleBlockSchema.safeParse({
    id: 'hotspot-1', type: 'hotspot', imageUrl: '', points: [
      { id: 'point-1', x: 101, y: 50, title: 'Point', description: '' }
    ]
  });
  assert.equal(result.success, false);
});

test('block collections enforce the supported maximum', () => {
  const tooMany = Array.from({ length: 301 }, (_, index) => ({
    id: `text-${index}`, type: 'text', html: 'x'
  }));
  assert.equal(articleBlocksSchema.safeParse(tooMany).success, false);
});

test('draft patch requires an optimistic concurrency revision', () => {
  assert.equal(articleDraftPatchSchema.safeParse({ title: 'Updated title' }).success, false);
  assert.equal(articleDraftPatchSchema.safeParse({ expectedRevision: 3, title: 'Updated title' }).success, true);
});

test('blank canonical URL is allowed so the public canonical can be generated', () => {
  assert.equal(articleDraftInputSchema.safeParse({ title: 'A story', canonicalUrl: '' }).success, true);
});

test('commerce slider block references products, services, or menu items by UUID', () => {
  const validId = '123e4567-e89b-42d3-a456-426614174000';
  for (const itemType of ['product', 'service', 'menu_item']) {
    const parsed = articleBlockSchema.parse({
      id: 'commerce-' + itemType, type: 'commerce_collection', itemType, itemIds: [validId], title: 'Explore'
    });
    assert.equal(parsed.itemType, itemType);
    assert.deepEqual(parsed.itemIds, [validId]);
  }
  assert.equal(articleBlockSchema.safeParse({
    id: 'commerce-invalid', type: 'commerce_collection', itemType: 'menu', itemIds: ['not-a-uuid']
  }).success, false);
});
