import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

interface AccountProfile {
  id: string;
  email: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  updated_at?: string;
}
interface AccountSettings {
  locale: string;
  timezone: string;
  theme: 'system' | 'light' | 'dark';
  profile_visibility: 'public' | 'private';
  discoverable_by_email: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
}
interface AppConnection {
  application: string;
  external_username: string | null;
  scopes: string[];
  connected_at: string;
}
interface ExternalIdentity {
  provider: string;
  provider_email: string | null;
  email_verified: boolean;
  created_at: string;
  last_used_at: string | null;
}

const DEFAULT_SETTINGS: AccountSettings = {
  locale: 'en',
  timezone: 'UTC',
  theme: 'system',
  profile_visibility: 'public',
  discoverable_by_email: false,
  email_notifications: true,
  push_notifications: true
};

@Component({
  standalone: true,
  selector: 'mageus-account-settings-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './account-settings-page.component.html',
  styleUrl: './account-settings-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSettingsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly profile = signal<AccountProfile | null>(null);
  readonly username = signal('');
  readonly displayName = signal('');
  readonly bio = signal('');
  readonly avatarUrl = signal('');
  readonly profileBusy = signal(false);
  readonly profileMessage = signal('');

  readonly settings = signal<AccountSettings>(DEFAULT_SETTINGS);
  readonly settingsBusy = signal(false);
  readonly settingsMessage = signal('');

  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly passwordBusy = signal(false);
  readonly passwordMessage = signal('');

  readonly connections = signal<AppConnection[]>([]);
  readonly identities = signal<ExternalIdentity[]>([]);
  readonly connectionMessage = signal('');
  readonly disconnecting = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    if (!(await this.auth.ensureSession())) {
      await this.router.navigate(['/sign-in'], { queryParams: { returnUrl: '/settings' } });
      return;
    }
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      profile: this.http.get<{ profile: AccountProfile }>('/api/v1/account/profile', { headers: this.auth.authorizationHeaders() }),
      settings: this.http.get<{ settings: AccountSettings }>('/api/v1/account/settings', { headers: this.auth.authorizationHeaders() }),
      connections: this.http.get<{ connections: AppConnection[]; identities: ExternalIdentity[] }>('/api/v1/account/connections', { headers: this.auth.authorizationHeaders() })
    }).pipe(
      catchError((error) => {
        this.loadError.set(error?.error?.error?.message || 'Account settings could not be loaded. Please try again.');
        return of(null);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result) => {
      if (!result) {
        this.loading.set(false);
        return;
      }
      this.profile.set(result.profile.profile);
      this.username.set(result.profile.profile.username);
      this.displayName.set(result.profile.profile.display_name);
      this.bio.set(result.profile.profile.bio || '');
      this.avatarUrl.set(result.profile.profile.avatar_url || '');
      this.settings.set({ ...DEFAULT_SETTINGS, ...result.settings.settings });
      this.connections.set(result.connections.connections);
      this.identities.set(result.connections.identities);
      this.loading.set(false);
    });
  }

  saveProfile(): void {
    if (this.profileBusy()) return;
    const username = this.username().trim().toLowerCase();
    const displayName = this.displayName().trim();
    const bio = this.bio().trim();
    const avatarUrl = this.avatarUrl().trim();
    if (!displayName || !/^[a-z0-9][a-z0-9._-]{1,29}$/.test(username)) {
      this.profileMessage.set('Enter a display name and a valid username (2–30 letters, numbers, dots, underscores, or hyphens).');
      return;
    }
    if (avatarUrl && !avatarUrl.startsWith('https://')) {
      this.profileMessage.set('Use an HTTPS URL for your avatar, or leave it empty.');
      return;
    }
    this.profileBusy.set(true);
    this.profileMessage.set('');
    this.http.patch<{ profile: AccountProfile }>('/api/v1/account/profile', {
      username, displayName, bio, avatarUrl: avatarUrl || null
    }, { headers: this.auth.authorizationHeaders() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.profile.set(result.profile);
        this.auth.user.update((user) => user ? {
          ...user, username: result.profile.username, displayName: result.profile.display_name
        } : user);
        this.username.set(result.profile.username);
        this.displayName.set(result.profile.display_name);
        this.profileMessage.set('Profile saved.');
        this.profileBusy.set(false);
      },
      error: (error) => {
        this.profileMessage.set(error?.error?.error?.message || 'Profile could not be saved. Please try again.');
        this.profileBusy.set(false);
      }
    });
  }

  updateSettings(patch: Partial<AccountSettings>): void {
    this.settings.update((current) => ({ ...current, ...patch }));
  }

  saveSettings(): void {
    if (this.settingsBusy()) return;
    const value = this.settings();
    this.settingsBusy.set(true);
    this.settingsMessage.set('');
    this.http.put<{ settings: AccountSettings }>('/api/v1/account/settings', {
      locale: value.locale,
      timezone: value.timezone,
      theme: value.theme,
      profileVisibility: value.profile_visibility,
      discoverableByEmail: value.discoverable_by_email,
      emailNotifications: value.email_notifications,
      pushNotifications: value.push_notifications
    }, { headers: this.auth.authorizationHeaders() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.settings.set({ ...DEFAULT_SETTINGS, ...result.settings });
        this.settingsMessage.set('Preferences saved.');
        this.settingsBusy.set(false);
      },
      error: (error) => {
        this.settingsMessage.set(error?.error?.error?.message || 'Preferences could not be saved.');
        this.settingsBusy.set(false);
      }
    });
  }

  changePassword(): void {
    if (this.passwordBusy()) return;
    if (this.newPassword().length < 12 || this.newPassword().length > 128) {
      this.passwordMessage.set('Use a new password between 12 and 128 characters.');
      return;
    }
    this.passwordBusy.set(true);
    this.passwordMessage.set('');
    this.http.post<{ message: string }>('/api/v1/account/password', {
      currentPassword: this.currentPassword(), newPassword: this.newPassword()
    }, { headers: this.auth.authorizationHeaders() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.currentPassword.set('');
        this.newPassword.set('');
        this.passwordMessage.set(result.message || 'Password changed. Sign in again on your devices.');
        this.passwordBusy.set(false);
      },
      error: (error) => {
        this.passwordMessage.set(error?.error?.error?.message || 'Password could not be changed.');
        this.passwordBusy.set(false);
      }
    });
  }

  disconnect(application: string): void {
    if (this.disconnecting()) return;
    this.disconnecting.set(application);
    this.connectionMessage.set('');
    this.http.delete<{ disconnected: boolean; application: string }>(
      `/api/v1/account/connections/${encodeURIComponent(application)}`, { headers: this.auth.authorizationHeaders() }
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.connections.update((items) => items.filter((item) => item.application !== application));
        this.connectionMessage.set(`${application} disconnected.`);
        this.disconnecting.set(null);
      },
      error: (error) => {
        this.connectionMessage.set(error?.error?.error?.message || 'The connection could not be removed.');
        this.disconnecting.set(null);
      }
    });
  }

  openPublicProfile(): void {
    const username = this.profile()?.username;
    if (username) void this.router.navigate(['/', username]);
  }
}
