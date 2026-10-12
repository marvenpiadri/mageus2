import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReadingMoodService } from '../../core/reading-mood.service';
import { ArticleBlock } from '../../domain/article.model';
import { ArticleBlockRendererComponent } from '../article-studio/article-block-renderer.component';

@Component({
  standalone: true,
  selector: 'mageus-reader-page',
  imports: [RouterLink, ArticleBlockRendererComponent],
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
  readonly blocks: ArticleBlock[] = [
    { id: 'preview-text-1', version: 1, type: 'text', html: '<p>The best reading experiences are not built by adding more interface. They emerge when the interface knows when to become quiet—when the page gives an idea room to breathe.</p><h2>A page with a sense of place</h2><p>Every story has its own rhythm. Some ask for a sequence of images, others for careful paragraphs, diagrams, quotations, or a product that belongs naturally within the narrative.</p>' },
    { id: 'preview-quote-1', version: 1, type: 'quote', quote: 'Good design is not decoration around an idea. It is the space that lets the idea become clear.', author: 'Mageus editorial notes' },
    { id: 'preview-image-1', version: 1, type: 'image', imageUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1400&q=85', alt: 'A considered arrangement of printed books', caption: 'The page should give the subject room to speak.', width: 'wide' },
    { id: 'preview-text-2', version: 1, type: 'text', html: '<h2>More than a feed</h2><p>Articles can become living compositions: text and image, slides and galleries, timelines and visual data, with product references and magazine connections where they genuinely add context. Moods can change the atmosphere around the words without taking attention away from them.</p>' }
  ];

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