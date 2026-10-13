import { ArticleBlock, ArticleStatus, ARTICLE_SCHEMA_VERSION } from '../../domain/article.model';

export interface ArticleMetadata {
  title: string;
  subtitle: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  category: string;
  language: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
}

export interface ArticleDocument {
  documentType: 'mageus.article';
  schemaVersion: typeof ARTICLE_SCHEMA_VERSION;
  id: string | null;
  channelId: string | null;
  status: ArticleStatus;
  metadata: ArticleMetadata;
  blocks: ArticleBlock[];
  revision: number;
  updatedAt: string;
}

export interface DocumentIssue {
  code: 'required' | 'invalid-url' | 'missing-alt' | 'empty-block' | 'invalid-reference' | 'duplicate-id' | 'unsupported-version';
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export function createEmptyArticleDocument(): ArticleDocument {
  return {
    documentType: 'mageus.article',
    schemaVersion: ARTICLE_SCHEMA_VERSION,
    id: null,
    channelId: null,
    status: 'draft',
    metadata: {
      title: '', subtitle: '', slug: '', excerpt: '', coverImage: '', category: '',
      language: 'en', tags: [], seoTitle: '', seoDescription: '', canonicalUrl: ''
    },
    blocks: [],
    revision: 0,
    updatedAt: new Date(0).toISOString()
  };
}

/** Pure immutable document operations keep editor UI components small and testable. */
export const ArticleDocumentOperations = {
  insert(document: ArticleDocument, block: ArticleBlock, index = document.blocks.length): ArticleDocument {
    const safeIndex = Math.max(0, Math.min(index, document.blocks.length));
    const blocks = [...document.blocks];
    blocks.splice(safeIndex, 0, block);
    return { ...document, blocks, revision: document.revision + 1 };
  },

  replace(document: ArticleDocument, blockId: string, nextBlock: ArticleBlock): ArticleDocument {
    if (blockId !== nextBlock.id) throw new Error('Block identity cannot change during replacement.');
    return {
      ...document,
      blocks: document.blocks.map((block) => block.id === blockId ? nextBlock : block),
      revision: document.revision + 1
    };
  },

  remove(document: ArticleDocument, blockId: string): ArticleDocument {
    return { ...document, blocks: document.blocks.filter((block) => block.id !== blockId), revision: document.revision + 1 };
  },

  move(document: ArticleDocument, blockId: string, offset: -1 | 1): ArticleDocument {
    const from = document.blocks.findIndex((block) => block.id === blockId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= document.blocks.length) return document;
    const blocks = [...document.blocks];
    [blocks[from], blocks[to]] = [blocks[to], blocks[from]];
    return { ...document, blocks, revision: document.revision + 1 };
  },

  duplicate(document: ArticleDocument, blockId: string, newId: string): ArticleDocument {
    const index = document.blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return document;
    const copy = JSON.parse(JSON.stringify(document.blocks[index])) as ArticleBlock;
    copy.id = newId;
    const blocks = [...document.blocks];
    blocks.splice(index + 1, 0, copy);
    return { ...document, blocks, revision: document.revision + 1 };
  }
};

export function validateArticleDocument(document: ArticleDocument): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const metadata = document.metadata;
  if (!metadata.title.trim()) issues.push({ code: 'required', path: 'metadata.title', message: 'An article title is required.', severity: 'error' });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug)) issues.push({ code: 'required', path: 'metadata.slug', message: 'Use a lowercase public URL slug with hyphens between words.', severity: 'error' });
  if (!document.blocks.length) issues.push({ code: 'empty-block', path: 'blocks', message: 'Add at least one content block.', severity: 'error' });

  const validHttpUrl = (value: string): boolean => {
    try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; }
    catch { return false; }
  };
  if (metadata.coverImage && !validHttpUrl(metadata.coverImage)) {
    issues.push({ code: 'invalid-url', path: 'metadata.coverImage', message: 'The cover image must use an HTTP or HTTPS URL.', severity: 'error' });
  }
  if (metadata.canonicalUrl && !validHttpUrl(metadata.canonicalUrl)) {
    issues.push({ code: 'invalid-url', path: 'metadata.canonicalUrl', message: 'The canonical URL must use an HTTP or HTTPS URL.', severity: 'error' });
  }

  const seenBlockIds = new Set<string>();
  document.blocks.forEach((block, index) => {
    const path = `blocks.${index}`;
    if (seenBlockIds.has(block.id)) {
      issues.push({ code: 'duplicate-id', path: `${path}.id`, message: 'Each block in this article needs its own ID. Duplicate blocks can still have the same type and content.', severity: 'error' });
    }
    seenBlockIds.add(block.id);
    if (block.version !== ARTICLE_SCHEMA_VERSION) {
      issues.push({ code: 'unsupported-version', path: `${path}.version`, message: 'This block version is not supported by this editor. Keep a recoverable export before changing it.', severity: 'error' });
    }

    const path = `blocks.${index}`;
    const required = (field: string, value: unknown, message: string): void => {
      if (typeof value !== 'string' || !value.trim()) issues.push({ code: 'required', path: `${path}.${field}`, message, severity: 'error' });
    };
    const url = (field: string, value: string): void => {
      if (!validHttpUrl(value)) issues.push({ code: 'invalid-url', path: `${path}.${field}`, message: 'Use a valid HTTP or HTTPS URL.', severity: 'error' });
    };
    switch (block.type) {
      case 'text':
        if (!block.html.replace(/<[^>]*>/g, '').trim()) issues.push({ code: 'empty-block', path: `${path}.html`, message: 'Add some text content.', severity: 'error' });
        break;
      case 'heading': required('text', block.text, 'Add heading text.'); break;
      case 'divider': break;
      case 'callout': required('body', block.body, 'Add the callout message.'); break;
      case 'table':
        if (!block.rows.length) issues.push({ code: 'empty-block', path: `${path}.rows`, message: 'Add at least one table row.', severity: 'error' });
        if (!block.headers.length || block.headers.some((header) => !header.trim()) || block.rows.some((row) => row.length !== block.headers.length)) {
          issues.push({ code: 'required', path: `${path}.headers`, message: 'Add column headings and ensure every row matches the number of columns.', severity: 'error' });
        }
        break;
      case 'code': required('code', block.code, 'Add a code sample.'); break;
      case 'video':
        required('url', block.url, 'Add a hosted video URL.');
        if (block.url) url('url', block.url);
        if (block.posterUrl) url('posterUrl', block.posterUrl);
        break;
      case 'audio':
        required('url', block.url, 'Add a hosted audio URL.');
        if (block.url) url('url', block.url);
        break;
      case 'image':
        required('imageUrl', block.imageUrl, 'Choose an image.');
        if (block.imageUrl) url('imageUrl', block.imageUrl);
        required('alt', block.alt, 'Add alternative text for accessibility.');
        break;
      case 'gallery':
        if (!block.images.length) issues.push({ code: 'empty-block', path: `${path}.images`, message: 'Add at least one gallery image.', severity: 'error' });
        block.images.forEach((image, i) => {
          if (image.url) url(`images.${i}.url`, image.url); else required(`images.${i}.url`, image.url, 'Choose an image.');
          required(`images.${i}.alt`, image.alt, 'Add alternative text for each image.');
        });
        break;
      case 'slide':
        if (!block.slides.length) issues.push({ code: 'empty-block', path: `${path}.slides`, message: 'Add at least one slide.', severity: 'error' });
        block.slides.forEach((slide, i) => {
          if (slide.imageUrl) url(`slides.${i}.imageUrl`, slide.imageUrl); else required(`slides.${i}.imageUrl`, slide.imageUrl, 'Choose an image for this slide.');
          if (slide.href) url(`slides.${i}.href`, slide.href);
        });
        break;
      case 'quote': required('quote', block.quote, 'Add the quotation text.'); break;
      case 'embed':
        if (!validHttpUrl(block.url)) issues.push({ code: 'invalid-url', path: `${path}.url`, message: 'Embeds must use a valid HTTP or HTTPS URL.', severity: 'error' });
        break;
      case 'before_after':
        required('beforeImage', block.beforeImage, 'Choose the before image.');
        required('afterImage', block.afterImage, 'Choose the after image.');
        if (block.beforeImage) url('beforeImage', block.beforeImage);
        if (block.afterImage) url('afterImage', block.afterImage);
        break;
      case 'hotspot':
        required('imageUrl', block.imageUrl, 'Choose the image for the hotspots.');
        if (block.imageUrl) url('imageUrl', block.imageUrl);
        block.points.forEach((point, i) => {
          if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) {
            issues.push({ code: 'required', path: `${path}.points.${i}`, message: 'Hotspot coordinates must be between 0 and 100 percent.', severity: 'error' });
          }
          required(`points.${i}.title`, point.title, 'Give each hotspot a title.');
        });
        break;
      case 'timeline':
        if (!block.events.length) issues.push({ code: 'empty-block', path: `${path}.events`, message: 'Add at least one timeline event.', severity: 'error' });
        block.events.forEach((event, i) => required(`events.${i}.title`, event.title, 'Give each event a title.'));
        break;
      case 'data_viz':
        if (!block.values.length) issues.push({ code: 'empty-block', path: `${path}.values`, message: 'Add at least one data point.', severity: 'error' });
        block.values.forEach((item, i) => {
          required(`values.${i}.label`, item.label, 'Label each data point.');
          if (!Number.isFinite(item.value)) issues.push({ code: 'required', path: `${path}.values.${i}.value`, message: 'Data values must be finite numbers.', severity: 'error' });
        });
        break;
      case 'math': required('formula', block.formula, 'Add the formula.'); break;
      case 'product': required('productId', block.productId, 'Choose a product reference.'); break;
      case 'product_collection':
        if (!block.productIds.some((id) => id.trim())) issues.push({ code: 'invalid-reference', path: `${path}.productIds`, message: 'Choose at least one product.', severity: 'error' });
        break;
      case 'commerce_collection':
        if (!block.itemIds.length) {
          issues.push({ code: 'invalid-reference', path: `${path}.itemIds`, message: 'Choose at least one product, service, or menu item.', severity: 'error' });
        }
        block.itemIds.forEach((id, itemIndex) => {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
            issues.push({ code: 'invalid-reference', path: `${path}.itemIds.${itemIndex}`, message: 'Each selected commerce item must use a valid item reference ID.', severity: 'error' });
          }
        });
        break;
      case 'magazine_ref': required('magazineId', block.magazineId, 'Choose a magazine or issue reference.'); break;
    }
  });
  return issues;
}
