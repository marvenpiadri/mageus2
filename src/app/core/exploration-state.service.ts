import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, WritableSignal, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

export interface ExplorationListState<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  filters: Record<string, string | number | boolean | null>;
  scrollTop: number;
}

const emptyState = <T>(): ExplorationListState<T> => ({
  items: [],
  nextCursor: null,
  hasMore: true,
  loading: false,
  failed: false,
  filters: {},
  scrollTop: 0
});

/**
 * Keeps exploration data and its document-scroll position by stable context key.
 * Discovery surfaces use document scrolling; the newspaper owns its separate
 * .public-reader-scroll container and is intentionally not registered here.
 */
@Injectable({ providedIn: 'root' })
export class ExplorationStateService {
  private readonly states = new Map<string, WritableSignal<ExplorationListState<unknown>>>();
  private readonly routeContexts = new Map<string, string>();
  private activeContextKey: string | null = null;
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);

  constructor() {
    if (!this.browser) return;
    this.router.events.pipe(
      filter((event): event is NavigationStart | NavigationEnd => event instanceof NavigationStart || event instanceof NavigationEnd)
    ).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.saveActiveScroll();
        return;
      }
      const path = this.pathOf(event.urlAfterRedirects);
      const key = this.routeContexts.get(path);
      if (key) {
        this.activateAndRestore(key);
      } else {
        this.activeContextKey = null;
        // Article pages have their own reader scroll container, so start the
        // document at the top without disturbing the saved exploration position.
        this.document.defaultView?.scrollTo(0, 0);
      }
    });
  }

  state<T>(key: string): WritableSignal<ExplorationListState<T>> {
    let state = this.states.get(key);
    if (!state) {
      state = signal<ExplorationListState<unknown>>(emptyState<unknown>());
      this.states.set(key, state);
    }
    return state as WritableSignal<ExplorationListState<T>>;
  }

  registerContext(path: string, key: string): void {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    this.routeContexts.set(normalizedPath, key);
    if (this.browser && this.pathOf(this.router.url) === normalizedPath) {
      this.activateAndRestore(key);
    }
  }

  patch<T>(key: string, update: Partial<ExplorationListState<T>>): void {
    const state = this.state<T>(key);
    state.update((current) => ({ ...current, ...update }));
  }

  replacePage<T>(key: string, items: T[], nextCursor: string | null): void {
    this.patch<T>(key, {
      items,
      nextCursor,
      hasMore: nextCursor !== null,
      loading: false,
      failed: false
    });
  }

  appendPage<T>(key: string, items: T[], nextCursor: string | null, getId: (item: T) => string): void {
    const state = this.state<T>(key);
    state.update((current) => {
      const seen = new Set(current.items.map(getId));
      const appended = items.filter((item) => {
        const id = getId(item);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      return {
        ...current,
        items: [...current.items, ...appended],
        nextCursor,
        hasMore: nextCursor !== null,
        loading: false,
        failed: false
      };
    });
  }

  saveScroll(key: string, scrollTop: number): void {
    this.patch(key, { scrollTop: Math.max(0, scrollTop) });
  }

  setFilters<T>(key: string, filters: ExplorationListState<T>['filters']): void {
    this.patch<T>(key, { filters });
  }

  clear(key: string): void {
    this.states.delete(key);
  }

  private saveActiveScroll(): void {
    if (!this.activeContextKey) return;
    this.saveScroll(this.activeContextKey, this.document.defaultView?.scrollY ?? 0);
  }

  private activateAndRestore(key: string): void {
    this.activeContextKey = key;
    const top = this.state<unknown>(key)().scrollTop;
    // Restore after the router has attached or reattached the routed view.
    this.document.defaultView?.requestAnimationFrame(() => {
      if (this.activeContextKey === key) this.document.defaultView?.scrollTo(0, top);
    });
  }

  private pathOf(url: string): string {
    try {
      return new URL(url, this.document.defaultView?.location.origin ?? 'http://localhost').pathname;
    } catch {
      return '/';
    }
  }
}
