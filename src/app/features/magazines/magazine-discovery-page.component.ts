import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

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
  readonly auth = inject(AuthService);
  readonly items = signal<Magazine[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly title = signal('');
  readonly slug = signal('');
  readonly description = signal('');
  readonly coverImageUrl = signal('');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly hasTitle = computed(() => this.title().trim().length > 0);

  constructor() { this.load(); }

  updateTitle(value: string): void {
    this.title.set(value);
    if (!this.slug() || this.slug() === this.slugify(this.title())) this.slug.set(this.slugify(value));
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.http.get<{ items: Magazine[] }>('/api/v1/magazines?limit=24').subscribe({
      next: (result) => { this.items.set(result.items ?? []); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); }
    });
  }

  createMagazine(): void {
    if (!this.auth.isAuthenticated() || !this.hasTitle() || this.busy()) return;
    const cleanSlug = this.slugify(this.slug());
    if (!cleanSlug) { this.message.set('Add a short URL name for the magazine.'); return; }
    this.busy.set(true);
    this.message.set('');
    this.http.post<{ magazine: { id: string } }>('/api/v1/magazines', {
      title: this.title().trim(), slug: cleanSlug, description: this.description().trim(),
      coverImageUrl: this.coverImageUrl().trim() || null
    }, { headers: this.auth.authorizationHeaders() }).subscribe({
      next: (result) => {
        this.http.patch('/api/v1/magazines/' + encodeURIComponent(result.magazine.id) + '/publish', {}, {
          headers: this.auth.authorizationHeaders()
        }).subscribe({
          next: () => {
            this.title.set(''); this.slug.set(''); this.description.set(''); this.coverImageUrl.set('');
            this.message.set('Magazine published. Open it to create your first issue.');
            this.busy.set(false); this.load();
          },
          error: () => { this.message.set('The magazine was created but could not be published. Try again from your magazine page.'); this.busy.set(false); }
        });
      },
      error: (error) => {
        this.message.set(error?.error?.error?.message || 'The magazine could not be created. Check the details and try again.');
        this.busy.set(false);
      }
    });
  }

  private slugify(value: string): string {
    return value.toLowerCase().trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  }
}
