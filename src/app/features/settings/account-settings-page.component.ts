import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

interface AccountProfile { email: string; username: string; display_name: string; bio: string; avatar_url: string | null; }
interface AccountSettings { locale: string; timezone: string; theme: 'system' | 'light' | 'dark'; profile_visibility: 'public' | 'private'; discoverable_by_email: boolean; email_notifications: boolean; push_notifications: boolean; }
interface Connection { application: 'mageus' | 'dollareus'; external_username: string | null; scopes: string[]; connected_at: string; }
interface ExternalIdentity { provider: string; provider_email: string | null; email_verified: boolean; }

@Component({
  standalone: true,
  selector: 'mageus-account-settings',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="settings-page">
      <header class="settings-header">
        <a routerLink="/">← Mageus</a>
        <span>ACCOUNT / SETTINGS</span>
        <h1>Your account, your rules.</h1>
        <p>Manage your public identity, privacy, sign-in security, and connected applications.</p>
      </header>
      @if (loading()) { <p class="settings-state">Loading your settings…</p> }
      @if (message()) { <p class="settings-message" role="status">{{ message() }}</p> }
      <section class="settings-panel">
        <div class="panel-intro"><span>01</span><div><h2>Public profile</h2><p>Your username is your unique Mageus identity and appears in your public URL.</p></div></div>
        <form (submit)="$event.preventDefault(); saveProfile()">
          <label>Username<input name="username" [(ngModel)]="profile.username" required minlength="2" maxlength="30" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{1,29}" /><small>Letters, numbers, dots, underscores, and hyphens.</small></label>
          <label>Display name<input name="displayName" [(ngModel)]="profile.display_name" required maxlength="100" /></label>
          <label>Bio<textarea name="bio" [(ngModel)]="profile.bio" rows="3" maxlength="500"></textarea></label>
          <label>Avatar image URL<input name="avatarUrl" [(ngModel)]="avatarDraft" type="url" placeholder="https://…" /></label>
          @if (avatarDraft) { <img class="avatar-preview" [src]="avatarDraft" alt="Avatar preview" /> }
          <button type="submit" [disabled]="busy()">Save profile</button>
        </form>
      </section>
      <section class="settings-panel">
        <div class="panel-intro"><span>02</span><div><h2>Privacy & preferences</h2><p>Choose how Mageus looks and how it contacts you.</p></div></div>
        <form (submit)="$event.preventDefault(); saveSettings()">
          <div class="field-grid">
            <label>Interface theme<select name="theme" [(ngModel)]="settings.theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
            <label>Profile visibility<select name="visibility" [(ngModel)]="settings.profile_visibility"><option value="public">Public</option><option value="private">Private</option></select></label>
            <label>Language<input name="locale" [(ngModel)]="settings.locale" maxlength="20" /></label>
            <label>Timezone<input name="timezone" [(ngModel)]="settings.timezone" maxlength="100" /></label>
          </div>
          <label class="toggle-row"><span><strong>Discoverable by email</strong><small>Let people find your profile using your email address.</small></span><input type="checkbox" name="discoverable" [(ngModel)]="settings.discoverable_by_email" /></label>
          <label class="toggle-row"><span><strong>Email notifications</strong><small>Receive account and social activity by email when delivery is configured.</small></span><input type="checkbox" name="emailNotifications" [(ngModel)]="settings.email_notifications" /></label>
          <label class="toggle-row"><span><strong>Push notifications</strong><small>Preference for future browser and device notifications.</small></span><input type="checkbox" name="pushNotifications" [(ngModel)]="settings.push_notifications" /></label>
          <button type="submit" [disabled]="busy()">Save preferences</button>
        </form>
      </section>
      <section class="settings-panel">
        <div class="panel-intro"><span>03</span><div><h2>Password & security</h2><p>Use a unique password of at least 12 characters. Changing it signs out active refresh sessions.</p></div></div>
        <form (submit)="$event.preventDefault(); changePassword()">
          <label>Current password<input name="currentPassword" type="password" [(ngModel)]="currentPassword" autocomplete="current-password" required /></label>
          <label>New password<input name="newPassword" type="password" [(ngModel)]="newPassword" autocomplete="new-password" minlength="12" maxlength="128" required /></label>
          <button type="submit" [disabled]="busy() || newPassword.length < 12">Change password</button>
        </form>
        <p class="settings-note">Email changes, account deletion, and provider-based recovery require verified flows and are not exposed as unsafe one-click actions.</p>
      </section>
      <section class="settings-panel">
        <div class="panel-intro"><span>04</span><div><h2>Connected apps & sign-in methods</h2><p>Review account identities. Disconnecting an app revokes the saved connection record.</p></div></div>
        <div class="connection-list">
          @for (connection of connections(); track connection.application) {
            <article class="connection-row"><div><strong>{{ connection.application === 'dollareus' ? 'Dollareus' : 'Mageus' }}</strong><small>Connected {{ connection.connected_at | date:'mediumDate' }}{{ connection.external_username ? ' · @' + connection.external_username : '' }}</small></div><button class="secondary-button" type="button" (click)="disconnect(connection.application)" [disabled]="busy()">Disconnect</button></article>
          }
          @if (!connections().length) { <p class="settings-note">No cross-application connections yet. The database foundation is in place; secure OAuth/OIDC authorization and linking are the next identity phase.</p> }
        </div>
        <div class="identity-list">
          @for (identity of identities(); track identity.provider) {
            <div class="identity-row"><span>{{ providerName(identity.provider) }}</span><small>{{ identity.provider_email || 'Linked identity' }} · {{ identity.email_verified ? 'verified' : 'unverified' }}</small></div>
          }
          @if (!identities().length) { <p class="settings-note">No external sign-in providers are linked to this account yet.</p> }
        </div>
      </section>
      <footer class="settings-footer"><span>Signed in as {{ profile.email }}</span><a [routerLink]="['/', profile.username]">View public profile ↗</a></footer>
    </main>
  `,
  styles: [`
    :host { display:block; color:var(--text-primary,#f6f6fb); }
    .settings-page { width:min(100% - 2rem,820px); margin:0 auto; padding:2rem 0 6rem; }
    .settings-header { padding:1.5rem 0 2.25rem; border-bottom:1px solid var(--glass-border,rgba(255,255,255,.14)); }
    .settings-header>a { color:var(--accent,#66ccc3); text-decoration:none; font-size:.85rem; }
    .settings-header>span { display:block; margin-top:2.2rem; color:var(--accent,#66ccc3); font-size:.7rem; letter-spacing:.16em; }
    .settings-header h1 { margin:.7rem 0; font-size:clamp(2rem,6vw,3.6rem); letter-spacing:-.045em; line-height:1.05; }
    .settings-header p,.panel-intro p,.settings-note { color:var(--text-muted,#a8adbb); line-height:1.65; font-size:.88rem; }
    .settings-panel { margin-top:1.2rem; padding:clamp(1.1rem,3vw,2rem); border:1px solid var(--glass-border,rgba(255,255,255,.14)); border-radius:1rem; background:var(--glass-surface,rgba(255,255,255,.025)); }
    .panel-intro { display:grid; grid-template-columns:2rem minmax(0,1fr); gap:.85rem; margin-bottom:1.4rem; }
    .panel-intro>span { color:var(--accent,#66ccc3); font: .75rem monospace; padding-top:.3rem; }
    .panel-intro h2 { margin:0; font-size:1.2rem; }
    .panel-intro p { margin:.45rem 0 0; }
    form { display:grid; gap:1rem; }
    form>label,.field-grid>label { display:grid; gap:.45rem; font-size:.82rem; font-weight:600; }
    input:not([type=checkbox]),textarea,select { width:100%; min-width:0; padding:.75rem .85rem; border:1px solid var(--glass-border,rgba(255,255,255,.18)); border-radius:.65rem; color:var(--text-primary,#f6f6fb); background:rgba(0,0,0,.12); font:inherit; }
    select option { color:#171923; }
    label small,.toggle-row small { display:block; color:var(--text-muted,#a8adbb); font-size:.72rem; font-weight:400; line-height:1.5; }
    .field-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
    .toggle-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.8rem 0; border-bottom:1px solid var(--glass-border,rgba(255,255,255,.08)); }
    .toggle-row strong { display:block; margin-bottom:.25rem; font-size:.82rem; }
    .toggle-row input { width:1.1rem; height:1.1rem; accent-color:var(--accent,#66ccc3); flex-shrink:0; }
    button { justify-self:start; border:1px solid var(--accent,#66ccc3); border-radius:99px; padding:.7rem 1.1rem; color:var(--text-primary,#f6f6fb); background:color-mix(in srgb,var(--accent,#66ccc3) 16%,transparent); font:inherit; font-size:.82rem; font-weight:650; cursor:pointer; }
    button:disabled { opacity:.5; cursor:not-allowed; }
    .secondary-button { border-color:var(--glass-border,rgba(255,255,255,.2)); background:transparent; }
    .avatar-preview { width:4rem; height:4rem; border-radius:50%; object-fit:cover; }
    .settings-message { position:sticky; top:1rem; z-index:5; padding:.85rem 1rem; border:1px solid var(--accent,#66ccc3); border-radius:.7rem; background:var(--glass-surface,rgba(10,12,20,.9)); }
    .settings-state { color:var(--text-muted,#a8adbb); }
    .connection-list,.identity-list { display:grid; gap:.8rem; }
    .identity-list { margin-top:1.2rem; padding-top:1rem; border-top:1px solid var(--glass-border,rgba(255,255,255,.1)); }
    .connection-row,.identity-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    .connection-row>div { display:grid; gap:.3rem; }
    .connection-row small,.identity-row small { color:var(--text-muted,#a8adbb); font-size:.74rem; }
    .identity-row { align-items:flex-start; flex-direction:column; gap:.25rem; }
    .settings-footer { display:flex; justify-content:space-between; flex-wrap:wrap; gap:.8rem; margin-top:1.5rem; color:var(--text-muted,#a8adbb); font-size:.78rem; }
    .settings-footer a { color:var(--accent,#66ccc3); text-decoration:none; }
    @media(max-width:560px) { .field-grid { grid-template-columns:1fr; } .connection-row { align-items:flex-start; flex-direction:column; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSettingsPageComponent {
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly connections = signal<Connection[]>([]);
  readonly identities = signal<ExternalIdentity[]>([]);
  profile: AccountProfile = { email: '', username: '', display_name: '', bio: '', avatar_url: null };
  avatarDraft = '';
  settings: AccountSettings = { locale: 'en', timezone: 'UTC', theme: 'system', profile_visibility: 'public', discoverable_by_email: false, email_notifications: true, push_notifications: true };
  currentPassword = '';
  newPassword = '';

  constructor() { void this.load(); }

  async load(): Promise<void> {
    try {
      if (!(await this.auth.ensureSession())) { await this.router.navigate(['/sign-in'], { queryParams: { returnUrl: '/settings' } }); return; }
      const headers = this.auth.authorizationHeaders();
      const [profile, settings, connections] = await Promise.all([
        firstValueFrom(this.http.get<{profile:AccountProfile}>('/api/v1/account/profile',{headers})),
        firstValueFrom(this.http.get<{settings:AccountSettings}>('/api/v1/account/settings',{headers})),
        firstValueFrom(this.http.get<{connections:Connection[];identities:ExternalIdentity[]}>('/api/v1/account/connections',{headers}))
      ]);
      this.profile = profile.profile;
      this.avatarDraft = profile.profile.avatar_url || '';
      this.settings = settings.settings;
      this.connections.set(connections.connections);
      this.identities.set(connections.identities);
    } catch (error: any) { this.message.set(error?.error?.error?.message || 'Could not load account settings.'); }
    finally { this.loading.set(false); }
  }

  async saveProfile(): Promise<void> {
    await this.run(async () => {
      const result = await firstValueFrom(this.http.patch<{profile:AccountProfile}>('/api/v1/account/profile',{
        username:this.profile.username,displayName:this.profile.display_name,bio:this.profile.bio,avatarUrl:this.avatarDraft.trim() || null
      },{headers:this.auth.authorizationHeaders()}));
      this.profile=result.profile;
      this.avatarDraft=result.profile.avatar_url || '';
      const user = this.auth.user();
      if (user) this.auth.user.set({ ...user, username: result.profile.username, displayName: result.profile.display_name });
      this.message.set('Profile saved.');
    });
  }

  async saveSettings(): Promise<void> {
    await this.run(async () => {
      const result = await firstValueFrom(this.http.put<{settings:AccountSettings}>('/api/v1/account/settings',{
        locale:this.settings.locale,timezone:this.settings.timezone,theme:this.settings.theme,
        profileVisibility:this.settings.profile_visibility,discoverableByEmail:this.settings.discoverable_by_email,
        emailNotifications:this.settings.email_notifications,pushNotifications:this.settings.push_notifications
      },{headers:this.auth.authorizationHeaders()}));
      this.settings=result.settings;
      this.message.set('Preferences saved.');
    });
  }

  async changePassword(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.post('/api/v1/account/password',{currentPassword:this.currentPassword,newPassword:this.newPassword},{headers:this.auth.authorizationHeaders()}));
      this.currentPassword=''; this.newPassword='';
      this.message.set('Password changed. Sign in again to refresh your session.');
    });
  }

  async disconnect(application: string): Promise<void> {
    if (!globalThis.confirm('Disconnect this application from your Mageus account?')) return;
    await this.run(async () => {
      await firstValueFrom(this.http.delete('/api/v1/account/connections/'+encodeURIComponent(application),{headers:this.auth.authorizationHeaders()}));
      this.connections.update((items)=>items.filter((item)=>item.application!==application));
      this.message.set('Application disconnected.');
    });
  }

  providerName(provider: string): string {
    return provider==='google'?'Google':provider==='facebook'?'Facebook':provider==='dollareus_oidc'?'Dollareus':'External provider';
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.message.set('');
    try { await action(); }
    catch (error: any) { this.message.set(error?.error?.error?.message || error?.message || 'The change could not be saved.'); }
    finally { this.busy.set(false); }
  }
}
