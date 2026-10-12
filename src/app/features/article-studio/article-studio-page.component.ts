import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ArticleBlock, ArticleBlockType } from '../../domain/article.model';
import { ARTICLE_BLOCK_TOOLS, createEmptyBlock } from './article-block-registry';
import { AuthService } from '../../core/auth/auth.service';
import { ArticleApiService, ArticleDraftPayload } from '../../core/services/article-api.service';
import { ArticleBlockEditorComponent } from './article-block-editor.component';

interface StudioDraft {
  version: 1;
  title: string;
  subtitle: string;
  slug?: string;
  excerpt?: string;
  category?: string;
  language?: string;
  tags?: string[];
  coverImageUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  serverArticleId?: string | null;
  serverRevision?: number | null;
  blocks: ArticleBlock[];
  savedAt: string;
}

const DRAFT_KEY = 'mageus:article-studio:draft:v1';

@Component({
  standalone: true,
  selector: 'mageus-article-studio',
  imports: [FormsModule, RouterLink, ArticleBlockEditorComponent],
  templateUrl: './article-studio-page.component.html',
  styleUrl: './article-studio-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleStudioPageComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly api = inject(ArticleApiService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly title = signal('');
  readonly subtitle = signal('');
  readonly slug = signal('');
  readonly excerpt = signal('');
  readonly category = signal('');
  readonly language = signal('en');
  readonly tags = signal<string[]>([]);
  readonly coverImageUrl = signal('');
  readonly seoTitle = signal('');
  readonly seoDescription = signal('');
  readonly canonicalUrl = signal('');
  readonly serverArticleId = signal<string | null>(null);
  readonly serverRevision = signal<number | null>(null);
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

  setTitle(value: string): void {
    const previousSlug = this.slugify(this.title());
    this.title.set(value);
    if (!this.slug() || this.slug() === previousSlug) this.slug.set(this.slugify(value));
    this.markChanged();
  }
  setSubtitle(value: string): void { this.subtitle.set(value); this.markChanged(); }
  setSlug(value: string): void { this.slug.set(this.slugify(value)); this.markChanged(); }
  setTags(value: string): void { this.tags.set([...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 30)); this.markChanged(); }
  setExcerpt(value: string): void { this.excerpt.set(value); this.markChanged(); }
  setCategory(value: string): void { this.category.set(value); this.markChanged(); }
  setLanguage(value: string): void { this.language.set(value); this.markChanged(); }
  setCoverImageUrl(value: string): void { this.coverImageUrl.set(value); this.markChanged(); }
  setSeoTitle(value: string): void { this.seoTitle.set(value); this.markChanged(); }
  setSeoDescription(value: string): void { this.seoDescription.set(value); this.markChanged(); }
  setCanonicalUrl(value: string): void { this.canonicalUrl.set(value); this.markChanged(); }

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

  replaceBlock(updated: ArticleBlock): void {
    this.blocks.update((current) => current.map((block) => block.id === updated.id ? updated : block));
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
    this.persistDraft();
    this.statusMessage.set(errors.length ? 'Local draft saved · resolve validation notes before publishing.' : 'Local draft saved. Use Sync draft to save it to your account.');
  }

  async syncDraft(): Promise<void> {
    this.persistDraft();
    if (!this.title().trim()) { this.statusMessage.set('Local draft saved · add a title before syncing.'); return; }
    if (!this.auth.isAuthenticated()) { await this.router.navigateByUrl('/sign-in'); return; }
    try {
      const payload: ArticleDraftPayload = {
        title: this.title().trim(), subtitle: this.subtitle(), slug: this.slug().trim() || this.slugify(this.title()),
        excerpt: this.excerpt(), category: this.category(), language: this.language(), tags: this.tags(),
        coverImageUrl: this.coverImageUrl(), blocks: this.blocks(), schemaVersion: 1,
        seoTitle: this.seoTitle(), seoDescription: this.seoDescription(), canonicalUrl: this.canonicalUrl().trim() || undefined
      };
      const saved = await this.api.saveDraft(payload, this.serverArticleId(), this.serverRevision());
      this.serverArticleId.set(saved.id); this.serverRevision.set(saved.revision); this.persistDraft(); this.statusMessage.set('Draft synced to your Mageus account.');
    } catch (error: any) { this.statusMessage.set(error?.error?.error?.message || error?.message || 'Could not sync. Your local recovery copy is safe.'); }
  }

  async publishArticle(): Promise<void> {
    const errors = this.validateDraft(); this.validationMessages.set(errors);
    if (errors.length) { this.statusMessage.set('Resolve the validation notes before publishing.'); return; }
    if (!this.auth.isAuthenticated()) { await this.router.navigateByUrl('/sign-in'); return; }
    if (!this.serverArticleId()) await this.syncDraft();
    const id = this.serverArticleId(); if (!id) return;
    try {
      const path = await this.api.publish(id, this.serverRevision());
      if (isPlatformBrowser(this.platformId)) localStorage.removeItem(DRAFT_KEY);
      this.serverArticleId.set(null); this.serverRevision.set(null);
      this.statusMessage.set('Article published successfully.');
      await this.router.navigateByUrl(path);
    } catch (error: any) {
      const issues = error?.error?.error?.issues; if (Array.isArray(issues)) this.validationMessages.set(issues);
      this.statusMessage.set(error?.error?.error?.message || 'Publishing failed. Your draft remains saved.');
    }
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
      this.slug.set(draft.slug ?? this.slugify(draft.title ?? ''));
      this.excerpt.set(draft.excerpt ?? '');
      this.category.set(draft.category ?? '');
      this.language.set(draft.language ?? 'en');
      this.tags.set(draft.tags ?? []);
      this.coverImageUrl.set(draft.coverImageUrl ?? '');
      this.seoTitle.set(draft.seoTitle ?? '');
      this.seoDescription.set(draft.seoDescription ?? '');
      this.canonicalUrl.set(draft.canonicalUrl ?? '');
      this.serverArticleId.set(draft.serverArticleId ?? null);
      this.serverRevision.set(draft.serverRevision ?? null);
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
      slug: this.slug(),
      excerpt: this.excerpt(),
      category: this.category(),
      language: this.language(),
      tags: this.tags(),
      coverImageUrl: this.coverImageUrl(),
      seoTitle: this.seoTitle(),
      seoDescription: this.seoDescription(),
      canonicalUrl: this.canonicalUrl(),
      serverArticleId: this.serverArticleId(),
      serverRevision: this.serverRevision(),
      blocks: this.blocks(),
      savedAt: new Date().toISOString()
    };
  }

  private validateDraft(): string[] {
    const issues: string[] = [];
    if (!this.title().trim()) issues.push('Add a title.');
    if (!this.slug().trim()) issues.push('Add a public URL slug.');
    if (!this.blocks().length) issues.push('Add at least one content block.');
    for (const [index, block] of this.blocks().entries()) {
      if (block.type === 'image' && !block.imageUrl.trim()) issues.push(`Block ${index + 1}: add an image URL.`);
      if (block.type === 'image' && !block.alt.trim()) issues.push(`Block ${index + 1}: add alternative text.`);
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
