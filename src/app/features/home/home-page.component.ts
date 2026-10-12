import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, REQUEST, computed, inject, signal } from '@angular/core';
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
  private readonly request = inject(REQUEST, { optional: true });
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
    if (!this.listState().items.length && !this.listState().loading) {
      this.loadPage(true);
    }
  }

  loadMore(): void {
    this.loadPage(false);
  }

  private loadPage(replace: boolean): void {
    const current = this.listState();
    if (current.loading || (!replace && !current.hasMore)) return;
    this.exploration.patch<HomeArticle>(this.listKey, { loading: true, failed: false });
    const cursor = replace ? null : current.nextCursor;
    const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    this.http.get<PublishedArticleList>(`${this.apiBase}?limit=6${cursorQuery}`).pipe(
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

  private resolveApiBase(): string {
    if (typeof process !== 'undefined' && process.env['MAGEUS_API_URL']) {
      return process.env['MAGEUS_API_URL'].replace(/\/$/, '') + '/articles';
    }
    if (!isPlatformBrowser(this.platformId) && this.request?.url) {
      return new URL('/api/v1/articles', this.request.url).toString();
    }
    return '/api/v1/articles';
  }
}
