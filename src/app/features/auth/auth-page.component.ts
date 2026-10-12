import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'mageus-auth-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthPageComponent {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  readonly oauthProviders = signal<string[]>([]);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly mode = signal<'login' | 'register'>('login');
  readonly credential = signal('');
  readonly email = signal('');
  readonly username = signal('');
  readonly displayName = signal('');
  readonly password = signal('');
  readonly busy = signal(false);
  readonly errorMessage = signal('');

  constructor() {
    const oauthError = this.route.snapshot.queryParamMap.get('oauthError');
    if (oauthError) {
      const messages: Record<string, string> = {
        provider_not_configured: 'That sign-in provider is not configured yet.',
        state_invalid: 'The sign-in request expired or could not be verified. Please try again.',
        provider_cancelled: 'Sign-in was cancelled.',
        token_exchange_failed: 'The provider could not complete sign-in. Please try again.',
        profile_unavailable: 'The provider did not return a usable profile.',
        email_required: 'The provider did not share an email address. Create an account with email first.',
        account_link_required: 'An account already uses this email. Sign in with that account before linking this provider.',
        account_creation_conflict: 'An account conflict occurred. Please sign in and try linking again.'
      };
      this.errorMessage.set(messages[oauthError] || 'External sign-in could not be completed.');
    }
    void this.loadOAuthProviders();
  }

  async loadOAuthProviders(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<{providers:string[]}>('/api/v1/auth/oauth/providers'));
      this.oauthProviders.set(response.providers);
    } catch { this.oauthProviders.set([]); }
  }

  startOAuth(provider: string): void {
    if (!this.oauthProviders().includes(provider)) return;
    globalThis.location.assign('/api/v1/auth/oauth/' + encodeURIComponent(provider));
  }

  providerLabel(provider: string): string {
    return provider === 'google' ? 'Continue with Google' : provider === 'facebook' ? 'Continue with Facebook' : 'Continue with provider';
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set('');
    try {
      if (this.mode() === 'login') await this.auth.login(this.credential().trim(), this.password());
      else await this.auth.register({
        username: this.username().trim().toLowerCase(),
        displayName: this.displayName().trim(),
        email: this.email().trim().toLowerCase(),
        password: this.password()
      });
      const requestedReturn = this.route.snapshot.queryParamMap.get('returnUrl');
      const returnUrl = requestedReturn?.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : '/write';
      await this.router.navigateByUrl(returnUrl);
    } catch (error: any) {
      this.errorMessage.set(error?.error?.message || 'Could not sign in. Check your details and try again.');
    } finally { this.busy.set(false); }
  }
}
