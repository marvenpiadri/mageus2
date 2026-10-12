export const ARTICLE_SCHEMA_VERSION = 1 as const;

export type ArticleBlockType =
  | 'text'
  | 'heading'
  | 'divider'
  | 'callout'
  | 'table'
  | 'code'
  | 'video'
  | 'audio'
  | 'image'
  | 'gallery'
  | 'slide'
  | 'quote'
  | 'embed'
  | 'before_after'
  | 'hotspot'
  | 'timeline'
  | 'steps'
  | 'data_viz'
  | 'math'
  | 'product'
  | 'product_collection'
  | 'magazine_ref';

export interface ArticleBlockBase {
  id: string;
  type: ArticleBlockType;
  version: number;
}

export interface TextBlock extends ArticleBlockBase {
  type: 'text';
  html: string;
  /** Optional display treatment; content blocks remain flat and independently reorderable. */
  presentation?: 'regular' | 'step';
}

export interface HeadingBlock extends ArticleBlockBase {
  type: 'heading';
  text: string;
  level: 2 | 3 | 4;
  anchor?: string;
}

export interface DividerBlock extends ArticleBlockBase {
  type: 'divider';
  style: 'line' | 'dots' | 'space';
}

export interface CalloutBlock extends ArticleBlockBase {
  type: 'callout';
  title?: string;
  body: string;
  tone: 'note' | 'tip' | 'warning' | 'success';
}

export interface TableBlock extends ArticleBlockBase {
  type: 'table';
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface CodeBlock extends ArticleBlockBase {
  type: 'code';
  language: string;
  code: string;
  caption?: string;
}

export interface VideoBlock extends ArticleBlockBase {
  type: 'video';
  url: string;
  title: string;
  posterUrl?: string;
  caption?: string;
}

export interface AudioBlock extends ArticleBlockBase {
  type: 'audio';
  url: string;
  title: string;
  caption?: string;
}

export interface ImageBlock extends ArticleBlockBase {
  type: 'image';
  imageUrl: string;
  alt: string;
  caption?: string;
  credit?: string;
  width: 'normal' | 'wide' | 'full';
}

export interface QuoteBlock extends ArticleBlockBase {
  type: 'quote';
  quote: string;
  author?: string;
  citation?: string;
}

export interface GalleryBlock extends ArticleBlockBase {
  type: 'gallery';
  images: Array<{ url: string; alt: string; caption?: string }>;
  layout: 'grid' | 'masonry' | 'strip' | 'carousel';
}

export interface SlideBlock extends ArticleBlockBase {
  type: 'slide';
  slides: Array<{ imageUrl: string; label?: string; href?: string }>;
  ratio: '9:16' | '1:1' | '16:9';
}

export interface EmbedBlock extends ArticleBlockBase {
  type: 'embed';
  url: string;
  provider?: string;
  title?: string;
}

export interface BeforeAfterBlock extends ArticleBlockBase {
  type: 'before_after';
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export interface HotspotBlock extends ArticleBlockBase {
  type: 'hotspot';
  imageUrl: string;
  points: Array<{ id: string; x: number; y: number; title: string; description: string }>;
}

export interface TimelineBlock extends ArticleBlockBase {
  type: 'timeline';
  title?: string;
  events: Array<{ date: string; title: string; description: string }>;
}

export interface StepsBlock extends ArticleBlockBase {
  type: 'steps';
  title?: string;
  steps: Array<{ title: string; description: string }>;
}

export interface DataVizBlock extends ArticleBlockBase {
  type: 'data_viz';
  title?: string;
  chartType: 'bar' | 'progress' | 'kpi' | 'comparison' | 'table';
  values: Array<{ label: string; value: number }>;
}

export interface MathBlock extends ArticleBlockBase {
  type: 'math';
  formula: string;
  explanation?: string;
}

export interface ProductBlock extends ArticleBlockBase {
  type: 'product';
  productId: string;
  displayMode: 'card' | 'compact' | 'featured';
}

export interface ProductCollectionBlock extends ArticleBlockBase {
  type: 'product_collection';
  productIds: string[];
  title?: string;
  layout: 'grid' | 'carousel' | 'list';
}

export interface MagazineReferenceBlock extends ArticleBlockBase {
  type: 'magazine_ref';
  magazineId: string;
}

export type ArticleBlock =
  | TextBlock | HeadingBlock | DividerBlock | CalloutBlock | TableBlock | CodeBlock | VideoBlock | AudioBlock | ImageBlock | QuoteBlock | GalleryBlock | SlideBlock
  | EmbedBlock | BeforeAfterBlock | HotspotBlock | TimelineBlock
  | StepsBlock | DataVizBlock | MathBlock | ProductBlock
  | ProductCollectionBlock | MagazineReferenceBlock;

export type ArticleStatus = 'draft' | 'published' | 'archival';

export interface Article {
  schemaVersion: typeof ARTICLE_SCHEMA_VERSION;
  id: string;
  authorId: string;
  username: string;
  authorName: string;
  title: string;
  slug: string;
  subtitle: string;
  category: string;
  coverImage: string;
  status: ArticleStatus;
  createdAt: string;
  updatedAt: string;
  blocks: ArticleBlock[];
  magazineId?: string;
  magazineTitle?: string;
  readingTimeMinutes: number;
  views: number;
  ratingAverage: number;
  ratingCount: number;
}

export interface ArticleDraft {
  title: string;
  subtitle: string;
  category: string;
  coverImage: string;
  blocks: ArticleBlock[];
}