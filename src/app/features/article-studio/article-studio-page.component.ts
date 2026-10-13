import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ArticleBlock, ArticleBlockType } from '../../domain/article.model';
import { ARTICLE_BLOCK_TOOLS, createEmptyBlock } from './article-block-registry';
import { AuthService } from '../../core/auth/auth.service';
import { ArticleApiService, ArticleDraftPayload, SyncedArticleDraft } from '../../core/services/article-api.service';
import { ArticleBlockEditorComponent } from './article-block-editor.component';
import { ArticleBlockRendererComponent } from './article-block-renderer.component';
import { ArticleDocument, validateArticleDocument } from './article-document';
import { createStudioItemId } from './block-id';

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
  imports: [FormsModule, RouterLink, ArticleBlockEditorComponent, ArticleBlockRendererComponent],
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
  readonly draggedBlockId = signal<string | null>(null);
  readonly dropTargetBlockId = signal<string | null>(null);
  readonly previewBlockIds = signal<string[]>([]);
  readonly statusMessage = signal('Draft stored on this device when you edit');
  readonly validationMessages = signal<string[]>([]);
  readonly lastSavedAt = signal<string | null>(null);
  readonly serverDrafts = signal<SyncedArticleDraft[]>([]);
  readonly draftsLoading = signal(false);

  readonly tools = ARTICLE_BLOCK_TOOLS;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.restoreDraft();
      if (this.auth.isAuthenticated()) void this.refreshServerDrafts();
    }
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
    const id = createStudioItemId('block');
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

  startBlockDrag(id: string, event: DragEvent): void {
    this.draggedBlockId.set(id);
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); }
  }

  onBlockDragOver(event: DragEvent, targetId: string): void {
    event.preventDefault();
    if (this.draggedBlockId() && this.draggedBlockId() !== targetId) this.dropTargetBlockId.set(targetId);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  dropBlock(event: DragEvent, targetId: string): void {
    event.preventDefault();
    const movingId = this.draggedBlockId() || event.dataTransfer?.getData('text/plain') || '';
    if (!movingId || movingId === targetId) { this.endBlockDrag(); return; }
    const current = [...this.blocks()];
    const sourceIndex = current.findIndex((block) => block.id === movingId);
    if (sourceIndex < 0) { this.endBlockDrag(); return; }
    const [moving] = current.splice(sourceIndex, 1);
    const targetIndex = current.findIndex((block) => block.id === targetId);
    current.splice(targetIndex < 0 ? current.length : targetIndex, 0, moving);
    this.blocks.set(current);
    this.endBlockDrag();
    this.markChanged();
  }

  endBlockDrag(): void { this.draggedBlockId.set(null); this.dropTargetBlockId.set(null); }

  toggleBlockPreview(id: string): void {
    this.previewBlockIds.update((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
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
    clone.id = createStudioItemId('block');
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

  async refreshServerDrafts(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.draftsLoading()) return;
    this.draftsLoading.set(true);
    try {
      this.serverDrafts.set(await this.api.listDrafts());
    } catch (error: any) {
      this.statusMessage.set(error?.error?.error?.message || error?.message || 'Could not load your server drafts.');
    } finally {
      this.draftsLoading.set(false);
    }
  }

  async openServerDraft(id: string): Promise<void> {
    if (isPlatformBrowser(this.platformId) && this.hasEditorContent() &&
        !globalThis.confirm('Replace the current editor contents with this server draft? Export your local draft first if you want to keep these unsynced changes.')) return;
    try {
      const draft = await this.api.loadDraft(id);
      this.applyServerDraft(draft);
      this.statusMessage.set('Server draft opened. Your next sync will use its revision.');
    } catch (error: any) {
      this.statusMessage.set(error?.error?.error?.message || error?.message || 'Could not open the server draft.');
    }
  }

  async reloadServerDraft(): Promise<void> {
    const id = this.serverArticleId();
    if (!id) return;
    if (isPlatformBrowser(this.platformId) &&
        !globalThis.confirm('Replace the current editor contents with the latest server draft? Export your local draft first if you want to keep these unsynced changes.')) return;
    try {
      this.applyServerDraft(await this.api.loadDraft(id));
      this.statusMessage.set('Loaded the latest server version. Your next sync will use its revision.');
    } catch (error: any) {
      this.statusMessage.set(error?.error?.error?.message || error?.message || 'Could not reload the server draft.');
    }
  }

  private hasEditorContent(): boolean {
    return Boolean(
      this.title().trim() || this.subtitle().trim() || this.slug().trim() ||
      this.excerpt().trim() || this.category().trim() || this.tags().length ||
      this.coverImageUrl().trim() || this.seoTitle().trim() ||
      this.seoDescription().trim() || this.canonicalUrl().trim() ||
      this.blocks().length
    );
  }

  private applyServerDraft(draft: SyncedArticleDraft): void {
    this.title.set(draft.title ?? '');
    this.subtitle.set(draft.subtitle ?? '');
    this.slug.set(draft.slug ?? '');
    this.excerpt.set(draft.excerpt ?? '');
    this.category.set(draft.category ?? '');
    this.language.set(draft.language ?? 'en');
    this.tags.set(draft.tags ?? []);
    this.coverImageUrl.set(draft.cover_image_url ?? '');
    this.seoTitle.set(draft.seo_title ?? '');
    this.seoDescription.set(draft.seo_description ?? '');
    this.canonicalUrl.set(draft.canonical_url ?? '');
    this.blocks.set(draft.blocks ?? []);
    this.serverArticleId.set(draft.id);
    this.serverRevision.set(draft.revision);
    this.validationMessages.set([]);
    this.persistDraft();
  }

  async syncDraft(): Promise<boolean> {
    this.persistDraft();
    if (!this.title().trim()) { this.statusMessage.set('Local draft saved · add a title before syncing.'); return false; }
    if (!this.auth.isAuthenticated()) { await this.router.navigateByUrl('/sign-in'); return false; }
    try {
      const payload: ArticleDraftPayload = {
        title: this.title().trim(), subtitle: this.subtitle(), slug: this.slug().trim() || this.slugify(this.title()),
        excerpt: this.excerpt(), category: this.category(), language: this.language(), tags: this.tags(),
        coverImageUrl: this.coverImageUrl(), blocks: this.blocks(), schemaVersion: 1,
        seoTitle: this.seoTitle(), seoDescription: this.seoDescription(), canonicalUrl: this.canonicalUrl().trim() || undefined
      };
      const saved = await this.api.saveDraft(payload, this.serverArticleId(), this.serverRevision());
      this.serverArticleId.set(saved.id); this.serverRevision.set(saved.revision); this.persistDraft(); this.statusMessage.set('Draft synced to your Mageus account.');
      void this.refreshServerDrafts();
      return true;
    } catch (error: any) { this.statusMessage.set(error?.error?.error?.message || error?.message || 'Could not sync. Your local recovery copy is safe.'); return false; }
  }

  async publishArticle(): Promise<void> {
    const errors = this.validateDraft(); this.validationMessages.set(errors);
    if (errors.length) { this.statusMessage.set('Resolve the validation notes before publishing.'); return; }
    if (!this.auth.isAuthenticated()) { await this.router.navigateByUrl('/sign-in'); return; }
    const synced = await this.syncDraft();
    if (!synced) return;
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

  async importDraft(event: Event): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object') throw new Error('The file is not a Mageus draft document.');
      const draft = parsed as Partial<StudioDraft>;
      if (draft.version !== 1 || !Array.isArray(draft.blocks) ||
          draft.blocks.some((block) => !block || typeof block !== 'object' ||
            typeof (block as ArticleBlock).id !== 'string' || typeof (block as ArticleBlock).type !== 'string')) {
        throw new Error('This draft file has an unsupported format or invalid block entries.');
      }
      if (this.hasEditorContent() &&
          !globalThis.confirm('Replace the current editor contents with this imported draft? Export your current draft first if you want to keep it.')) return;
      this.title.set(typeof draft.title === 'string' ? draft.title : '');
      this.subtitle.set(typeof draft.subtitle === 'string' ? draft.subtitle : '');
      this.slug.set(typeof draft.slug === 'string' ? draft.slug : this.slugify(typeof draft.title === 'string' ? draft.title : ''));
      this.excerpt.set(typeof draft.excerpt === 'string' ? draft.excerpt : '');
      this.category.set(typeof draft.category === 'string' ? draft.category : '');
      this.language.set(typeof draft.language === 'string' ? draft.language : 'en');
      this.tags.set(Array.isArray(draft.tags) ? draft.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 30) : []);
      this.coverImageUrl.set(typeof draft.coverImageUrl === 'string' ? draft.coverImageUrl : '');
      this.seoTitle.set(typeof draft.seoTitle === 'string' ? draft.seoTitle : '');
      this.seoDescription.set(typeof draft.seoDescription === 'string' ? draft.seoDescription : '');
      this.canonicalUrl.set(typeof draft.canonicalUrl === 'string' ? draft.canonicalUrl : '');
      this.blocks.set(draft.blocks);
      // Portable imports must never silently overwrite the server article referenced by the exported copy.
      this.serverArticleId.set(null);
      this.serverRevision.set(null);
      this.validationMessages.set(this.validateDraft());
      this.persistDraft();
      this.statusMessage.set('Draft imported locally. Review validation notes, then sync to create a separate server draft.');
    } catch (error: unknown) {
      this.statusMessage.set(error instanceof Error ? error.message : 'Could not import this draft file.');
    } finally {
      input.value = '';
    }
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
    const document: ArticleDocument = {
      documentType: 'mageus.article',
      schemaVersion: 1,
      id: this.serverArticleId(),
      channelId: null,
      status: 'draft',
      metadata: {
        title: this.title(),
        subtitle: this.subtitle(),
        slug: this.slug(),
        excerpt: this.excerpt(),
        coverImage: this.coverImageUrl(),
        category: this.category(),
        language: this.language(),
        tags: this.tags(),
        seoTitle: this.seoTitle(),
        seoDescription: this.seoDescription(),
        canonicalUrl: this.canonicalUrl()
      },
      blocks: this.blocks(),
      revision: this.serverRevision() ?? 0,
      updatedAt: new Date().toISOString()
    };
    return validateArticleDocument(document)
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.path}: ${issue.message}`);
  }

  private slugify(value: string): string {
    return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
