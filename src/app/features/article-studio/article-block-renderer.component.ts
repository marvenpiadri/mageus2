import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ArticleBlock } from '../../domain/article.model';

@Component({
  standalone: true,
  selector: 'mageus-article-block-renderer',
  templateUrl: './article-block-renderer.component.html',
  styleUrl: './article-block-renderer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleBlockRendererComponent {
  readonly block = input.required<ArticleBlock>();
}