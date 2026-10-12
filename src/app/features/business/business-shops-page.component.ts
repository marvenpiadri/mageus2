import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface LocationOption { id: string; name: string; }
type Visibility = 'draft' | 'published' | 'archived';
interface Storefront {
  id: string; name: string; slug: string; description: string;
  fulfillment_type: 'physical' | 'online' | 'hybrid'; location_id: string | null;
  location_name?: string | null; status: Visibility; product_count: number; service_count: number;
}
interface CatalogItem {
  id: string; storefront_id: string; name: string; slug: string; description: string;
  image_url: string | null; price_amount: number | string | null; currency: string;
  status: Visibility; booking_url?: string | null;
}
interface CatalogPayload {
  name: string; slug: string; description: string; imageUrl: string | null;
  priceAmount: number | null; currency: string; status: Visibility; bookingUrl?: string | null;
}
type CatalogKind = 'product' | 'service';

@Component({
  standalone: true, selector: 'mageus-business-shops-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './business-shops-page.component.html',
  styleUrl: './business-shops-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BusinessShopsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly locations = signal<LocationOption[]>([]);
  readonly shops = signal<Storefront[]>([]);
  readonly selectedShopId = signal<string | null>(null);
  readonly products = signal<CatalogItem[]>([]);
  readonly services = signal<CatalogItem[]>([]);
  readonly shopEditingId = signal<string | null>(null);
  readonly catalogEditingId = signal<string | null>(null);
  readonly catalogKind = signal<CatalogKind>('product');
  readonly shopName = signal('');
  readonly shopSlug = signal('');
  readonly shopDescription = signal('');
  readonly fulfillmentType = signal<'physical' | 'online' | 'hybrid'>('online');
  readonly shopLocationId = signal('');
  readonly shopStatus = signal<Visibility>('draft');
  readonly itemName = signal('');
  readonly itemSlug = signal('');
  readonly itemDescription = signal('');
  readonly itemImageUrl = signal('');
  readonly itemPrice = signal('');
  readonly itemCurrency = signal('MAD');
  readonly itemStatus = signal<Visibility>('draft');
  readonly bookingUrl = signal('');
  readonly error = signal('');
  readonly message = signal('');

  constructor() { void this.load(); }

  async load(): Promise<void> {
    if (!(await this.auth.ensureSession())) {
      await this.router.navigate(['/sign-in'], { queryParams: { returnUrl: '/business/shops' } }); return;
    }
    const headers = this.auth.authorizationHeaders();
    this.http.get<{ locations: LocationOption[] }>('/api/v1/social/me/business/locations', { headers })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.locations.set(result.locations), error: () => this.error.set('Locations could not be loaded.') });
    this.http.get<{ storefronts: Storefront[] }>('/api/v1/social/me/business/storefronts', { headers })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (result) => {
          this.shops.set(result.storefronts);
          this.loading.set(false);
          const selected = this.selectedShopId();
          if (selected && result.storefronts.some((shop) => shop.id === selected)) void this.selectShop(selected);
          else if (result.storefronts.length) void this.selectShop(result.storefronts[0].id);
        },
        error: (error) => { this.error.set(error?.error?.error?.message || 'Your shops could not be loaded.'); this.loading.set(false); }
      });
  }

  setShopName(value: string): void {
    this.shopName.set(value);
    if (!this.shopEditingId()) this.shopSlug.set(this.slugify(value));
  }
  setItemName(value: string): void {
    this.itemName.set(value);
    if (!this.catalogEditingId()) this.itemSlug.set(this.slugify(value));
  }
  private slugify(value: string): string { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160); }

  newShop(): void {
    this.shopEditingId.set(null); this.shopName.set(''); this.shopSlug.set(''); this.shopDescription.set('');
    this.fulfillmentType.set('online'); this.shopLocationId.set(''); this.shopStatus.set('draft'); this.error.set(''); this.message.set('');
  }
  editShop(shop: Storefront): void {
    this.shopEditingId.set(shop.id); this.shopName.set(shop.name); this.shopSlug.set(shop.slug);
    this.shopDescription.set(shop.description || ''); this.fulfillmentType.set(shop.fulfillment_type);
    this.shopLocationId.set(shop.location_id || ''); this.shopStatus.set(shop.status); this.error.set(''); this.message.set('');
  }
  saveShop(): void {
    if (this.saving()) return;
    if (!this.shopName().trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(this.shopSlug().trim())) {
      this.error.set('Add a shop name and a valid URL slug.'); return;
    }
    const payload = { name: this.shopName().trim(), slug: this.shopSlug().trim(), description: this.shopDescription().trim(),
      fulfillmentType: this.fulfillmentType(), locationId: this.shopLocationId() || null, status: this.shopStatus() };
    this.saving.set(true); this.error.set(''); this.message.set('');
    const options = { headers: this.auth.authorizationHeaders() };
    const request = this.shopEditingId()
      ? this.http.patch<{ storefront: Storefront }>(`/api/v1/social/me/business/storefronts/${encodeURIComponent(this.shopEditingId()!)}`, payload, options)
      : this.http.post<{ storefront: Storefront }>('/api/v1/social/me/business/storefronts', payload, options);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ storefront }) => {
        this.shops.update((shops) => [...shops.filter((shop) => shop.id !== storefront.id), storefront].sort((a,b) => a.name.localeCompare(b.name)));
        this.selectedShopId.set(storefront.id); this.shopEditingId.set(storefront.id);
        this.message.set('Shop details saved.'); this.saving.set(false); void this.selectShop(storefront.id);
      },
      error: (error) => { this.error.set(error?.error?.error?.message || 'The shop could not be saved.'); this.saving.set(false); }
    });
  }

  selectShop(id: string): Promise<void> {
    this.selectedShopId.set(id); this.catalogEditingId.set(null); this.resetCatalogForm();
    return new Promise((resolve) => {
      this.http.get<{ products: CatalogItem[]; services: CatalogItem[] }>(`/api/v1/social/me/business/storefronts/${encodeURIComponent(id)}/catalog`, {
        headers: this.auth.authorizationHeaders()
      }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (result) => { this.products.set(result.products); this.services.set(result.services); resolve(); },
        error: (error) => { this.error.set(error?.error?.error?.message || 'This shop catalog could not be loaded.'); resolve(); }
      });
    });
  }

  startCatalog(kind: CatalogKind): void {
    this.catalogKind.set(kind); this.catalogEditingId.set(null); this.resetCatalogForm(); this.error.set(''); this.message.set('');
  }
  editCatalog(item: CatalogItem, kind: CatalogKind): void {
    this.catalogKind.set(kind); this.catalogEditingId.set(item.id); this.itemName.set(item.name); this.itemSlug.set(item.slug);
    this.itemDescription.set(item.description || ''); this.itemImageUrl.set(item.image_url || '');
    this.itemPrice.set(item.price_amount == null ? '' : String(item.price_amount)); this.itemCurrency.set(item.currency || 'MAD');
    this.itemStatus.set(item.status); this.bookingUrl.set(item.booking_url || ''); this.error.set(''); this.message.set('');
  }
  private resetCatalogForm(): void {
    this.itemName.set(''); this.itemSlug.set(''); this.itemDescription.set(''); this.itemImageUrl.set('');
    this.itemPrice.set(''); this.itemCurrency.set('MAD'); this.itemStatus.set('draft'); this.bookingUrl.set('');
  }
  saveCatalog(): void {
    const shopId = this.selectedShopId();
    if (!shopId || this.saving()) return;
    const name = this.itemName().trim(); const slug = this.itemSlug().trim();
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { this.error.set('Add a name and valid URL slug.'); return; }
    const imageUrl = this.itemImageUrl().trim() || null;
    const priceAmount = this.itemPrice().trim() === '' ? null : Number(this.itemPrice());
    if ((imageUrl && !this.isHttpsUrl(imageUrl)) || (priceAmount !== null && (!Number.isFinite(priceAmount) || priceAmount < 0)) || !/^[A-Z]{3}$/.test(this.itemCurrency().trim().toUpperCase())) {
      this.error.set('Use an HTTPS image link, a non-negative price, and a three-letter currency code.'); return;
    }
    const payload: CatalogPayload = { name, slug, description: this.itemDescription().trim(), imageUrl, priceAmount,
      currency: this.itemCurrency().trim().toUpperCase(), status: this.itemStatus() };
    if (this.catalogKind() === 'service') payload.bookingUrl = this.bookingUrl().trim() ? this.bookingUrl().trim() : null;
    if (payload.bookingUrl && !this.isHttpsUrl(payload.bookingUrl)) { this.error.set('Booking links must use HTTPS.'); return; }
    this.saving.set(true); this.error.set(''); this.message.set('');
    const options = { headers: this.auth.authorizationHeaders() };
    const url = this.catalogKind() === 'product'
      ? `/api/v1/social/me/business/storefronts/${encodeURIComponent(shopId)}/products`
      : `/api/v1/social/me/business/storefronts/${encodeURIComponent(shopId)}/services`;
    const updateUrl = this.catalogKind() === 'product'
      ? `/api/v1/social/me/business/products/${encodeURIComponent(this.catalogEditingId() || '')}`
      : `/api/v1/social/me/business/services/${encodeURIComponent(this.catalogEditingId() || '')}`;
    const request = this.catalogEditingId()
      ? this.http.patch<{ product?: CatalogItem; service?: CatalogItem }>(updateUrl, payload, options)
      : this.http.post<{ product?: CatalogItem; service?: CatalogItem }>(url, payload, options);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        const saved = (result.product || result.service)!;
        const kind = this.catalogKind();
        if (kind === 'product') this.products.update((items) => [...items.filter((item) => item.id !== saved.id), saved].sort((a,b) => a.name.localeCompare(b.name)));
        else this.services.update((items) => [...items.filter((item) => item.id !== saved.id), saved].sort((a,b) => a.name.localeCompare(b.name)));
        this.catalogEditingId.set(saved.id); this.message.set(`${kind === 'product' ? 'Product' : 'Service'} saved.`); this.saving.set(false);
        this.shops.update((shops) => shops.map((shop) => shop.id === shopId ? { ...shop, product_count: this.products().length, service_count: this.services().length } : shop));
      },
      error: (error) => { this.error.set(error?.error?.error?.message || 'The catalog item could not be saved.'); this.saving.set(false); }
    });
  }
  private isHttpsUrl(value: string): boolean { try { return new URL(value).protocol === 'https:'; } catch { return false; } }
}
