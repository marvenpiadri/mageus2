import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ExplorationListState, ExplorationStateService } from '../../core/exploration-state.service';

interface FeedArticle {
  id: string; slug: string; title: string; subtitle: string; excerpt: string; category: string;
  cover_image_url: string | null; published_at: string; author_username: string; author_name: string;
  author_avatar_url: string | null;
}
interface FeedPageResponse {
  items: FeedArticle[];
  nextCursor?: string | null;
}

const signedOutState: ExplorationListState<FeedArticle> = {
  items: [], nextCursor: null, hasMore: false, loading: false, failed: false, filters: {}, scrollTop: 0
};

@Component({
  standalone: true,
  selector: 'mageus-feed-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './feed-page.component.html',
  styleUrl: './feed-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedPageComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly exploration = inject(ExplorationStateService);
  readonly auth = inject(AuthService);

  private keyFor(userId: string): string { return `feed:user:${userId}`; }
  readonly listState = computed(() => {
    const user = this.auth.user();
    return user ? this.exploration.state<FeedArticle>(this.keyFor(user.id))() : signedOutState;
  });
  readonly items = computed(() => this.listState().items);
  readonly loading = computed(() => this.listState().loading);
  readonly failed = computed(() => this.listState().failed);
  readonly hasMore = computed(() => this.listState().hasMore);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) return;
      this.exploration.registerContext('/feed', this.keyFor(user.id));
      const state = this.exploration.state<FeedArticle>(this.keyFor(user.id))();
      if (!state.items.length && state.hasMore && !state.loading && !state.failed) this.loadPage(user.id, true);
    });
  }

  loadMore(): void {
    const user = this.auth.user();
    if (user) this.loadPage(user.id, false);
  }

  private loadPage(userId: string, replace: boolean): void {
    const key = this.keyFor(userId);
    const state = this.exploration.state<FeedArticle>(key)();
    if (state.loading || (!replace && !state.hasMore)) return;
    this.exploration.patch<FeedArticle>(key, { loading: true, failed: false });
    const cursor = replace ? null : state.nextCursor;
    const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    this.http.get<FeedPageResponse>(`/api/v1/social/feed?limit=30${cursorQuery}`, {
      headers: this.auth.authorizationHeaders()
    }).pipe(
      catchError(() => {
        this.exploration.patch<FeedArticle>(key, { loading: false, failed: true });
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((response) => {
      if (!response) return;
      const nextCursor = response.nextCursor ?? null;
      if (replace) this.exploration.replacePage(key, response.items, nextCursor);
      else this.exploration.appendPage(key, response.items, nextCursor, (article) => article.id);
    });
  }
}
