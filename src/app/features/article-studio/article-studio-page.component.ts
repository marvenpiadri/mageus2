import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArticleBlock, ArticleBlockType } from '../../domain/article.model';

interface BlockTool { type: ArticleBlockType; label: string; description: string; icon: string; }

@Component({
  standalone: true,
  selector: 'mageus-article-studio',
  imports: [FormsModule, RouterLink],
  templateUrl: './article-studio-page.component.html',
  styleUrl: './article-studio-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleStudioPageComponent {
  readonly title = signal('');
  readonly subtitle = signal('');
  readonly selectedTool = signal<ArticleBlockType | null>(null);
  readonly blocks = signal<ArticleBlock[]>([]);
  readonly statusMessage = signal('Draft not yet saved');

  readonly tools: readonly BlockTool[] = [
    { type: 'text', label: 'Text', description: 'Paragraphs and headings', icon: 'T' },
    { type: 'image', label: 'Image', description: 'A single image with caption', icon: '▧' },
    { type: 'gallery', label: 'Gallery', description: 'A collection of images', icon: '▦' },
    { type: 'slide', label: 'Slides', description: 'A visual sequence or deck', icon: '▤' },
    { type: 'quote', label: 'Quote', description: 'A highlighted quotation', icon: '“' },
    { type: 'embed', label: 'Embed', description: 'A supported external media URL', icon: '↗' },
    { type: 'before_after', label: 'Before / after', description: 'Compare two images', icon: '⇄' },
    { type: 'hotspot', label: 'Hotspots', description: 'Explore points on an image', icon: '◎' },
    { type: 'timeline', label: 'Timeline', description: 'Events in chronological order', icon: '↕' },
    { type: 'steps', label: 'Steps', description: 'A guided sequence', icon: '≡' },
    { type: 'data_viz', label: 'Data visualisation', description: 'A chart or data comparison', icon: '▥' },
    { type: 'math', label: 'Math', description: 'A formula with explanation', icon: '∑' },
    { type: 'product', label: 'Product', description: 'Reference a Mageus shop product', icon: '◇' },
    { type: 'product_collection', label: 'Product collection', description: 'Curate products into a group', icon: '◫' },
    { type: 'magazine_ref', label: 'Magazine', description: 'Reference a magazine or issue', icon: '▣' }
  ];

  addBlock(type: ArticleBlockType): void {
    const id = globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${this.blocks().length}`;
    const base = { id, version: 1 };
    let block: ArticleBlock;
    switch (type) {
      case 'text': block = { ...base, type, html: '<p>Begin writing here…</p>' }; break;
      case 'image': block = { ...base, type, imageUrl: '', alt: '', width: 'normal' }; break;
      case 'gallery': block = { ...base, type, images: [], layout: 'grid' }; break;
      case 'slide': block = { ...base, type, slides: [], ratio: '16:9' }; break;
      case 'quote': block = { ...base, type, quote: '' }; break;
      case 'embed': block = { ...base, type, url: '' }; break;
      case 'before_after': block = { ...base, type, beforeImage: '', afterImage: '' }; break;
      case 'hotspot': block = { ...base, type, imageUrl: '', points: [] }; break;
      case 'timeline': block = { ...base, type, events: [] }; break;
      case 'steps': block = { ...base, type, steps: [] }; break;
      case 'data_viz': block = { ...base, type, chartType: 'bar', values: [] }; break;
      case 'math': block = { ...base, type, formula: '' }; break;
      case 'product': block = { ...base, type, productId: '', displayMode: 'card' }; break;
      case 'product_collection': block = { ...base, type, productIds: [], layout: 'grid' }; break;
      case 'magazine_ref': block = { ...base, type, magazineId: '' }; break;
      default: return;
    }
    this.blocks.update((current) => [...current, block]);
    this.selectedTool.set(null);
    this.statusMessage.set('Unsaved changes');
  }

  removeBlock(id: string): void {
    this.blocks.update((current) => current.filter((block) => block.id !== id));
    this.statusMessage.set('Unsaved changes');
  }

  moveBlock(index: number, direction: -1 | 1): void {
    const target = index + direction;
    const current = [...this.blocks()];
    if (target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    this.blocks.set(current);
    this.statusMessage.set('Unsaved changes');
  }

  saveDraft(): void {
    this.statusMessage.set('Draft model is ready; API persistence is not connected yet.');
  }
}