import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NgClass } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ReadingMoodService } from './core/reading-mood.service';
import { AuthService } from './core/auth/auth.service';

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
  readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly moodClass = computed(() => `mood-${this.moodService.currentMood().id}`);
  constructor() { if (isPlatformBrowser(this.platformId)) void this.auth.restoreSession(); }
  async logout(): Promise<void> { await this.auth.logout(); }
  readonly wallpaperUrl = 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2400&q=85';
}