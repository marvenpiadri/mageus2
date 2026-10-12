import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ArticleBlock } from '../../domain/article.model';

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

  async saveDraft(payload: ArticleDraftPayload, articleId: string | null): Promise<string> {
    if (!this.auth.accessToken) throw new Error('Sign in to sync this draft to Mageus.');
    const options = { headers: this.auth.authorizationHeaders() };
    if (articleId) {
      await firstValueFrom(this.http.patch(`${this.endpoint}/${encodeURIComponent(articleId)}`, payload, options));
      return articleId;
    }
    const response = await firstValueFrom(this.http.post<{ article: { id: string } }>(this.endpoint, payload, options));
    return response.article.id;
  }

  async publish(articleId: string): Promise<string> {
    if (!this.auth.accessToken) throw new Error('Sign in to publish this article.');
    const response = await firstValueFrom(this.http.post<{ publicPath: string }>(
      `${this.endpoint}/${encodeURIComponent(articleId)}/publish`, {}, { headers: this.auth.authorizationHeaders() }
    ));
    return response.publicPath;
  }
}
