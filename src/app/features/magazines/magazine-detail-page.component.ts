import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, REQUEST, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

interface MagazineIssue {
  id: string; slug: string; title: string; issue_number: number; summary: string;
  cover_image_url: string | null; published_at: string; article_count?: number;
  magazine_title?: string; magazine_cover_image_url?: string | null; author_username?: string; author_name?: string;
}
interface Magazine {
  id: string; slug: string; title: string; description: string; cover_image_url: string | null;
  author_username: string; author_name: string; published_at: string;
}
interface MagazineArticle {
  id: string; slug: string; title: string; subtitle: string; excerpt: string;
  category: string; cover_image_url: string | null; published_at: string;
  sort_order: number; section_title: string;
}

@Component({
  standalone: true,
  selector: 'mageus-magazine-detail-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './magazine-detail-page.component.html',
  styleUrl: './magazine-detail-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MagazineDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  readonly auth = inject(AuthService);
  readonly magazine = signal<Magazine | null>(null);
  readonly issues = signal<MagazineIssue[]>([]);
  readonly issue = signal<MagazineIssue | null>(null);
  readonly articles = signal<MagazineArticle[]>([]);
  readonly articleOptions = signal<Array<{id:string;slug:string;title:string;excerpt:string;cover_image_url:string|null}>>([]);
  readonly managing = signal(false);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly issueTitle = signal('');
  readonly issueSlug = signal('');
  readonly issueNumber = signal('1');
  readonly issueSummary = signal('');
  readonly selectedArticleIds = signal<string[]>([]);
  readonly busy = signal(false);
  readonly message = signal('');
  private readonly apiBase = this.resolveApiBase();

  constructor() {
    this.route.paramMap.pipe(
      switchMap((params) => {
        const username = encodeURIComponent(params.get('username') ?? '');
        const magazineSlug = encodeURIComponent(params.get('magazineSlug') ?? '');
        const issueSlug = params.get('issueSlug');
        this.loading.set(true); this.failed.set(false); this.magazine.set(null);
        this.issue.set(null); this.issues.set([]); this.articles.set([]);
        const url = issueSlug
          ? `${this.apiBase}/${username}/${magazineSlug}/issues/${encodeURIComponent(issueSlug)}`
          : `${this.apiBase}/${username}/${magazineSlug}`;
        return this.http.get<any>(url).pipe(catchError(() => of(null)));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result) => {
      if (!result) { this.failed.set(true); this.loading.set(false); return; }
      if (result.issue) {
        this.issue.set(result.issue);
        this.articles.set(result.articles ?? []);
        const author = result.issue.author_name || result.issue.author_username || 'Mageus';
        const magazineTitle = result.issue.magazine_title || 'Magazine';
        this.titleService.setTitle(`${result.issue.title} · ${magazineTitle} · Mageus`);
        this.meta.updateTag({ name: 'description', content: (result.issue.summary || `Issue ${result.issue.issue_number} of ${magazineTitle}, by ${author}.`).slice(0, 300) });
        this.meta.updateTag({ property: 'og:type', content: 'article' });
        this.meta.updateTag({ property: 'og:title', content: result.issue.title });
        this.meta.updateTag({ property: 'og:description', content: result.issue.summary || magazineTitle });
        if (result.issue.cover_image_url) this.meta.updateTag({ property: 'og:image', content: result.issue.cover_image_url });
        const issuePath = `/${encodeURIComponent(result.issue.author_username)}/magazines/${encodeURIComponent(result.issue.magazine_slug)}/issues/${encodeURIComponent(result.issue.slug)}`;
        this.updateCanonicalAndStructuredData(issuePath, {
          '@type': 'PublicationIssue', name: result.issue.title, headline: result.issue.title,
          description: result.issue.summary || magazineTitle, issueNumber: result.issue.issue_number,
          datePublished: result.issue.published_at, isPartOf: { '@type': 'Periodical', name: magazineTitle },
          author: { '@type': 'Person', name: author }
        });
      } else {
        this.magazine.set(result.magazine);
        this.issues.set(result.issues ?? []);
        const magazine = result.magazine as Magazine;
        this.titleService.setTitle(`${magazine.title} · Mageus`);
        this.meta.updateTag({ name: 'description', content: (magazine.description || `Explore issues of ${magazine.title} on Mageus.`).slice(0, 300) });
        this.meta.updateTag({ property: 'og:type', content: 'website' });
        this.meta.updateTag({ property: 'og:title', content: magazine.title });
        this.meta.updateTag({ property: 'og:description', content: magazine.description || magazine.title });
        if (magazine.cover_image_url) this.meta.updateTag({ property: 'og:image', content: magazine.cover_image_url });
        const magazinePath = `/${encodeURIComponent(magazine.author_username)}/magazines/${encodeURIComponent(magazine.slug)}`;
        this.updateCanonicalAndStructuredData(magazinePath, {
          '@type': 'Periodical', name: magazine.title, description: magazine.description,
          publisher: { '@type': 'Organization', name: magazine.author_name },
          hasPart: (result.issues ?? []).map((edition: MagazineIssue) => ({
            '@type': 'PublicationIssue', name: edition.title,
            url: `${magazinePath}/issues/${encodeURIComponent(edition.slug)}`,
            issueNumber: edition.issue_number, datePublished: edition.published_at
          }))
        });
        this.loadManagementData(magazine);
      }
      this.loading.set(false);
    });
  }

  updateIssueTitle(value: string): void {
    const previousGeneratedSlug = this.slugify(this.issueTitle());
    this.issueTitle.set(value);
    if (!this.issueSlug() || this.issueSlug() === previousGeneratedSlug) this.issueSlug.set(this.slugify(value));
  }

  setArticleSelected(id: string, checked: boolean): void {
    this.selectedArticleIds.update((ids) => checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id));
  }

  createIssue(): void {
    const magazine = this.magazine();
    if (!magazine || !this.managing() || this.busy()) return;
    if (!this.issueTitle().trim() || !this.slugify(this.issueSlug())) { this.message.set('Give this issue a title and URL name.'); return; }
    if (!this.selectedArticleIds().length) { this.message.set('Select at least one of your published articles for this issue.'); return; }
    const number = Number(this.issueNumber());
    if (!Number.isInteger(number) || number < 1) { this.message.set('Issue number must be a positive whole number.'); return; }
    this.busy.set(true); this.message.set('');
    const headers = this.auth.authorizationHeaders();
    this.http.post<{issue:{id:string}}>(`${this.apiBase}/${encodeURIComponent(magazine.id)}/issues`, {
      title: this.issueTitle().trim(), slug: this.slugify(this.issueSlug()), issueNumber: number,
      summary: this.issueSummary().trim()
    }, {headers}).pipe(
      switchMap((created) => this.http.put(
        `${this.apiBase}/${encodeURIComponent(magazine.id)}/issues/${encodeURIComponent(created.issue.id)}/articles`,
        {articles: this.selectedArticleIds().map((articleId) => ({articleId, sectionTitle: ''}))}, {headers}
      ).pipe(switchMap(() => this.http.patch(
        `${this.apiBase}/${encodeURIComponent(magazine.id)}/issues/${encodeURIComponent(created.issue.id)}/publish`, {}, {headers}
      )))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.issueTitle.set(''); this.issueSlug.set(''); this.issueSummary.set(''); this.selectedArticleIds.set([]);
        this.issueNumber.set(String(number + 1)); this.message.set('Issue published and added to the magazine.');
        this.busy.set(false); this.reloadMagazine();
      },
      error: (error) => {
        this.message.set(error?.error?.error?.message || 'The issue could not be published. Check the issue number and selected articles.');
        this.busy.set(false);
      }
    });
  }

  private loadManagementData(magazine: Magazine): void {
    if (!this.auth.isAuthenticated()) return;
    const headers = this.auth.authorizationHeaders();
    this.http.get<{items:Magazine[]}>(`${this.apiBase}/mine`, {headers}).pipe(catchError(() => of({items:[]})), takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
      this.managing.set((result.items ?? []).some((item) => item.id === magazine.id));
      if (!this.managing()) return;
      this.http.get<{items:Array<{id:string;slug:string;title:string;excerpt:string;cover_image_url:string|null}>}>(`${this.apiBase}/mine/articles`, {headers})
        .pipe(catchError(() => of({items:[]})), takeUntilDestroyed(this.destroyRef))
        .subscribe((articles) => this.articleOptions.set(articles.items ?? []));
      const nextNumber = Math.max(0, ...this.issues().map((item) => item.issue_number)) + 1;
      this.issueNumber.set(String(nextNumber));
    });
  }

  private reloadMagazine(): void {
    const magazine = this.magazine();
    if (!magazine) return;
    this.http.get<{magazine:Magazine;issues:MagazineIssue[]}>(`${this.apiBase}/${encodeURIComponent(magazine.author_username)}/${encodeURIComponent(magazine.slug)}`)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => this.issues.set(result.issues ?? []));
  }

  private updateCanonicalAndStructuredData(path: string, schema: Record<string, unknown>): void {
    let canonical = path;
    if (this.request?.url) {
      try { canonical = new URL(path, this.request.url).toString(); } catch { /* keep the relative route */ }
    } else if (this.document.location?.origin) {
      canonical = new URL(path, this.document.location.origin).toString();
    }
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    let link = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);
    let structuredData = this.document.getElementById('mageus-magazine-jsonld') as HTMLScriptElement | null;
    if (!structuredData) {
      structuredData = this.document.createElement('script');
      structuredData.id = 'mageus-magazine-jsonld';
      structuredData.type = 'application/ld+json';
      this.document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify({
      '@context': 'https://schema.org', ...schema, url: canonical
    }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  }

  private slugify(value: string): string {
    return value.toLowerCase().trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  }

  private resolveApiBase(): string {
    if (typeof process !== 'undefined' && process.env['MAGEUS_API_URL']) return process.env['MAGEUS_API_URL'].replace(/\/$/, '') + '/magazines';
    if (!isPlatformBrowser(this.platformId) && this.request?.url) return new URL('/api/v1/magazines', this.request.url).toString();
    return '/api/v1/magazines';
  }
}
