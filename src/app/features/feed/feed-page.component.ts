import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

interface FeedArticle {
  id: string; slug: string; title: string; subtitle: string; excerpt: string; category: string;
  cover_image_url: string | null; published_at: string; author_username: string; author_name: string;
  author_avatar_url: string | null;
}

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
  readonly auth = inject(AuthService);
  readonly items = signal<FeedArticle[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  private loadedForUser: string | null = null;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) {
        this.loadedForUser = null;
        this.items.set([]);
        this.loading.set(false);
        return;
      }
      if (this.loadedForUser === user.id) return;
      this.loadedForUser = user.id;
      this.loading.set(true);
      this.failed.set(false);
      this.http.get<{ items: FeedArticle[] }>('/api/v1/social/feed?limit=30', {
        headers: this.auth.authorizationHeaders()
      }).pipe(
        catchError(() => {
          this.failed.set(true);
          return of({ items: [] });
        }),
        takeUntilDestroyed(this.destroyRef)
      ).subscribe((response) => {
        this.items.set(response.items);
        this.loading.set(false);
      });
    });
  }
}
