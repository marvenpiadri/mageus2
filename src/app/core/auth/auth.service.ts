import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface MageusUser { id: string; email: string; username: string; displayName: string; }
interface AuthResponse { user: MageusUser; accessToken: string; tokenType: 'Bearer'; expiresIn: number; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly api = '/api/v1/auth';
  private readonly tokenState = signal<string | null>(null);
  private readonly tokenExpiresAt = signal(0);
  private readonly expiresAt = signal<number>(0);
  readonly user = signal<MageusUser | null>(null);
  readonly isAuthenticated = computed(() => !!this.tokenState() && !!this.user());
  get accessToken(): string | null { return this.tokenState(); }

  async ensureAccessToken(): Promise<boolean> {
    if (this.tokenState() && this.tokenExpiresAt() > Date.now() + 30_000) return true;
    return this.restoreSession();
  }

  async ensureSession(): Promise<boolean> {
    if (this.tokenState() && this.expiresAt() > Date.now() + 30_000) return true;
    return this.restoreSession();
  }

  async restoreSession(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      const response = await firstValueFrom(this.http.post<AuthResponse>(`${this.api}/refresh`, {}, { withCredentials: true }));
      this.setSession(response);
      return true;
    } catch { this.clearSession(); return false; }
  }

  async login(credential: string, password: string): Promise<void> {
    const response = await firstValueFrom(this.http.post<AuthResponse>(`${this.api}/login`, { credential, password }, { withCredentials: true }));
    this.setSession(response);
  }

  async register(input: { username: string; displayName: string; email: string; password: string }): Promise<void> {
    const response = await firstValueFrom(this.http.post<AuthResponse>(`${this.api}/register`, input, { withCredentials: true }));
    this.setSession(response);
  }

  async logout(): Promise<void> {
    try { await firstValueFrom(this.http.post(`${this.api}/logout`, {}, { withCredentials: true })); }
    finally { this.clearSession(); }
  }

  authorizationHeaders(): Record<string, string> {
    const token = this.tokenState();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private setSession(response: AuthResponse): void {
    this.tokenState.set(response.accessToken);
    this.expiresAt.set(Date.now() + response.expiresIn * 1000);
    this.user.set(response.user);
  }
  private clearSession(): void { this.tokenState.set(null); this.expiresAt.set(0); this.user.set(null); }
}
