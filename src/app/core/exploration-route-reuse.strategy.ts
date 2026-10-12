import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  RouteReuseStrategy
} from '@angular/router';

/**
 * Keeps discovery surfaces alive while a reader or another destination is opened.
 * Only routes explicitly marked preserveExplorationState are cached. The shell,
 * wallpaper, and reading-mood service remain outside the routed view and survive
 * every navigation independently.
 */
@Injectable()
export class ExplorationRouteReuseStrategy implements RouteReuseStrategy {
  private readonly handles = new Map<string, DetachedRouteHandle>();
  private readonly maxCachedContexts = 8;

  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return isPlatformBrowser(this.platformId) && route.data['preserveExplorationState'] === true;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = this.key(route);
    if (handle === null) {
      this.handles.delete(key);
      return;
    }
    this.handles.delete(key);
    this.handles.set(key, handle);
    while (this.handles.size > this.maxCachedContexts) {
      const oldestKey = this.handles.keys().next().value;
      if (oldestKey === undefined) break;
      this.handles.delete(oldestKey);
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return isPlatformBrowser(this.platformId)
      && route.data['preserveExplorationState'] === true
      && this.handles.has(this.key(route));
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const key = this.key(route);
    const handle = this.handles.get(key) ?? null;
    if (handle) {
      // Refresh insertion order so recently visited contexts are retained.
      this.handles.delete(key);
      this.handles.set(key, handle);
    }
    return handle;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    if (future.routeConfig !== current.routeConfig) return false;
    if (future.data['preserveExplorationState'] === true) {
      return this.key(future) === this.key(current);
    }
    return true;
  }

  private key(route: ActivatedRouteSnapshot): string {
    const path = route.routeConfig?.path ?? '';
    const params = Object.entries(route.params).sort(([a], [b]) => a.localeCompare(b));
    const query = Object.entries(route.queryParams).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({ path, params, query });
  }
}
