import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ArticleBlock } from '../../domain/article.model';

@Component({
  standalone: true,
  selector: 'mageus-article-block-editor',
  templateUrl: './article-block-editor.component.html',
  styleUrl: './article-block-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleBlockEditorComponent {
  readonly block = input.required<ArticleBlock>();
  readonly blockChange = output<ArticleBlock>();

  patch(patch: Partial<ArticleBlock>): void {
    this.blockChange.emit({ ...this.block(), ...patch } as ArticleBlock);
  }

  plainText(html: string): string { return html.replace(/<[^>]*>/g, ''); }

  updateNestedItem(index: number, field: string, value: string | number): void {
    const block = this.block();
    const update = <T extends object>(items: T[]): T[] => items.map((item, i) => i === index ? ({ ...item, [field]: value } as T) : item);
    switch (block.type) {
      case 'gallery': this.patch({ images: update(block.images) }); break;
      case 'slide': this.patch({ slides: update(block.slides) }); break;
      case 'timeline': this.patch({ events: update(block.events) }); break;
      case 'steps': this.patch({ steps: update(block.steps) }); break;
      case 'data_viz': this.patch({ values: update(block.values) }); break;
      case 'hotspot': this.patch({ points: update(block.points) }); break;
      default: break;
    }
  }

  addNestedItem(): void {
    const block = this.block();
    switch (block.type) {
      case 'gallery': this.patch({ images: [...block.images, { url: '', alt: '', caption: '' }] }); break;
      case 'slide': this.patch({ slides: [...block.slides, { imageUrl: '', label: '', href: '' }] }); break;
      case 'timeline': this.patch({ events: [...block.events, { date: '', title: '', description: '' }] }); break;
      case 'steps': this.patch({ steps: [...block.steps, { title: '', description: '' }] }); break;
      case 'data_viz': this.patch({ values: [...block.values, { label: '', value: 0 }] }); break;
      case 'hotspot': this.patch({ points: [...block.points, { id: globalThis.crypto?.randomUUID?.() ?? `point-${Date.now()}`, x: 50, y: 50, title: '', description: '' }] }); break;
      default: break;
    }
  }

  removeNestedItem(index: number): void {
    const block = this.block();
    switch (block.type) {
      case 'gallery': this.patch({ images: block.images.filter((_, i) => i !== index) }); break;
      case 'slide': this.patch({ slides: block.slides.filter((_, i) => i !== index) }); break;
      case 'timeline': this.patch({ events: block.events.filter((_, i) => i !== index) }); break;
      case 'steps': this.patch({ steps: block.steps.filter((_, i) => i !== index) }); break;
      case 'data_viz': this.patch({ values: block.values.filter((_, i) => i !== index) }); break;
      case 'hotspot': this.patch({ points: block.points.filter((_, i) => i !== index) }); break;
      default: break;
    }
  }

  setProductId(index: number, value: string): void {
    const block = this.block();
    if (block.type === 'product_collection') this.patch({ productIds: block.productIds.map((id, i) => i === index ? value : id) });
  }
  addProductId(): void { const block = this.block(); if (block.type === 'product_collection') this.patch({ productIds: [...block.productIds, ''] }); }
  removeProductId(index: number): void { const block = this.block(); if (block.type === 'product_collection') this.patch({ productIds: block.productIds.filter((_, i) => i !== index) }); }
}
