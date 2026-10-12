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
  private commerceDrag: { element: HTMLElement; pointerId: number; startX: number; startScrollLeft: number } | null = null;

  startCommerceDrag(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const element = event.currentTarget as HTMLElement;
    this.commerceDrag = { element, pointerId: event.pointerId, startX: event.clientX, startScrollLeft: element.scrollLeft };
    element.classList.add('is-dragging');
    element.setPointerCapture(event.pointerId);
  }

  moveCommerceDrag(event: PointerEvent): void {
    if (!this.commerceDrag || this.commerceDrag.pointerId !== event.pointerId) return;
    this.commerceDrag.element.scrollLeft = this.commerceDrag.startScrollLeft - (event.clientX - this.commerceDrag.startX);
    event.preventDefault();
  }

  endCommerceDrag(event: PointerEvent): void {
    if (!this.commerceDrag || this.commerceDrag.pointerId !== event.pointerId) return;
    const element = this.commerceDrag.element;
    element.classList.remove('is-dragging');
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    this.commerceDrag = null;
  }

  barWidth(value: number, values: readonly { value: number }[]): number {
    const maximum = Math.max(1, ...values.map((item) => item.value));
    return Math.max(0, Math.min(100, value / maximum * 100));
  }
}