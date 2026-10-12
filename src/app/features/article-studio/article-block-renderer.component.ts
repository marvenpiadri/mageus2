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

  barWidth(value: number, values: readonly { value: number }[]): number {
    const maximum = Math.max(1, ...values.map((item) => item.value));
    return Math.max(0, Math.min(100, value / maximum * 100));
  }
}