import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

interface BusinessLocation { id: string; name: string; slug: string; }
interface MenuItemRecord {
  id?: string; name: string; description: string; image_url?: string | null;
  price_amount?: number | string | null; currency: string; category: string;
  sort_order?: number; is_available: boolean;
}
interface BusinessMenu {
  id: string; location_id: string; location_name: string; name: string; slug: string;
  description: string; pdf_url: string | null; status: 'draft' | 'published' | 'archived';
  items: MenuItemRecord[];
}
interface MenuItemDraft {
  name: string; description: string; imageUrl: string; priceAmount: string;
  currency: string; category: string; isAvailable: boolean;
}
interface MenuPayload {
  locationId: string; name: string; slug: string; description: string;
  pdfUrl: string | null; status: 'draft' | 'published' | 'archived';
  items: Array<{ name: string; description: string; imageUrl: string | null; priceAmount: number | null; currency: string; category: string; sortOrder: number; isAvailable: boolean }>;
}

@Component({
  standalone: true,
  selector: 'mageus-business-menus-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './business-menus-page.component.html',
  styleUrl: './business-menus-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BusinessMenusPageComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly locations = signal<BusinessLocation[]>([]);
  readonly menus = signal<BusinessMenu[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly name = signal('');
  readonly slug = signal('');
  readonly locationId = signal('');
  readonly description = signal('');
  readonly pdfUrl = signal('');
  readonly status = signal<'draft' | 'published' | 'archived'>('draft');
  readonly items = signal<MenuItemDraft[]>([]);
  readonly error = signal('');
  readonly message = signal('');
  readonly deleteConfirmId = signal<string | null>(null);

  constructor() { void this.load(); }

  async load(): Promise<void> {
    if (!(await this.auth.ensureSession())) {
      await this.router.navigate(['/sign-in'], { queryParams: { returnUrl: '/business/menus' } });
      return;
    }
    this.loading.set(true);
    this.http.get<{ locations: BusinessLocation[] }>('/api/v1/social/me/business/locations', {
      headers: this.auth.authorizationHeaders()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.locations.set(result.locations);
        if (!this.locationId() && result.locations.length) this.locationId.set(result.locations[0].id);
        this.loading.set(false);
      },
      error: (error) => { this.error.set(error?.error?.error?.message || 'Locations could not be loaded.'); this.loading.set(false); }
    });
    this.http.get<{ menus: BusinessMenu[] }>('/api/v1/social/me/business/menus', {
      headers: this.auth.authorizationHeaders()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => this.menus.set(result.menus),
      error: (error) => this.error.set(error?.error?.error?.message || 'Menus could not be loaded.')
    });
  }

  setName(value: string): void {
    this.name.set(value);
    if (!this.editingId()) this.slug.set(value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120));
  }
  newMenu(): void {
    this.editingId.set(null); this.name.set(''); this.slug.set(''); this.description.set('');
    this.pdfUrl.set(''); this.status.set('draft'); this.items.set([]);
    if (this.locations().length) this.locationId.set(this.locations()[0].id);
    this.error.set(''); this.message.set(''); this.deleteConfirmId.set(null);
  }
  edit(menu: BusinessMenu): void {
    this.editingId.set(menu.id); this.name.set(menu.name); this.slug.set(menu.slug);
    this.locationId.set(menu.location_id); this.description.set(menu.description || '');
    this.pdfUrl.set(menu.pdf_url || ''); this.status.set(menu.status);
    this.items.set((menu.items || []).map((item) => ({
      name: item.name, description: item.description || '', imageUrl: item.image_url || '',
      priceAmount: item.price_amount == null ? '' : String(item.price_amount),
      currency: item.currency || 'USD', category: item.category || '', isAvailable: item.is_available
    })));
    this.error.set(''); this.message.set(''); this.deleteConfirmId.set(null);
  }
  addItem(): void {
    this.items.update((items) => [...items, { name: '', description: '', imageUrl: '', priceAmount: '', currency: 'USD', category: '', isAvailable: true }]);
  }
  updateItem(index: number, field: keyof MenuItemDraft, value: string | boolean): void {
    this.items.update((items) => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }
  removeItem(index: number): void { this.items.update((items) => items.filter((_, i) => i !== index)); }
  moveItem(index: number, offset: number): void {
    const target = index + offset;
    if (target < 0 || target >= this.items().length) return;
    this.items.update((items) => { const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  save(): void {
    if (this.saving()) return;
    if (!this.locationId() || !this.name().trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(this.slug().trim())) {
      this.error.set('Choose a location, add a menu name, and check the URL slug.'); return;
    }
    if (this.pdfUrl().trim() && !this.isHttpsUrl(this.pdfUrl().trim())) {
      this.error.set('The PDF link must be a valid HTTPS URL.'); return;
    }
    const payload: MenuPayload = {
      locationId: this.locationId(), name: this.name().trim(), slug: this.slug().trim(),
      description: this.description().trim(), pdfUrl: this.pdfUrl().trim() || null, status: this.status(),
      items: this.items().map((item, index) => ({
        name: item.name.trim(), description: item.description.trim(), imageUrl: item.imageUrl.trim() || null,
        priceAmount: item.priceAmount.trim() === '' ? null : Number(item.priceAmount),
        currency: item.currency.trim().toUpperCase() || 'USD', category: item.category.trim(),
        sortOrder: index, isAvailable: item.isAvailable
      }))
    };
    const invalidItem = payload.items.find((item) => !item.name || (item.priceAmount !== null && (!Number.isFinite(item.priceAmount) || item.priceAmount < 0)) || (item.imageUrl !== null && !this.isHttpsUrl(item.imageUrl)) || !/^[A-Z]{3}$/.test(item.currency));
    if (invalidItem) { this.error.set('Every menu item needs a name. Prices must be non-negative, and image links and currency codes must be valid.'); return; }
    this.saving.set(true); this.error.set(''); this.message.set('');
    const options = { headers: this.auth.authorizationHeaders() };
    const request = this.editingId()
      ? this.http.patch<{ menu: BusinessMenu }>(`/api/v1/social/me/business/menus/${encodeURIComponent(this.editingId()!)}`, payload, options)
      : this.http.post<{ menu: BusinessMenu }>('/api/v1/social/me/business/menus', payload, options);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.menus.update((menus) => {
          const updated = [...menus.filter((menu) => menu.id !== result.menu.id), result.menu];
          return updated.sort((a, b) => a.location_name.localeCompare(b.location_name) || a.name.localeCompare(b.name));
        });
        this.message.set(this.editingId() ? 'Menu saved.' : 'Menu created.');
        this.editingId.set(result.menu.id); this.saving.set(false);
      },
      error: (error) => { this.error.set(error?.error?.error?.message || 'The menu could not be saved.'); this.saving.set(false); }
    });
  }
  requestDelete(menu: BusinessMenu): void {
    if (this.deleteConfirmId() !== menu.id) { this.deleteConfirmId.set(menu.id); this.message.set('Confirm that you want to permanently delete this menu and its items.'); return; }
    this.http.delete<{ deleted: boolean }>(`/api/v1/social/me/business/menus/${encodeURIComponent(menu.id)}`, {
      headers: this.auth.authorizationHeaders()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.menus.update((menus) => menus.filter((item) => item.id !== menu.id));
        this.deleteConfirmId.set(null); this.message.set('Menu deleted.');
        if (this.editingId() === menu.id) this.newMenu();
      },
      error: (error) => { this.error.set(error?.error?.error?.message || 'The menu could not be deleted.'); this.deleteConfirmId.set(null); }
    });
  }
  private isHttpsUrl(value: string): boolean {
    try { const url = new URL(value); return url.protocol === 'https:'; } catch { return false; }
  }
}
