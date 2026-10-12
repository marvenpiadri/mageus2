import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReadingMoodService } from '../../core/reading-mood.service';

@Component({
  standalone: true,
  selector: 'mageus-reader-page',
  imports: [RouterLink],
  templateUrl: './reader-page.component.html',
  styleUrl: './reader-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReaderPageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly moods = inject(ReadingMoodService);
  readonly moodMenuOpen = signal(false);
  readonly articleId = this.route.snapshot.paramMap.get('articleId') ?? 'architecture';
  readonly article = computed(() => ({
    title: this.articleId === 'light' ? 'A Study in Twilight Chromatics' : this.articleId === 'materials' ? 'The Quiet Language of Materials' : 'The Architecture of Thoughtful Reading',
    subtitle: 'Why a page should feel like a place, not a feed.',
    author: 'Mageus Journal',
    cover: this.articleId === 'light' ? 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1800&q=90' : 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1800&q=90'
  }));
  readonly progress = signal(0);

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const distance = element.scrollHeight - element.clientHeight;
    this.progress.set(distance > 0 ? Math.round(element.scrollTop / distance * 100) : 0);
  }

  scrollTop(): void {
    if (typeof document !== 'undefined') {
      document.querySelector('.reader-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}