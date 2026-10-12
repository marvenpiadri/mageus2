import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, REQUEST, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ExplorationListState, ExplorationStateService } from '../../core/exploration-state.service';

type ProfileSection = 'articles' | 'shops' | 'menus' | 'locations';

interface ProfileLocation {
  id: string; name: string; slug: string; address: string; google_place_id: string | null;
  latitude: number | null; longitude: number | null; phone: string | null; is_primary: boolean;
}
interface ProfileProduct {
  id: string; name: string; slug: string; description: string; image_url: string | null;
  price_amount: string | number | null; currency: string;
}
interface ProfileService extends ProfileProduct { booking_url: string | null; }
interface ProfileStore {
  id: string; name: string; slug: string; description: string; fulfillment_type: 'physical' | 'online' | 'hybrid';
  location_id: string | null; location_name: string | null; location_slug: string | null;
  product_count: number; service_count: number; products: ProfileProduct[]; services: ProfileService[];
}
interface ProfileMenuItem {
  id: string; name: string; description: string; image_url: string | null; price_amount: string | number | null;
  currency: string; category: string; is_available: boolean;
}
interface ProfileMenu {
  id: string; name: string; slug: string; description: string; pdf_url: string | null; location_id: string;
  location_name: string; location_slug: string; items: ProfileMenuItem[];
}
interface ProfileArticle {
  id: string; slug: string; title: string; subtitle: string; excerpt: string; category: string;
  cover_image_url: string | null; published_at: string;
}
interface PublicProfile {
  profile: {
    id: string; username: string; display_name: string; bio: string; avatar_url: string | null;
    created_at: string; follower_count: number; following_count: number;
  };
  locations: ProfileLocation[];
  storefronts: ProfileStore[];
  menus: ProfileMenu[];
  articles: ProfileArticle[];
  articlesNextCursor?: string | null;
}

interface ProfileArticlesResponse {
  items: ProfileArticle[];
  nextCursor: string | null;
}

const emptyProfileArticleState: ExplorationListState<ProfileArticle> = {
  items: [], nextCursor: null, hasMore: false, loading: false, failed: false, filters: {}, scrollTop: 0
};

