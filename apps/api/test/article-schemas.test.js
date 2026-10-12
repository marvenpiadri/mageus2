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


test('accepts expanded editorial and direct-media block families', () => {
  const blocks = [
    { id: 'heading-a', type: 'heading', text: 'Section', level: 2 },
    { id: 'divider-a', type: 'divider', style: 'dots' },
    { id: 'callout-a', type: 'callout', body: 'Remember this', tone: 'tip' },
    { id: 'table-a', type: 'table', headers: ['Name', 'Value'], rows: [['A', '1']] },
    { id: 'code-a', type: 'code', language: 'typescript', code: 'const value = 1;' },
    { id: 'video-a', type: 'video', url: 'https://cdn.example.test/video.mp4', title: 'Demo' },
    { id: 'audio-a', type: 'audio', url: 'https://cdn.example.test/audio.mp3', title: 'Narration' }
  ];
  assert.equal(articleBlocksSchema.safeParse(blocks).success, true);
});

test('accepts every currently supported Mageus 2 block type as a versioned draft document', () => {
  const blocks = [
    { id: 'text-a', type: 'text', html: '<p>Story</p>' },
    { id: 'heading-a', type: 'heading', text: 'Section', level: 2 },
    { id: 'divider-a', type: 'divider', style: 'line' },
    { id: 'callout-a', type: 'callout', body: 'Note', tone: 'note' },
    { id: 'table-a', type: 'table', headers: ['Name'], rows: [['Value']] },
    { id: 'code-a', type: 'code', language: 'text', code: 'example' },
    { id: 'video-a', type: 'video', url: '', title: 'Video' },
    { id: 'audio-a', type: 'audio', url: '', title: 'Audio' },
    { id: 'image-a', type: 'image', imageUrl: '', alt: '', width: 'normal' },
    { id: 'gallery-a', type: 'gallery', images: [], layout: 'grid' },
    { id: 'slide-a', type: 'slide', slides: [], ratio: '16:9' },
    { id: 'quote-a', type: 'quote', quote: 'Words' },
    { id: 'embed-a', type: 'embed', url: '' },
    { id: 'comparison-a', type: 'before_after', beforeImage: '', afterImage: '' },
    { id: 'hotspot-a', type: 'hotspot', imageUrl: '', points: [] },
    { id: 'timeline-a', type: 'timeline', events: [] },
    { id: 'steps-a', type: 'steps', steps: [] },
    { id: 'data-a', type: 'data_viz', chartType: 'bar', values: [] },
    { id: 'math-a', type: 'math', formula: '' },
    { id: 'product-a', type: 'product', productId: '', displayMode: 'card' },
    { id: 'products-a', type: 'product_collection', productIds: [], layout: 'grid' },
    { id: 'magazine-a', type: 'magazine_ref', magazineId: '' }
  ];

  const result = articleBlocksSchema.safeParse(blocks);
  assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues));
  assert.equal(result.data.length, 22);
  assert.ok(result.data.every((block) => block.version === 1));
});

test('rejects table rows that exceed the maximum supported column count', () => {
  const result = articleBlockSchema.safeParse({
    id: 'table-invalid', type: 'table', headers: ['One'], rows: [Array.from({ length: 21 }, () => 'cell')]
  });
  assert.equal(result.success, false);
});
