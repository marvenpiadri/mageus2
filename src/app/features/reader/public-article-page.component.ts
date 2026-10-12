import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { REQUEST } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, of, Subject, switchMap } from 'rxjs';
import { ArticleBlock } from '../../domain/article.model';
import { MatSliderModule } from '@angular/material/slider';
import { AuthService } from '../../core/auth/auth.service';
import { ArticleBlockRendererComponent } from '../article-studio/article-block-renderer.component';
import { ReadingMoodService } from '../../core/reading-mood.service';

interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  cover_image_url: string | null;
  blocks: ArticleBlock[];
  schema_version: number;
  published_at: string;
  author_username: string;
  author_name: string;
  author_avatar_url: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
}

@Component({
  standalone: true,
  selector: 'mageus-public-article-page',
  imports: [CommonModule, RouterLink, MatSliderModule, ArticleBlockRendererComponent],
  templateUrl: './public-article-page.component.html',
  styleUrl: './public-article-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicArticlePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly request = inject(REQUEST, { optional: true });
  readonly moods = inject(ReadingMoodService);
  readonly auth = inject(AuthService);
  readonly voteValue = signal(50);
  readonly voteAverage = signal(0);
  readonly voteCount = signal(0);
  readonly voteMessage = signal('');
  private readonly voteChanges = new Subject<{ articleId: string; value: number }>();
  readonly article = signal<PublicArticle | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly moodMenuOpen = signal(false);
  readonly progress = signal(0);

  private readonly apiBase = this.resolveApiBase();

  constructor() {
    this.voteChanges.pipe(
      debounceTime(600),
      distinctUntilChanged((previous, current) => previous.articleId === current.articleId && previous.value === current.value),
      switchMap(({ articleId, value }) => this.http.put<{ userVote: number; average: number; count: number }>(
        `/api/v1/engagement/articles/${encodeURIComponent(articleId)}/votes`,
        { value },
        { headers: this.auth.authorizationHeaders() }
      ).pipe(
        catchError(() => {
          this.voteMessage.set('Your vote could not be saved. Check your connection and try again.');
          return of(null);
        })
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result) => {
      if (!result) return;
      this.voteAverage.set(result.average);
      this.voteCount.set(result.count);
      this.voteMessage.set('Vote saved automatically.');
    });

    this.route.paramMap.pipe(
      switchMap((params) => {
        this.loading.set(true);
        this.notFound.set(false);
        const username = encodeURIComponent(params.get('username') ?? '');
        const slug = encodeURIComponent(params.get('slug') ?? '');
        return this.http.get<{ article: PublicArticle }>(`${this.apiBase}/${username}/${slug}`).pipe(
          catchError(() => of(null))
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((response) => {
      const article = response?.article ?? null;
      this.article.set(article);
      this.voteValue.set(50);
      this.voteMessage.set('');
      this.loading.set(false);
      this.notFound.set(!article);
      if (article) {
        this.updateSeo(article);
        const voteEndpoint = `/api/v1/engagement/articles/${encodeURIComponent(article.id)}/votes`;
        this.http.get<{ average: number; count: number }>(voteEndpoint)
          .pipe(catchError(() => of({ average: 0, count: 0 })), takeUntilDestroyed(this.destroyRef))
          .subscribe((votes) => { this.voteAverage.set(votes.average); this.voteCount.set(votes.count); });
        if (this.auth.isAuthenticated()) {
          this.http.get<{ userVote: number | null }>(`${voteEndpoint}/mine`, { headers: this.auth.authorizationHeaders() })
            .pipe(catchError(() => of({ userVote: null })), takeUntilDestroyed(this.destroyRef))
            .subscribe((vote) => { if (vote.userVote !== null) this.voteValue.set(vote.userVote); });
        }
      }
    });
  }

  private resolveApiBase(): string {
    // In SSR, point directly at the configured API when supplied. In the browser,
    // same-origin /api routing keeps the database and service credentials private.
    if (typeof process !== 'undefined' && process.env['MAGEUS_API_URL']) {
      return process.env['MAGEUS_API_URL'].replace(/\/$/, '') + '/articles';
    }
    if (!isPlatformBrowser(this.platformId) && this.request?.url) {
      return new URL('/api/v1/articles', this.request.url).toString();
    }
    return '/api/v1/articles';
  }

  onVoteValueChange(value: number): void {
    this.voteValue.set(value);
    const article = this.article();
    if (!article) return;
    if (!this.auth.isAuthenticated()) {
      this.voteMessage.set('Sign in to save your score.');
      return;
    }
    this.voteMessage.set('Saving automatically…');
    this.voteChanges.next({ articleId: article.id, value });
  }

  isStepBlock(block: ArticleBlock | undefined): boolean {
    return block?.type === 'text' && block.presentation === 'step';
  }

  stepNumberAt(blocks: ArticleBlock[], index: number): number {
    if (!this.isStepBlock(blocks[index])) return 0;
    let number = 1;
    for (let cursor = index - 1; cursor >= 0 && this.isStepBlock(blocks[cursor]); cursor--) number++;
    return number;
  }

  private updateSeo(article: PublicArticle): void {
    const pageTitle = (article.seo_title || article.title).trim();
    const description = (article.seo_description || article.excerpt || article.subtitle || '').trim().slice(0, 300);
    this.titleService.setTitle(pageTitle ? `${pageTitle} · Mageus` : 'Mageus');
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'article' });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    if (article.cover_image_url) this.meta.updateTag({ property: 'og:image', content: article.cover_image_url });
    this.meta.updateTag({ name: 'twitter:card', content: article.cover_image_url ? 'summary_large_image' : 'summary' });
    const articlePath = `/${encodeURIComponent(article.author_username)}/${encodeURIComponent(article.slug)}`;
    let canonical = article.canonical_url || articlePath;
    if (!article.canonical_url && this.request?.url) {
      try { canonical = new URL(articlePath, this.request.url).toString(); } catch { /* retain the relative path if request URL is unavailable */ }
    } else if (!article.canonical_url && this.document.location?.origin) {
      canonical = new URL(articlePath, this.document.location.origin).toString();
    }
    this.meta.updateTag({ property: 'og:url', content: canonical });
    if (article.published_at) this.meta.updateTag({ property: 'article:published_time', content: article.published_at });
    let link = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);

    // Keep structured data in the SSR HTML so crawlers do not need client JavaScript.
    let structuredData = this.document.getElementById('mageus-article-jsonld') as HTMLScriptElement | null;
    if (!structuredData) {
      structuredData = this.document.createElement('script');
      structuredData.id = 'mageus-article-jsonld';
      structuredData.type = 'application/ld+json';
      this.document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description,
      datePublished: article.published_at,
      mainEntityOfPage: canonical,
      image: article.cover_image_url ? [article.cover_image_url] : undefined,
      author: { '@type': 'Person', name: article.author_name, url: canonical.startsWith('http') ? new URL(`/${encodeURIComponent(article.author_username)}`, canonical).toString() : `/${encodeURIComponent(article.author_username)}` },
      publisher: { '@type': 'Organization', name: 'Mageus' }
    }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  }

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const distance = element.scrollHeight - element.clientHeight;
    this.progress.set(distance > 0 ? Math.round(element.scrollTop / distance * 100) : 0);
  }

  scrollTop(): void {
    this.document.querySelector('.public-reader-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
