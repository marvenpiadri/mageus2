import { afterNextRender, computed, Injectable, PLATFORM_ID, signal, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { READING_MOODS, ReadingMoodId } from '../domain/reading-mood.model';

const READING_MOOD_STORAGE_KEY = 'mageus:reading-mood:v1';

@Injectable({ providedIn: 'root' })
export class ReadingMoodService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly selectedId = signal<ReadingMoodId>('stars');
  readonly moods = READING_MOODS;
  readonly currentMood = computed(
    () => this.moods.find((mood) => mood.id === this.selectedId()) ?? this.moods[0]
  );

  constructor() {
    // Read browser preferences only after the initial render to avoid SSR/hydration
    // mismatches and never access localStorage from the server.
    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => this.restorePreference());
    }
  }

  selectMood(id: ReadingMoodId): void {
    if (!this.moods.some((mood) => mood.id === id)) return;
    this.selectedId.set(id);
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(READING_MOOD_STORAGE_KEY, id);
      } catch {
        // Preferences remain usable for this session when storage is blocked.
      }
    }
  }

  private restorePreference(): void {
    try {
      const saved = localStorage.getItem(READING_MOOD_STORAGE_KEY);
      if (saved && this.moods.some((mood) => mood.id === saved)) {
        this.selectedId.set(saved as ReadingMoodId);
      }
    } catch {
      // Private browsing or browser storage policies may disable localStorage.
    }
  }
}
