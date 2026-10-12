import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ArticleBlock } from '../../domain/article.model';

export interface SyncedArticleDraft {
  id: string;
  revision: number;
  title: string;
  subtitle: string;
  slug: string;
  excerpt: string;
  category: string;
  language: string;
  tags: string[];
  cover_image_url: string | null;
  blocks: ArticleBlock[];
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
}

export interface ArticleDraftPayload {
  title: string;
  subtitle: string;
  slug?: string;
  excerpt: string;
  category: string;
  language: string;
  tags: string[];
  coverImageUrl: string;
  blocks: ArticleBlock[];
  schemaVersion: number;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ArticleApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly endpoint = '/api/v1/articles';

  async loadDraft(articleId: string): Promise<SyncedArticleDraft> {
    if (!(await this.auth.ensureSession())) throw new Error('Sign in to load your server draft.');
    const options = { headers: this.auth.authorizationHeaders() };
    const response = await firstValueFrom(this.http.get<{ articles: SyncedArticleDraft[] }>(`${this.endpoint}/mine`, options));
    const draft = response.articles.find((article) => article.id === articleId);
    if (!draft) throw new Error('This server draft is no longer available to your account.');
    return draft;
  }

  async saveDraft(payload: ArticleDraftPayload, articleId: string | null, expectedRevision: number | null): Promise<{ id: string; revision: number }> {
    if (!(await this.auth.ensureSession())) throw new Error('Sign in to sync this draft to Mageus.');
    const options = { headers: this.auth.authorizationHeaders() };
    if (articleId) {
      let revision = expectedRevision;
      if (revision === null) {
        const owned = await firstValueFrom(this.http.get<{ articles: Array<{ id: string; revision: number }> }>(`${this.endpoint}/mine`, options));
        revision = owned.articles.find((article) => article.id === articleId)?.revision ?? null;
      }
      if (revision === null) throw new Error('This server draft could not be found. Export your local copy before syncing it as a new draft.');
      const response = await firstValueFrom(this.http.patch<{ article: { id: string; revision: number } }>(
        `${this.endpoint}/${encodeURIComponent(articleId)}`, { ...payload, expectedRevision: revision }, options
      ));
      return { id: response.article.id, revision: response.article.revision };
    }
    const response = await firstValueFrom(this.http.post<{ article: { id: string; revision: number } }>(this.endpoint, payload, options));
    return { id: response.article.id, revision: response.article.revision };
  }

  async publish(articleId: string, expectedRevision: number | null): Promise<string> {
    if (!(await this.auth.ensureSession())) throw new Error('Sign in to publish this article.');
    let revision = expectedRevision;
    if (revision === null) {
      const owned = await firstValueFrom(this.http.get<{ articles: Array<{ id: string; revision: number }> }>(`${this.endpoint}/mine`, { headers: this.auth.authorizationHeaders() }));
      revision = owned.articles.find((article) => article.id === articleId)?.revision ?? null;
    }
    if (revision === null) throw new Error('The server draft could not be found. Sync it again before publishing.');
    const response = await firstValueFrom(this.http.post<{ publicPath: string }>(
      `${this.endpoint}/${encodeURIComponent(articleId)}/publish`, { expectedRevision: revision }, { headers: this.auth.authorizationHeaders() }
    ));
    return response.publicPath;
  }
}
