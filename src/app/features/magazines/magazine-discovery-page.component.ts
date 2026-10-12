import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, REQUEST, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ExplorationStateService } from '../../core/exploration-state.service';

interface Magazine {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_image_url: string | null;
  author_username: string;
  author_name: string;
  issue_count: number;
  published_at: string;
}
interface MagazinePage { items: Magazine[]; nextCursor: string | null; }

@Component({
  standalone: true,
  selector: 'mageus-magazine-discovery-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './magazine-discovery-page.component.html',
  styleUrl: './magazine-discovery-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MagazineDiscoveryPageComponent {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly exploration = inject(ExplorationStateService);
  private readonly listKey = 'magazines:published';
  private readonly apiBase = this.resolveApiBase();
  readonly auth = inject(AuthService);
  readonly listState = this.exploration.state<Magazine>(this.listKey);
  readonly items = computed(() => this.listState().items);
  readonly loading = computed(() => this.listState().loading);
  readonly failed = computed(() => this.listState().failed);
  readonly hasMore = computed(() => this.listState().hasMore);
  readonly title = signal('');
  readonly slug = signal('');
  readonly description = signal('');
  readonly coverImageUrl = signal('');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly hasTitle = computed(() => this.title().trim().length > 0);

  constructor() {
    this.exploration.registerContext('/magazines', this.listKey);
    if (!this.listState().items.length && !this.listState().loading) this.loadPage(true);
  }

  updateTitle(value: string): void {
    const previousGeneratedSlug = this.slugify(this.title());
    this.title.set(value);
    if (!this.slug() || this.slug() === previousGeneratedSlug) this.slug.set(this.slugify(value));
  }

  load(): void { this.loadPage(true); }
  loadMore(): void { this.loadPage(false); }

  private loadPage(replace: boolean): void {
    const current = this.listState();
    if (current.loading || (!replace && !current.hasMore)) return;
    this.exploration.patch<Magazine>(this.listKey, { loading: true, failed: false });
    const cursor = replace ? null : current.nextCursor;
    const query = new URLSearchParams({ limit: '24' });
    if (cursor) query.set('cursor', cursor);
    this.http.get<MagazinePage>(this.apiBase + '?' + query.toString()).pipe(
      catchError(() => {
        this.exploration.patch<Magazine>(this.listKey, { loading: false, failed: true });
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result) => {
      if (!result) return;
      if (replace) this.exploration.replacePage(this.listKey, result.items ?? [], result.nextCursor);
      else this.exploration.appendPage(this.listKey, result.items ?? [], result.nextCursor, (item) => item.id);
    });
  }

  createMagazine(): void {
    if (!this.auth.isAuthenticated() || !this.hasTitle() || this.busy()) return;
    const cleanSlug = this.slugify(this.slug());
    if (!cleanSlug) { this.message.set('Add a short URL name for the magazine.'); return; }
    this.busy.set(true);
    this.message.set('');
    this.http.post<{ magazine: { id: string } }>(this.apiBase, {
      title: this.title().trim(), slug: cleanSlug, description: this.description().trim(),
      coverImageUrl: this.coverImageUrl().trim() || null
    }, { headers: this.auth.authorizationHeaders() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.http.patch(this.apiBase + '/' + encodeURIComponent(result.magazine.id) + '/publish', {}, {
          headers: this.auth.authorizationHeaders()
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: () => {
            this.title.set(''); this.slug.set(''); this.description.set(''); this.coverImageUrl.set('');
            this.message.set('Magazine published. Open it to create your first issue.');
            this.busy.set(false); this.load();
          },
          error: () => { this.message.set('The magazine was created but could not be published. Refresh and check your publication list.'); this.busy.set(false); }
        });
      },
      error: (error) => {
        this.message.set(error?.error?.error?.message || 'The magazine could not be created. Check the details and try again.');
        this.busy.set(false);
      }
    });
  }

  private resolveApiBase(): string {
    if (typeof process !== 'undefined' && process.env['MAGEUS_API_URL']) return process.env['MAGEUS_API_URL'].replace(/\/$/, '') + '/magazines';
    if (!isPlatformBrowser(this.platformId) && this.request?.url) return new URL('/api/v1/magazines', this.request.url).toString();
    return '/api/v1/magazines';
  }

  private slugify(value: string): string {
    return value.toLowerCase().trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  }
}
