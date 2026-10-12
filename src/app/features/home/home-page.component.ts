import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'mageus-home-page',
  imports: [RouterLink],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent {
  readonly articles = [
    { id: 'architecture', category: 'SPACE & FORM', title: 'The Architecture of Thoughtful Reading', subtitle: 'Why a page should feel like a place, not a feed.', image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1200&q=85', author: 'Mageus Journal', time: '8 min read' },
    { id: 'light', category: 'IMAGE & LIGHT', title: 'A Study in Twilight Chromatics', subtitle: 'A visual inquiry into the colors that appear between day and night.', image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=85', author: 'Studio Notes', time: '6 min read' },
    { id: 'materials', category: 'OBJECTS & MATERIALS', title: 'The Quiet Language of Materials', subtitle: 'Wood, paper, glass, and the feeling of things made with intention.', image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f4664?auto=format&fit=crop&w=1000&q=85', author: 'Field Journal', time: '5 min read' }
  ];
}