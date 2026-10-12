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
    case 'steps': return { ...base, type, title: '', steps: [] };
    case 'data_viz': return { ...base, type, title: '', chartType: 'bar', values: [] };
    case 'math': return { ...base, type, formula: '', explanation: '' };
    case 'product': return { ...base, type, productId: '', displayMode: 'card' };
    case 'product_collection': return { ...base, type, productIds: [], title: '', layout: 'grid' };
    case 'magazine_ref': return { ...base, type, magazineId: '' };
  }
}

type LegacyPart = Record<string, unknown>;
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const array = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

/** Normalize the older UI-test ArticlePart format at the import boundary. */
export function migrateLegacyArticlePart(part: LegacyPart, index: number): ArticleBlock | null {
  const type = text(part['type']) as ArticleBlockType;
  const id = text(part['id'], `legacy-block-${index + 1}`);
  const base = { id, version: ARTICLE_SCHEMA_VERSION };
  switch (type) {
    case 'text': return { ...base, type, html: text(part['html']) };
    case 'image': return { ...base, type, imageUrl: text(part['image']), alt: text(part['alt']), caption: text(part['caption']) || undefined, credit: text(part['credit']) || undefined, width: part['imageWidth'] === 'wide' || part['imageWidth'] === 'full' ? part['imageWidth'] : 'normal' };
    case 'gallery': {
      const raw = array<unknown>(part['galleryImages']);
      return { ...base, type, images: raw.map((item) => typeof item === 'string' ? { url: item, alt: '' } : { url: text((item as LegacyPart)?.['url']), alt: text((item as LegacyPart)?.['alt']), caption: text((item as LegacyPart)?.['caption']) }), layout: part['galleryLayout'] === 'masonry' || part['galleryLayout'] === 'strip' ? part['galleryLayout'] : part['galleryLayout'] === 'slider' || part['galleryLayout'] === 'horizontal-scroll' ? 'carousel' : 'grid' };
    }
    case 'slide': return { ...base, type, slides: array<LegacyPart>(part['slides']).map((slide) => ({ imageUrl: text(slide['pic']), label: text(slide['label']) || undefined, href: text(slide['link']) || undefined })), ratio: part['slideRatio'] === '9:16' || part['slideRatio'] === '1:1' ? part['slideRatio'] : '16:9' };
    case 'quote': return { ...base, type, quote: text(part['quote']), author: text(part['quoteAuthor']) || undefined, citation: text(part['quoteCitation']) || undefined };
    case 'embed': return { ...base, type, url: text(part['embedUrl'], text(part['embed'])), provider: text(part['embedType']) || undefined, title: text(part['title']) || undefined };
    case 'before_after': return { ...base, type, beforeImage: text(part['beforeImage']), afterImage: text(part['afterImage']), beforeLabel: text(part['beforeLabel']) || undefined, afterLabel: text(part['afterLabel']) || undefined };
    case 'hotspot': return { ...base, type, imageUrl: text(part['hotspotImage']), points: array<LegacyPart>(part['hotspots']).map((point, i) => ({ id: text(point['id'], `${id}-point-${i + 1}`), x: Number(point['x']) || 0, y: Number(point['y']) || 0, title: text(point['title']), description: text(point['description']) })) };
    case 'timeline': return { ...base, type, title: text(part['timelineTitle']) || undefined, events: array<LegacyPart>(part['timelineEvents']).map((event) => ({ date: text(event['yearOrDate']), title: text(event['title']), description: text(event['description']) })) };
    case 'steps': return { ...base, type, title: text(part['stepsTitle']) || undefined, steps: array<LegacyPart>(part['steps']).map((step) => ({ title: text(step['title']), description: text(step['description']) })) };
    case 'data_viz': return { ...base, type, title: text(part['chartTitle']) || undefined, chartType: part['chartType'] === 'progress' || part['chartType'] === 'kpi' || part['chartType'] === 'comparison' || part['chartType'] === 'table' ? part['chartType'] : 'bar', values: array<LegacyPart>(part['chartData']).map((item) => ({ label: text(item['label']), value: Number(item['value']) || 0 })) };
    case 'math': return { ...base, type, formula: text(part['mathFormula']), explanation: text(part['mathExplanation']) || undefined };
    case 'product': return { ...base, type, productId: text(part['productId']), displayMode: part['productDisplayMode'] === 'compact' || part['productDisplayMode'] === 'featured' ? part['productDisplayMode'] : 'card' };
    case 'product_collection': return { ...base, type, productIds: array<string>(part['productIds']), title: text(part['collectionTitle']) || undefined, layout: part['collectionLayout'] === 'carousel' || part['collectionLayout'] === 'list' ? part['collectionLayout'] : 'grid' };
    case 'magazine_ref': return { ...base, type, magazineId: text(part['magazineId']) };
    default: return null;
  }
}
