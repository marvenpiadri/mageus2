import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
