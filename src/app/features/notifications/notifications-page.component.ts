import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

interface MageusNotification {
  id: string;
  type: 'follow' | 'like' | 'comment' | 'vote' | 'mention' | 'publication' | 'system';
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor_username: string | null;
  actor_name: string | null;
}

@Component({
  standalone: true,
  selector: 'mageus-notifications-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly notifications = signal<MageusNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly busy = signal(false);
  private loadedForUser: string | null = null;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) {
        this.loadedForUser = null;
        this.notifications.set([]);
        this.unreadCount.set(0);
        this.loading.set(false);
        return;
      }
      if (this.loadedForUser === user.id) return;
      this.loadedForUser = user.id;
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.http.get<{ notifications: MageusNotification[]; unreadCount: number }>('/api/v1/social/notifications?limit=50', {
      headers: this.auth.authorizationHeaders()
    }).pipe(
      catchError(() => {
        this.failed.set(true);
        return of({ notifications: [], unreadCount: 0 });
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result) => {
      this.notifications.set(result.notifications);
      this.unreadCount.set(result.unreadCount);
      this.loading.set(false);
    });
  }

  markRead(notification: MageusNotification): void {
    if (notification.read_at || this.busy()) return;
    this.http.patch<{ notification: { id: string; read_at: string } }>(
      `/api/v1/social/notifications/${encodeURIComponent(notification.id)}/read`,
      {},
      { headers: this.auth.authorizationHeaders() }
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.notifications.update((items) => items.map((item) => item.id === notification.id ? { ...item, read_at: result.notification.read_at } : item));
        this.unreadCount.update((count) => Math.max(0, count - 1));
      }
    });
  }

  markAllRead(): void {
    if (!this.unreadCount() || this.busy()) return;
    this.busy.set(true);
    this.http.patch<{ markedRead: number }>('/api/v1/social/notifications/read-all', {}, {
      headers: this.auth.authorizationHeaders()
    }).pipe(
      catchError(() => of(null)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result) => {
      if (result) {
        const readAt = new Date().toISOString();
        this.notifications.update((items) => items.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
        this.unreadCount.set(0);
      }
      this.busy.set(false);
    });
  }

  message(notification: MageusNotification): string {
    switch (notification.type) {
      case 'follow': return 'started following your channel.';
      case 'like': return 'liked your article.';
      case 'comment': return 'commented on your article.';
      case 'vote': return 'rated your article.';
      case 'mention': return 'mentioned you.';
      case 'publication': return 'published something new.';
      default: return 'sent you a Mageus update.';
    }
  }
}
