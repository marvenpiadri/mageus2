import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface BusinessLocation { id: string; name: string; }
interface Storefront {
  id: string; name: string; slug: string; description: string; fulfillment_type: 'physical' | 'online' | 'hybrid';
  location_id: string | null; location_name?: string | null; status: 'draft' | 'published' | 'archived';
  product_count: number; service_count: number; created_at?: string; updated_at?: string;
}
interface StorefrontPayload {
  name: string; slug: string; description: string; fulfillmentType: 'physical' | 'online' | 'hybrid';
  locationId: string | null; status: 'draft' | 'published' | 'archived';
}

@Component({
  standalone: true,
  selector: 'mageus-business-catalog-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './business-catalog-page.component.html',
  styleUrl: './business-catalog-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BusinessCatalogPageComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly storefronts = signal<Storefront[]>([]);
  readonly locations = signal<BusinessLocation[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly name = signal('');
  readonly slug = signal('');
  readonly description = signal('');
  readonly fulfillmentType = signal<'physical' | 'online' | 'hybrid'>('online');
  readonly locationId = signal('');
  readonly status = signal<'draft' | 'published' | 'archived'>('draft');
  readonly message = signal('');
  readonly error = signal('');

  constructor() { void this.load(); }

  async load(): Promise<void> {
    if (!(await this.auth.ensureSession())) {
      await this.router.navigate(['/sign-in'], { queryParams: { returnUrl: '/business/catalog' } });
      return;
    }
    this.loading.set(true);
    let pending = 2;
    const finish = () => { pending--; if (pending === 0) this.loading.set(false); };
    this.http.get<{ storefronts: Storefront[] }>('/api/v1/social/me/business/storefronts', { headers: this.auth.authorizationHeaders() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (result) => { this.storefronts.set(result.storefronts); finish(); },
        error: (error) => { this.error.set(error?.error?.error?.message || 'Your shops could not be loaded.'); finish(); }
      });
    this.http.get<{ locations: BusinessLocation[] }>('/api/v1/social/me/business/locations', { headers: this.auth.authorizationHeaders() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (result) => { this.locations.set(result.locations); finish(); },
        error: (error) => { this.error.set(error?.error?.error?.message || 'Your locations could not be loaded.'); finish(); }
      });
  }

  onNameInput(value: string): void {
    this.name.set(value);
    if (!this.editingId()) this.slug.set(value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120));
  }

  newStorefront(): void {
    this.editingId.set(null); this.name.set(''); this.slug.set(''); this.description.set('');
    this.fulfillmentType.set('online'); this.locationId.set(''); this.status.set('draft');
    this.message.set(''); this.error.set('');
  }

  edit(store: Storefront): void {
    this.editingId.set(store.id); this.name.set(store.name); this.slug.set(store.slug);
    this.description.set(store.description || ''); this.fulfillmentType.set(store.fulfillment_type);
    this.locationId.set(store.location_id || ''); this.status.set(store.status);
    this.message.set(''); this.error.set('');
  }

  save(): void {
    if (this.saving()) return;
    const name = this.name().trim();
    const slug = this.slug().trim().toLowerCase();
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      this.error.set('Add a shop name and a URL slug using lowercase letters, numbers, and hyphens.');
      return;
    }
    if (this.fulfillmentType() === 'physical' && !this.locationId()) {
      this.error.set('Choose a location for a physical shop. Online shops can stay location-free.');
      return;
    }
    const payload: StorefrontPayload = {
      name, slug, description: this.description().trim(), fulfillmentType: this.fulfillmentType(),
      locationId: this.locationId() || null, status: this.status()
    };
    this.saving.set(true); this.error.set(''); this.message.set('');
    const options = { headers: this.auth.authorizationHeaders() };
    const request = this.editingId()
      ? this.http.patch<{ storefront: Storefront }>(`/api/v1/social/me/business/storefronts/${encodeURIComponent(this.editingId()!)}`, payload, options)
      : this.http.post<{ storefront: Storefront }>('/api/v1/social/me/business/storefronts', payload, options);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        const saved = result.storefront;
        const location = this.locations().find((item) => item.id === saved.location_id);
        saved.location_name = location?.name ?? null;
        this.storefronts.update((items) => this.editingId()
          ? items.map((item) => item.id === saved.id ? { ...item, ...saved } : item)
          : [{ ...saved, product_count: 0, service_count: 0 }, ...items]);
        this.message.set(this.editingId() ? 'Shop updated.' : 'Shop created.');
        this.newStorefront();
        this.saving.set(false);
      },
      error: (error) => { this.error.set(error?.error?.error?.message || 'The shop could not be saved.'); this.saving.set(false); }
    });
  }

  publish(store: Storefront): void {
    const nextStatus = store.status === 'published' ? 'draft' : 'published';
    this.http.patch<{ storefront: Storefront }>(`/api/v1/social/me/business/storefronts/${encodeURIComponent(store.id)}`, { status: nextStatus }, {
      headers: this.auth.authorizationHeaders()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => this.storefronts.update((items) => items.map((item) => item.id === store.id ? { ...item, ...result.storefront } : item)),
      error: (error) => this.error.set(error?.error?.error?.message || 'The shop status could not be changed.')
    });
  }

  archive(store: Storefront): void {
    if (store.status === 'archived') return;
    this.http.patch<{ storefront: Storefront }>(`/api/v1/social/me/business/storefronts/${encodeURIComponent(store.id)}`, { status: 'archived' }, {
      headers: this.auth.authorizationHeaders()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => this.storefronts.update((items) => items.map((item) => item.id === store.id ? { ...item, ...result.storefront } : item)),
      error: (error) => this.error.set(error?.error?.error?.message || 'The shop could not be archived.')
    });
  }
}