@Component({
  standalone: true,
  selector: 'mageus-public-profile-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './public-profile-page.component.html',
  styleUrl: './public-profile-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicProfilePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly exploration = inject(ExplorationStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  readonly auth = inject(AuthService);
  readonly profileData = signal<PublicProfile | null>(null);
  private articleKey(username: string): string { return `profile:${username.toLowerCase()}:articles`; }
  readonly articleListState = computed(() => {
    const username = this.profileData()?.profile.username;
    return username ? this.exploration.state<ProfileArticle>(this.articleKey(username))() : emptyProfileArticleState;
  });
  readonly articles = computed(() => this.articleListState().items);
  readonly articlesLoading = computed(() => this.articleListState().loading);
  readonly articlesFailed = computed(() => this.articleListState().failed);
  readonly articlesHasMore = computed(() => this.articleListState().hasMore);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly section = signal<ProfileSection>('articles');
  readonly following = signal(false);
  readonly followBusy = signal(false);
  readonly followMessage = signal('');
  readonly editingProfile = signal(false);
  readonly profileDisplayName = signal('');
  readonly profileBio = signal('');
  readonly profileAvatarUrl = signal('');
  readonly profileSaveBusy = signal(false);
  readonly profileSaveMessage = signal('');
  private readonly apiBase = this.resolveApiBase();

  constructor() {
    effect(() => {
      const profile = this.profileData()?.profile;
      if (profile && this.auth.isAuthenticated()) this.refreshFollowing(profile.username);
    });

    this.route.paramMap.pipe(
      switchMap((params) => {
        this.loading.set(true);
        this.notFound.set(false);
        this.profileData.set(null);
        const username = encodeURIComponent(params.get('username') ?? '');
        return this.http.get<PublicProfile>(`${this.apiBase}/${username}`).pipe(catchError(() => of(null)));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((data) => {
      this.profileData.set(data);
      if (data) {
        const articleKey = this.articleKey(data.profile.username);
        this.exploration.registerContext(`/${data.profile.username}`, articleKey);
        const existingArticleState = this.exploration.state<ProfileArticle>(articleKey)();
        if (!existingArticleState.items.length) {
          this.exploration.replacePage(articleKey, data.articles, data.articlesNextCursor ?? null);
        }
        this.profileDisplayName.set(data.profile.display_name || '');
        this.profileBio.set(data.profile.bio || '');
        this.profileAvatarUrl.set(data.profile.avatar_url || '');
      }
      this.editingProfile.set(false);
      this.profileSaveMessage.set('');
      this.loading.set(false);
      this.notFound.set(!data);
      this.section.set('articles');
      this.following.set(false);
      if (data) {
        const name = data.profile.display_name || data.profile.username;
        this.titleService.setTitle(`@${data.profile.username} · ${name} | Mageus`);
        this.meta.updateTag({ name: 'description', content: (data.profile.bio || `Explore articles, shops, menus, and services from ${name} on Mageus.`).slice(0, 300) });
        this.meta.updateTag({ property: 'og:type', content: 'profile' });
        this.meta.updateTag({ property: 'og:title', content: `@${data.profile.username} · ${name}` });
        this.meta.updateTag({ property: 'og:description', content: data.profile.bio || `Explore ${name} on Mageus.` });
        if (data.profile.avatar_url) this.meta.updateTag({ property: 'og:image', content: data.profile.avatar_url });
      }
    });
  }

  loadMoreArticles(): void {
    const username = this.profileData()?.profile.username;
    if (!username) return;
    const key = this.articleKey(username);
    const state = this.exploration.state<ProfileArticle>(key)();
    if (state.loading || !state.hasMore) return;
    this.exploration.patch<ProfileArticle>(key, { loading: true, failed: false });
    const cursor = state.nextCursor;
    const cursorQuery = cursor ? `?limit=12&cursor=${encodeURIComponent(cursor)}` : '?limit=12';
    this.http.get<ProfileArticlesResponse>(`/api/v1/social/profiles/${encodeURIComponent(username)}/articles${cursorQuery}`, {
      headers: this.auth.authorizationHeaders()
    }).pipe(
      catchError(() => {
        this.exploration.patch<ProfileArticle>(key, { loading: false, failed: true });
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((response) => {
      if (response) this.exploration.appendPage(key, response.items, response.nextCursor, (article) => article.id);
    });
  }

  startEditingProfile(): void {
    const profile = this.profileData()?.profile;
    if (!profile || !this.isOwnProfile(profile.username)) return;
    this.profileDisplayName.set(profile.display_name || '');
    this.profileBio.set(profile.bio || '');
    this.profileAvatarUrl.set(profile.avatar_url || '');
    this.profileSaveMessage.set('');
    this.editingProfile.set(true);
  }

  cancelEditingProfile(): void {
    this.editingProfile.set(false);
    this.profileSaveMessage.set('');
  }

  saveProfile(): void {
    if (this.profileSaveBusy()) return;
    const displayName = this.profileDisplayName().trim();
    const bio = this.profileBio().trim();
    const avatarInput = this.profileAvatarUrl().trim();
    if (!displayName) {
      this.profileSaveMessage.set('Add a display name before saving.');
      return;
    }
    if (avatarInput && !avatarInput.startsWith('https://')) {
      this.profileSaveMessage.set('Use an HTTPS URL for the profile image, or leave it empty.');
      return;
    }
    this.profileSaveBusy.set(true);
    this.profileSaveMessage.set('');
    this.http.patch<{ profile: { id: string; username: string; display_name: string; bio: string; avatar_url: string | null; created_at: string } }>(
      '/api/v1/social/me/profile',
      { displayName, bio, avatarUrl: avatarInput || null },
      { headers: this.auth.authorizationHeaders() }
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.profileData.update((data) => data ? { ...data, profile: { ...data.profile, ...result.profile } } : data);
        this.auth.user.update((user) => user ? { ...user, displayName: result.profile.display_name } : user);
        this.profileSaveMessage.set('Profile updated.');
        this.profileSaveBusy.set(false);
        this.editingProfile.set(false);
      },
      error: (error) => {
        this.profileSaveMessage.set(error?.error?.error?.message || 'Your profile could not be saved. Please try again.');
        this.profileSaveBusy.set(false);
      }
    });
  }

  private resolveApiBase(): string {
    if (typeof process !== 'undefined' && process.env['MAGEUS_API_URL']) {
      return process.env['MAGEUS_API_URL'].replace(/\/$/, '') + '/social/profiles';
    }
    if (!isPlatformBrowser(this.platformId) && this.request?.url) {
      return new URL('/api/v1/social/profiles', this.request.url).toString();
    }
    return '/api/v1/social/profiles';
  }

  isOwnProfile(username: string): boolean {
    return this.auth.user()?.username === username;
  }

  private refreshFollowing(username: string): void {
    this.http.get<{ following: boolean }>(
      `/api/v1/social/profiles/${encodeURIComponent(username)}/following`,
      { headers: this.auth.authorizationHeaders() }
    ).pipe(
      catchError(() => of({ following: false })),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result) => this.following.set(result.following));
  }

  hasMenuForLocation(locationId: string, menus: ProfileMenu[]): boolean {
    return menus.some((menu) => menu.location_id === locationId);
  }

  toggleFollow(): void {
    const profile = this.profileData()?.profile;
    if (!profile || this.followBusy()) return;
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/sign-in'], { queryParams: { returnUrl: '/' + profile.username } });
      return;
    }
    this.followBusy.set(true);
    this.followMessage.set('');
    const url = `/api/v1/social/profiles/${encodeURIComponent(profile.username)}/follow`;
    const request = this.following()
      ? this.http.delete<{ following: boolean; followerCount: number }>(url, { headers: this.auth.authorizationHeaders() })
      : this.http.post<{ following: boolean; followerCount: number }>(url, {}, { headers: this.auth.authorizationHeaders() });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.following.set(result.following);
        this.profileData.update((data) => data ? {
          ...data,
          profile: { ...data.profile, follower_count: result.followerCount }
        } : data);
        this.followMessage.set(result.following ? 'You are now following this profile.' : 'You unfollowed this profile.');
        this.followBusy.set(false);
      },
      error: () => {
        this.followMessage.set('Could not update your follow. Please try again.');
        this.followBusy.set(false);
      }
    });
  }

  mapUrl(location: ProfileLocation): string {
    const query = location.google_place_id
      ? `query_place_id=${encodeURIComponent(location.google_place_id)}&query=${encodeURIComponent(location.address || location.name)}`
      : `query=${encodeURIComponent(location.latitude !== null && location.longitude !== null ? `${location.latitude},${location.longitude}` : location.address || location.name)}`;
    return `https://www.google.com/maps/search/?api=1&${query}`;
  }

  formatPrice(amount: string | number | null, currency: string): string {
    if (amount === null || amount === undefined || amount === '') return 'Ask for price';
    const value = Number(amount);
    if (!Number.isFinite(value)) return 'Ask for price';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
    catch { return `${value.toFixed(2)} ${currency}`; }
  }
}
