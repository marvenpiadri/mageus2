import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArticleBlock, ArticleBlockType } from '../../domain/article.model';
import { ARTICLE_BLOCK_TOOLS, createEmptyBlock } from './article-block-registry';

interface StudioDraft {
  version: 1;
  title: string;
  subtitle: string;
  blocks: ArticleBlock[];
  savedAt: string;
}

const DRAFT_KEY = 'mageus:article-studio:draft:v1';

@Component({
  standalone: true,
  selector: 'mageus-article-studio',
  imports: [FormsModule, RouterLink],
  templateUrl: './article-studio-page.component.html',
  styleUrl: './article-studio-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleStudioPageComponent {
  private readonly platformId = inject(PLATFORM_ID);
  readonly title = signal('');
  readonly subtitle = signal('');
  readonly selectedTool = signal<ArticleBlockType | null>(null);
  readonly blocks = signal<ArticleBlock[]>([]);
  readonly statusMessage = signal('Draft stored on this device when you edit');
  readonly validationMessages = signal<string[]>([]);
  readonly lastSavedAt = signal<string | null>(null);

  readonly tools = ARTICLE_BLOCK_TOOLS;

  constructor() {
    if (isPlatformBrowser(this.platformId)) this.restoreDraft();
  }

  plainText(html: string): string { return html.replace(/<[^>]*>/g, ''); }

  setTitle(value: string): void { this.title.set(value); this.markChanged(); }
  setSubtitle(value: string): void { this.subtitle.set(value); this.markChanged(); }

  addBlock(type: ArticleBlockType): void {
    const id = globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${this.blocks().length}`;
    this.blocks.update((current) => [...current, createEmptyBlock(type, id)]);
    this.selectedTool.set(null);
    this.markChanged();
  }

  patchBlock(id: string, patch: Partial<ArticleBlock>): void {
    this.blocks.update((current) => current.map((block) =>
      block.id === id ? ({ ...block, ...patch } as ArticleBlock) : block
    ));
    this.markChanged();
  }

  removeBlock(id: string): void {
    this.blocks.update((current) => current.filter((block) => block.id !== id));
    this.markChanged();
  }

  duplicateBlock(id: string): void {
    const current = this.blocks();
    const index = current.findIndex((block) => block.id === id);
    if (index < 0) return;
    const source = current[index];
    const clone = JSON.parse(JSON.stringify(source)) as ArticleBlock;
    clone.id = globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-copy`;
    const next = [...current];
    next.splice(index + 1, 0, clone);
    this.blocks.set(next);
    this.markChanged();
  }

  moveBlock(index: number, direction: -1 | 1): void {
    const target = index + direction;
    const current = [...this.blocks()];
    if (target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    this.blocks.set(current);
    this.markChanged();
  }

  addNestedItem(block: ArticleBlock): void {
    switch (block.type) {
      case 'gallery':
        this.patchBlock(block.id, { images: [...block.images, { url: '', alt: '', caption: '' }] });
        break;
      case 'slide':
        this.patchBlock(block.id, { slides: [...block.slides, { imageUrl: '', label: '', href: '' }] });
        break;
      case 'timeline':
        this.patchBlock(block.id, { events: [...block.events, { date: '', title: '', description: '' }] });
        break;
      case 'steps':
        this.patchBlock(block.id, { steps: [...block.steps, { title: '', description: '' }] });
        break;
      case 'data_viz':
        this.patchBlock(block.id, { values: [...block.values, { label: '', value: 0 }] });
        break;
      case 'hotspot':
        this.patchBlock(block.id, { points: [...block.points, { id: globalThis.crypto?.randomUUID?.() ?? `point-${Date.now()}`, x: 50, y: 50, title: '', description: '' }] });
        break;
      default: break;
    }
  }

  removeNestedItem(block: ArticleBlock, index: number): void {
    switch (block.type) {
      case 'gallery': this.patchBlock(block.id, { images: block.images.filter((_, i) => i !== index) }); break;
      case 'slide': this.patchBlock(block.id, { slides: block.slides.filter((_, i) => i !== index) }); break;
      case 'timeline': this.patchBlock(block.id, { events: block.events.filter((_, i) => i !== index) }); break;
      case 'steps': this.patchBlock(block.id, { steps: block.steps.filter((_, i) => i !== index) }); break;
      case 'data_viz': this.patchBlock(block.id, { values: block.values.filter((_, i) => i !== index) }); break;
      case 'hotspot': this.patchBlock(block.id, { points: block.points.filter((_, i) => i !== index) }); break;
      default: break;
    }
  }

  updateNestedItem(block: ArticleBlock, index: number, field: string, value: string | number): void {
    const update = <T extends object>(items: T[]): T[] => items.map((item, i) =>
      i === index ? ({ ...item, [field]: value } as T) : item
    );
    switch (block.type) {
      case 'gallery': this.patchBlock(block.id, { images: update(block.images) }); break;
      case 'slide': this.patchBlock(block.id, { slides: update(block.slides) }); break;
      case 'timeline': this.patchBlock(block.id, { events: update(block.events) }); break;
      case 'steps': this.patchBlock(block.id, { steps: update(block.steps) }); break;
      case 'data_viz': this.patchBlock(block.id, { values: update(block.values) }); break;
      case 'hotspot': this.patchBlock(block.id, { points: update(block.points) }); break;
      default: break;
    }
  }

  saveDraft(): void {
    const errors = this.validateDraft();
    this.validationMessages.set(errors);
    if (!this.title().trim()) {
      this.statusMessage.set('Add an article title before publishing.');
      return;
    }
    this.persistDraft();
    this.statusMessage.set(errors.length ? 'Draft saved locally · fix validation warnings before publishing' : 'Draft saved on this device · server sync is not connected yet');
  }

  exportDraft(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const payload = this.toDraft();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.slugify(this.title() || 'untitled-article')}.mageus-draft.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.statusMessage.set('Draft exported as a portable document.');
  }

  private markChanged(): void {
    this.statusMessage.set('Unsaved changes');
    this.persistDraft();
  }

  private persistDraft(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const draft = this.toDraft();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      this.lastSavedAt.set(draft.savedAt);
      this.statusMessage.set('Saved locally · server sync not connected');
    } catch {
      this.statusMessage.set('Could not save locally. Export your draft to keep a copy.');
    }
  }

  private restoreDraft(): void {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as StudioDraft;
      if (draft.version !== 1 || !Array.isArray(draft.blocks)) return;
      this.title.set(draft.title ?? '');
      this.subtitle.set(draft.subtitle ?? '');
      this.blocks.set(draft.blocks);
      this.lastSavedAt.set(draft.savedAt ?? null);
      this.statusMessage.set('Recovered a local draft');
    } catch {
      this.statusMessage.set('A previous local draft could not be recovered.');
    }
  }

  private toDraft(): StudioDraft {
    return {
      version: 1,
      title: this.title(),
      subtitle: this.subtitle(),
      blocks: this.blocks(),
      savedAt: new Date().toISOString()
    };
  }

  private validateDraft(): string[] {
    const issues: string[] = [];
    if (!this.title().trim()) issues.push('Add a title.');
    if (!this.blocks().length) issues.push('Add at least one content block.');
    for (const [index, block] of this.blocks().entries()) {
      if (block.type === 'image' && !block.imageUrl.trim()) issues.push(`Block ${index + 1}: add an image URL.`);
      if (block.type === 'embed' && !/^https?:\/\//i.test(block.url)) issues.push(`Block ${index + 1}: add a valid HTTP(S) embed URL.`);
      if (block.type === 'product' && !block.productId.trim()) issues.push(`Block ${index + 1}: select a product reference.`);
      if (block.type === 'magazine_ref' && !block.magazineId.trim()) issues.push(`Block ${index + 1}: select a magazine reference.`);
    }
    return issues;
  }

  private slugify(value: string): string {
    return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
