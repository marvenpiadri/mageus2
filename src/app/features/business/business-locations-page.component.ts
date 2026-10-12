import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface BusinessLocation {
  id: string;
  name: string;
  slug: string;
  address: string;
  google_place_id: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  phone: string | null;
  opening_hours: Record<string, unknown>;
  is_primary: boolean;
  created_at?: string;
}
interface LocationPayload {
  name: string;
  slug: string;
  address: string;
  googlePlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  openingHours: Record<string, unknown>;
  isPrimary: boolean;
}

@Component({
  standalone: true,
  selector: 'mageus-business-locations-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './business-locations-page.component.html',
  styleUrl: './business-locations-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BusinessLocationsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly locations = signal<BusinessLocation[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly deleteConfirmId = signal<string | null>(null);
  readonly message = signal('');
  readonly error = signal('');
  readonly name = signal('');
  readonly slug = signal('');
  readonly address = signal('');
  readonly phone = signal('');
  readonly googlePlaceId = signal('');
  readonly latitude = signal('');
  readonly longitude = signal('');
  readonly isPrimary = signal(false);

  constructor() { void this.load(); }

  async load(): Promise<void> {
    if (!(await this.auth.ensureSession())) {
      await this.router.navigate(['/sign-in'], { queryParams: { returnUrl: '/business/locations' } });
      return;
    }
    this.loading.set(true);
    this.http.get<{ locations: BusinessLocation[] }>('/api/v1/social/me/business/locations', {
      headers: this.auth.authorizationHeaders()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => { this.locations.set(result.locations); this.loading.set(false); },
      error: (error) => {
        this.error.set(error?.error?.error?.message || 'Your locations could not be loaded.');
        this.loading.set(false);
      }
    });
  }

  onNameInput(value: string): void {
    this.name.set(value);
    if (!this.editingId()) this.slug.set(value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120));
  }

  startNew(): void { this.resetForm(); this.message.set(''); this.error.set(''); }
  edit(location: BusinessLocation): void {
    this.editingId.set(location.id);
    this.name.set(location.name);
    this.slug.set(location.slug);
    this.address.set(location.address || '');
    this.phone.set(location.phone || '');
    this.googlePlaceId.set(location.google_place_id || '');
    this.latitude.set(location.latitude == null ? '' : String(location.latitude));
    this.longitude.set(location.longitude == null ? '' : String(location.longitude));
    this.isPrimary.set(location.is_primary);
    this.message.set('');
    this.error.set('');
    this.deleteConfirmId.set(null);
  }
  cancelEdit(): void { this.resetForm(); this.message.set(''); this.error.set(''); }
  private resetForm(): void {
    this.editingId.set(null); this.name.set(''); this.slug.set(''); this.address.set('');
    this.phone.set(''); this.googlePlaceId.set(''); this.latitude.set(''); this.longitude.set('');
    this.isPrimary.set(this.locations().length === 0); this.deleteConfirmId.set(null);
  }

  save(): void {
    if (this.saving()) return;
    const name = this.name().trim();
    const slug = this.slug().trim().toLowerCase();
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      this.error.set('Add a location name and a URL slug using lowercase letters, numbers, and hyphens.');
      return;
    }
    const latText = this.latitude().trim();
    const lonText = this.longitude().trim();
    const latitude = latText ? Number(latText) : null;
    const longitude = lonText ? Number(lonText) : null;
    if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      this.error.set('Enter both valid coordinates, or leave both empty.');
      return;
    }
    const payload: LocationPayload = {
      name, slug, address: this.address().trim(), googlePlaceId: this.googlePlaceId().trim() || null,
      latitude, longitude, phone: this.phone().trim() || null, openingHours: {}, isPrimary: this.isPrimary()
    };
    this.saving.set(true); this.error.set(''); this.message.set('');
    const options = { headers: this.auth.authorizationHeaders() };
    const request = this.editingId()
      ? this.http.patch<{ location: BusinessLocation }>(`/api/v1/social/me/business/locations/${encodeURIComponent(this.editingId()!)}`, payload, options)
      : this.http.post<{ location: BusinessLocation }>('/api/v1/social/me/business/locations', payload, options);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.locations.update((items) => {
          const updated = this.editingId()
            ? items.map((item) => item.id === result.location.id ? result.location : (result.location.is_primary ? { ...item, is_primary: false } : item))
            : [...items.filter((item) => !result.location.is_primary || !item.is_primary), result.location];
          return updated.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));
        });
        this.message.set(this.editingId() ? 'Location updated.' : 'Location created.');
        this.resetForm();
        this.saving.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.error?.message || 'The location could not be saved.');
        this.saving.set(false);
      }
    });
  }

  requestDelete(location: BusinessLocation): void {
    if (this.deleteConfirmId() !== location.id) {
      this.deleteConfirmId.set(location.id);
      this.message.set('Confirm deletion below. Locations with menus must have those menus moved or removed first.');
      return;
    }
    this.http.delete<{ deleted: boolean }>(`/api/v1/social/me/business/locations/${encodeURIComponent(location.id)}`, {
      headers: this.auth.authorizationHeaders()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.locations.update((items) => items.filter((item) => item.id !== location.id));
        this.deleteConfirmId.set(null);
        this.message.set('Location deleted.');
        if (this.editingId() === location.id) this.resetForm();
        void this.load();
      },
      error: (error) => {
        this.error.set(error?.error?.error?.message || 'The location could not be deleted.');
        this.deleteConfirmId.set(null);
      }
    });
  }
}
