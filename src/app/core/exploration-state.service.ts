import { Injectable, WritableSignal, signal } from '@angular/core';

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
 * Holds discovery state by stable surface identity so navigation does not
 * depend solely on a component instance remaining attached in the router.
 * The service intentionally stores data only in memory (no stale persisted
 * feed/profile data across sessions).
 */
@Injectable({ providedIn: 'root' })
export class ExplorationStateService {
  private readonly states = new Map<string, WritableSignal<ExplorationListState<unknown>>>();

  state<T>(key: string): WritableSignal<ExplorationListState<T>> {
    let state = this.states.get(key);
    if (!state) {
      state = signal<ExplorationListState<unknown>>(emptyState<unknown>());
      this.states.set(key, state);
    }
    return state as WritableSignal<ExplorationListState<T>>;
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
}
