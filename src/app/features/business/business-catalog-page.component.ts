import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface BusinessLocation { id: string; name: string; }
interface CatalogEntry { id: string; storefront_id: string; name: string; slug: string; description: string; image_url: string | null; price_amount: number | string | null; currency: string; booking_url?: string | null; status: 'draft' | 'published' | 'archived'; }
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
  readonly selectedStoreId = signal<string | null>(null);
  readonly products = signal<CatalogEntry[]>([]);
  readonly services = signal<CatalogEntry[]>([]);
  readonly catalogLoading = signal(false);
  readonly itemSaving = signal(false);
  readonly itemKind = signal<'product' | 'service'>('product');
  readonly editingItemId = signal<string | null>(null);
  readonly itemName = signal('');
  readonly itemSlug = signal('');
  readonly itemDescription = signal('');
  readonly itemImageUrl = signal('');
  readonly itemPrice = signal('');
  readonly itemCurrency = signal('USD');
  readonly itemBookingUrl = signal('');
  readonly itemStatus = signal<'draft' | 'published' | 'archived'>('draft');

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
    this.selectedStoreId.set(null);
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


  selectedStoreName(): string {
    return this.storefronts().find((store) => store.id === this.selectedStoreId())?.name ?? 'Shop catalog';
  }

  manageItems(store: Storefront): void {
    this.selectedStoreId.set(store.id);
    this.products.set([]);
    this.services.set([]);
    this.catalogLoading.set(true);
    this.editingItemId.set(null);
    this.error.set('');
    this.http.get<{ products: CatalogEntry[]; services: CatalogEntry[] }>(
      `/api/v1/social/me/business/storefronts/${encodeURIComponent(store.id)}/catalog`,
      { headers: this.auth.authorizationHeaders() }
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => { this.products.set(result.products); this.services.set(result.services); this.catalogLoading.set(false); },
      error: (error) => { this.error.set(error?.error?.error?.message || 'The shop catalog could not be loaded.'); this.catalogLoading.set(false); }
    });
  }

  startItem(kind: 'product' | 'service'): void {
    this.itemKind.set(kind); this.editingItemId.set(null); this.itemName.set(''); this.itemSlug.set('');
    this.itemDescription.set(''); this.itemImageUrl.set(''); this.itemPrice.set(''); this.itemCurrency.set('USD');
    this.itemBookingUrl.set(''); this.itemStatus.set('draft'); this.message.set(''); this.error.set('');
  }

  onItemNameInput(value: string): void {
    this.itemName.set(value);
    if (!this.editingItemId()) this.itemSlug.set(value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160));
  }

  editItem(kind: 'product' | 'service', item: CatalogEntry): void {
    this.itemKind.set(kind); this.editingItemId.set(item.id); this.itemName.set(item.name); this.itemSlug.set(item.slug);
    this.itemDescription.set(item.description || ''); this.itemImageUrl.set(item.image_url || '');
    this.itemPrice.set(item.price_amount == null ? '' : String(item.price_amount)); this.itemCurrency.set(item.currency || 'USD');
    this.itemBookingUrl.set(item.booking_url || ''); this.itemStatus.set(item.status); this.message.set(''); this.error.set('');
  }

  saveItem(): void {
    const storeId = this.selectedStoreId();
    if (!storeId || this.itemSaving()) return;
    const name = this.itemName().trim();
    const slug = this.itemSlug().trim().toLowerCase();
    const imageUrl = this.itemImageUrl().trim();
    const bookingUrl = this.itemBookingUrl().trim();
    const priceText = this.itemPrice().trim();
    const priceAmount = priceText ? Number(priceText) : null;
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      this.error.set('Add a name and a URL slug using lowercase letters, numbers, and hyphens.'); return;
    }
    if (imageUrl && !imageUrl.startsWith('https://')) { this.error.set('Use an HTTPS URL for the image, or leave it empty.'); return; }
    if (this.itemKind() === 'service' && bookingUrl && !bookingUrl.startsWith('https://')) { this.error.set('Use an HTTPS booking link, or leave it empty.'); return; }
    if (priceText && (!Number.isFinite(priceAmount) || priceAmount! < 0)) { this.error.set('Enter a valid non-negative price, or leave it empty.'); return; }
    if (!/^[A-Z]{3}$/.test(this.itemCurrency().trim().toUpperCase())) { this.error.set('Currency must be a three-letter code, such as MAD or USD.'); return; }
    const payload: Record<string, unknown> = {
      name, slug, description: this.itemDescription().trim(), imageUrl: imageUrl || null,
      priceAmount, currency: this.itemCurrency().trim().toUpperCase(), status: this.itemStatus()
    };
    if (this.itemKind() === 'service') payload['bookingUrl'] = bookingUrl || null;
    const kind = this.itemKind();
    const editingId = this.editingItemId();
    const endpoint = kind === 'product'
      ? (editingId ? `/api/v1/social/me/business/products/${encodeURIComponent(editingId)}` : `/api/v1/social/me/business/storefronts/${encodeURIComponent(storeId)}/products`)
      : (editingId ? `/api/v1/social/me/business/services/${encodeURIComponent(editingId)}` : `/api/v1/social/me/business/storefronts/${encodeURIComponent(storeId)}/services`);
    const options = { headers: this.auth.authorizationHeaders() };
    const request = editingId
      ? this.http.patch<{ product?: CatalogEntry; service?: CatalogEntry }>(endpoint, payload, options)
      : this.http.post<{ product?: CatalogEntry; service?: CatalogEntry }>(endpoint, payload, options);
    this.itemSaving.set(true); this.error.set(''); this.message.set('');
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        const saved = result.product ?? result.service;
        if (!saved) { this.error.set('The saved item could not be returned.'); this.itemSaving.set(false); return; }
        const setter = kind === 'product' ? this.products : this.services;
        setter.update((items) => editingId ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
        this.startItem(kind);
        this.message.set(editingId ? 'Catalog item updated.' : 'Catalog item created.');
        this.itemSaving.set(false);
        this.storefronts.update((items) => items.map((store) => store.id !== storeId ? store : {
          ...store, product_count: kind === 'product' && !editingId ? store.product_count + 1 : store.product_count,
          service_count: kind === 'service' && !editingId ? store.service_count + 1 : store.service_count
        }));
      },
      error: (error) => { this.error.set(error?.error?.error?.message || 'The catalog item could not be saved.'); this.itemSaving.set(false); }
    });
  }

  archiveItem(kind: 'product' | 'service', item: CatalogEntry): void {
    const endpoint = kind === 'product'
      ? `/api/v1/social/me/business/products/${encodeURIComponent(item.id)}`
      : `/api/v1/social/me/business/services/${encodeURIComponent(item.id)}`;
    this.http.patch<{ product?: CatalogEntry; service?: CatalogEntry }>(endpoint, { status: 'archived' }, {
      headers: this.auth.authorizationHeaders()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        const saved = result.product ?? result.service;
        if (!saved) return;
        const setter = kind === 'product' ? this.products : this.services;
        setter.update((items) => items.map((entry) => entry.id === saved.id ? saved : entry));
      },
      error: (error) => this.error.set(error?.error?.error?.message || 'The item could not be archived.')
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
