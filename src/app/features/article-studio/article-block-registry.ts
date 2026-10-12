import {
  ArticleBlock,
  ArticleBlockType,
  ARTICLE_SCHEMA_VERSION
} from '../../domain/article.model';

export interface ArticleBlockTool {
  type: ArticleBlockType;
  label: string;
  description: string;
  icon: string;
  family: 'editorial' | 'media' | 'interactive' | 'commerce' | 'publishing';
}

export const ARTICLE_BLOCK_TOOLS: readonly ArticleBlockTool[] = [
  { type: 'text', label: 'Text', description: 'Paragraphs and body copy', icon: 'T', family: 'editorial' },
  { type: 'heading', label: 'Heading', description: 'Structure the story with section headings', icon: 'H', family: 'editorial' },
  { type: 'divider', label: 'Divider', description: 'Create a visual pause between sections', icon: '—', family: 'editorial' },
  { type: 'callout', label: 'Callout', description: 'Highlight a note, tip, or warning', icon: '✧', family: 'editorial' },
  { type: 'table', label: 'Table', description: 'Present structured rows and columns', icon: '▦', family: 'editorial' },
  { type: 'code', label: 'Code', description: 'Show readable code samples', icon: '</>', family: 'editorial' },
  { type: 'quote', label: 'Quote', description: 'A highlighted quotation', icon: '“', family: 'editorial' },
  { type: 'math', label: 'Math', description: 'A formula with explanation', icon: '∑', family: 'editorial' },
  { type: 'image', label: 'Image', description: 'A single image with caption', icon: '▧', family: 'media' },
  { type: 'gallery', label: 'Gallery', description: 'A collection of images', icon: '▦', family: 'media' },
  { type: 'slide', label: 'Slides', description: 'A visual sequence or deck', icon: '▤', family: 'media' },
  { type: 'embed', label: 'Embed', description: 'A supported external media URL', icon: '↗', family: 'media' },
  { type: 'video', label: 'Video', description: 'Add a hosted video with poster and caption', icon: '▶', family: 'media' },
  { type: 'audio', label: 'Audio', description: 'Add a playable audio clip or narration', icon: '♫', family: 'media' },
  { type: 'before_after', label: 'Before / after', description: 'Compare two images', icon: '⇄', family: 'interactive' },
  { type: 'hotspot', label: 'Hotspots', description: 'Explore points on an image', icon: '◎', family: 'interactive' },
  { type: 'timeline', label: 'Timeline', description: 'Events in chronological order', icon: '↕', family: 'interactive' },
  { type: 'data_viz', label: 'Data visualisation', description: 'A chart or data comparison', icon: '▥', family: 'interactive' },
  { type: 'product', label: 'Product', description: 'Reference a Mageus shop product', icon: '◇', family: 'commerce' },
  { type: 'product_collection', label: 'Product collection', description: 'Curate products into a group', icon: '◫', family: 'commerce' },
  { type: 'magazine_ref', label: 'Magazine', description: 'Reference a magazine or issue', icon: '▣', family: 'publishing' }
] as const;

export function createEmptyBlock(type: ArticleBlockType, id: string): ArticleBlock {
  const base = { id, version: ARTICLE_SCHEMA_VERSION };
  switch (type) {
    case 'text': return { ...base, type, html: '<p>Begin writing here…</p>' };
    case 'heading': return { ...base, type, text: 'Section heading', level: 2 };
    case 'divider': return { ...base, type, style: 'line' };
    case 'callout': return { ...base, type, title: '', body: '', tone: 'note' };
    case 'table': return { ...base, type, headers: ['Column 1', 'Column 2'], rows: [['', '']], caption: '' };
    case 'code': return { ...base, type, language: 'text', code: '', caption: '' };
    case 'video': return { ...base, type, url: '', title: '', posterUrl: '', caption: '' };
    case 'audio': return { ...base, type, url: '', title: '', caption: '' };
    case 'image': return { ...base, type, imageUrl: '', alt: '', caption: '', width: 'normal' };
    case 'gallery': return { ...base, type, images: [], layout: 'grid' };
    case 'slide': return { ...base, type, slides: [], ratio: '16:9' };
    case 'quote': return { ...base, type, quote: '', author: '', citation: '' };
    case 'embed': return { ...base, type, url: '', title: '' };
    case 'before_after': return { ...base, type, beforeImage: '', afterImage: '', beforeLabel: 'Before', afterLabel: 'After' };
    case 'hotspot': return { ...base, type, imageUrl: '', points: [] };
    case 'timeline': return { ...base, type, title: '', events: [] };
    case 'data_viz': return { ...base, type, title: '', chartType: 'bar', values: [] };
    case 'math': return { ...base, type, formula: '', explanation: '' };
    case 'product': return { ...base, type, productId: '', displayMode: 'card' };
    case 'product_collection': return { ...base, type, productIds: [], title: '', layout: 'grid' };
    case 'magazine_ref': return { ...base, type, magazineId: '' };
  }
}
