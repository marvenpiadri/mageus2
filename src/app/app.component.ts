import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ReadingMoodService } from './core/reading-mood.service';

@Component({
  selector: 'mageus-root',
  standalone: true,
  imports: [NgClass, RouterLink, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  readonly moodService = inject(ReadingMoodService);
  readonly moodClass = computed(() => `mood-${this.moodService.currentMood().id}`);
  readonly wallpaperUrl = 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2400&q=85';
}