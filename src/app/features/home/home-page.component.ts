import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, REQUEST, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

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

  readonly articles = signal<HomeArticle[]>([]);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);

  private readonly apiBase = this.resolveApiBase();

  constructor() {
    this.http.get<PublishedArticleList>(`${this.apiBase}?limit=6`).pipe(
      catchError(() => {
        this.loadFailed.set(true);
        return of({ items: [], nextCursor: null } satisfies PublishedArticleList);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((response) => {
      this.articles.set(response.items);
      this.loading.set(false);
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
