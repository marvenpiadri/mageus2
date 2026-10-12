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
  code: 'required' | 'invalid-url' | 'missing-alt' | 'empty-block' | 'invalid-reference';
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

  document.blocks.forEach((block, index) => {
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
        });
        break;
      case 'quote': required('quote', block.quote, 'Add the quotation text.'); break;
      case 'embed':
        if (!/^https?:\/\//i.test(block.url)) issues.push({ code: 'invalid-url', path: `${path}.url`, message: 'Embeds must use a valid HTTP or HTTPS URL.', severity: 'error' });
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
      case 'steps':
        if (!block.steps.length) issues.push({ code: 'empty-block', path: `${path}.steps`, message: 'Add at least one step.', severity: 'error' });
        block.steps.forEach((step, i) => required(`steps.${i}.title`, step.title, 'Give each step a title.'));
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
      case 'magazine_ref': required('magazineId', block.magazineId, 'Choose a magazine or issue reference.'); break;
    }
  });
  return issues;
}
