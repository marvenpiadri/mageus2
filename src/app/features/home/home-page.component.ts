import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ExplorationStateService } from '../../core/exploration-state.service';

interface HomeArticle {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  category: string;
  cover_image_url: string | null;
  published_at: string;
  author_username: string;
  author_name: string;
}

interface PublishedArticleList {
  items: HomeArticle[];
  nextCursor: string | null;
}

@Component({
  standalone: true,
  selector: 'mageus-home-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly exploration = inject(ExplorationStateService);

  private readonly listKey = 'home:published-articles';
  readonly listState = this.exploration.state<HomeArticle>(this.listKey);
  readonly articles = computed(() => this.listState().items);
  readonly loading = computed(() => this.listState().loading);
  readonly loadFailed = computed(() => this.listState().failed);
  readonly hasMore = computed(() => this.listState().hasMore);
  private readonly apiBase = this.resolveApiBase();

  constructor() {
    this.exploration.registerContext('/', this.listKey);
    if (!this.listState().items.length && !this.listState().loading) {
      this.loadPage(true);
    }
  }

  loadMore(): void {
    this.loadPage(false);
  }

  private loadPage(replace: boolean): void {
    // Never SSR-fetch the frontend's own /api path: without MAGEUS_API_URL that can
    // recursively render this page instead of reaching the separate API service.
    if (!isPlatformBrowser(this.platformId) && !this.apiBase) return;
    const current = this.listState();
    if (current.loading || (!replace && !current.hasMore)) return;
    this.exploration.patch<HomeArticle>(this.listKey, { loading: true, failed: false });
    const cursor = replace ? null : current.nextCursor;
    const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    this.http.get<PublishedArticleList>(`${this.apiBase ?? '/api/v1/articles'}?limit=6${cursorQuery}`).pipe(
      catchError(() => {
        this.exploration.patch<HomeArticle>(this.listKey, { loading: false, failed: true });
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((response) => {
      if (!response) return;
      if (replace) {
        this.exploration.replacePage(this.listKey, response.items, response.nextCursor);
      } else {
        this.exploration.appendPage(this.listKey, response.items, response.nextCursor, (article) => article.id);
      }
    });
  }

  private resolveApiBase(): string | null {
    if (typeof process !== 'undefined' && process.env['MAGEUS_API_URL']) {
      return process.env['MAGEUS_API_URL'].replace(/\/$/, '') + '/articles';
    }
    // The browser can use the same-origin proxy. SSR must use an explicit API origin;
    // falling back to the page origin can cause a recursive self-request.
    return isPlatformBrowser(this.platformId) ? '/api/v1/articles' : null;
  }
}
