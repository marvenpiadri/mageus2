import { computed, Injectable, signal } from '@angular/core';
import { READING_MOODS, ReadingMood, ReadingMoodId } from '../domain/reading-mood.model';

@Injectable({ providedIn: 'root' })
export class ReadingMoodService {
  private readonly selectedId = signal<ReadingMoodId>('stars');
  readonly moods = READING_MOODS;
  readonly currentMood = computed(
    () => this.moods.find((mood) => mood.id === this.selectedId()) ?? this.moods[0]
  );

  selectMood(id: ReadingMoodId): void {
    if (this.moods.some((mood) => mood.id === id)) {
      this.selectedId.set(id);
    }
  }
}