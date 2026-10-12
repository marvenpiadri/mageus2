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
  if (!metadata.slug.trim()) issues.push({ code: 'required', path: 'metadata.slug', message: 'A public URL slug is required before publishing.', severity: 'error' });
  if (!document.blocks.length) issues.push({ code: 'empty-block', path: 'blocks', message: 'Add at least one content block.', severity: 'error' });

  document.blocks.forEach((block, index) => {
    const path = `blocks.${index}`;
    if (block.type === 'image') {
      if (!block.imageUrl.trim()) issues.push({ code: 'required', path: `${path}.imageUrl`, message: 'Choose an image.', severity: 'error' });
      if (!block.alt.trim()) issues.push({ code: 'missing-alt', path: `${path}.alt`, message: 'Add alternative text so the image is accessible.', severity: 'warning' });
    }
    if (block.type === 'embed' && !/^https?:\/\//i.test(block.url)) {
      issues.push({ code: 'invalid-url', path: `${path}.url`, message: 'Embeds must use a valid HTTP or HTTPS URL.', severity: 'error' });
    }
    if (block.type === 'product' && !block.productId.trim()) {
      issues.push({ code: 'invalid-reference', path: `${path}.productId`, message: 'Choose a product reference.', severity: 'error' });
    }
    if (block.type === 'magazine_ref' && !block.magazineId.trim()) {
      issues.push({ code: 'invalid-reference', path: `${path}.magazineId`, message: 'Choose a magazine reference.', severity: 'error' });
    }
  });
  return issues;
}
