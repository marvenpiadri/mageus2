import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ArticleBlock } from '../../domain/article.model';

@Component({
  standalone: true,
  selector: 'mageus-article-block-editor',
  templateUrl: './article-block-editor.component.html',
  styleUrl: './article-block-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleBlockEditorComponent {
  @Input({ required: true }) block!: ArticleBlock;
  @Output() blockChange = new EventEmitter<ArticleBlock>();

  plainText(html: string): string { return html.replace(/<[^>]*>/g, ''); }

  patchBlock(patch: Partial<ArticleBlock>): void {
    this.blockChange.emit({ ...this.block, ...patch } as ArticleBlock);
  }

  addNestedItem(): void {
    switch (this.block.type) {
      case 'gallery': this.patchBlock({ images: [...this.block.images, { url: '', alt: '', caption: '' }] }); break;
      case 'slide': this.patchBlock({ slides: [...this.block.slides, { imageUrl: '', label: '', href: '' }] }); break;
      case 'timeline': this.patchBlock({ events: [...this.block.events, { date: '', title: '', description: '' }] }); break;
      case 'steps': this.patchBlock({ steps: [...this.block.steps, { title: '', description: '' }] }); break;
      case 'data_viz': this.patchBlock({ values: [...this.block.values, { label: '', value: 0 }] }); break;
      case 'hotspot': this.patchBlock({ points: [...this.block.points, { id: globalThis.crypto?.randomUUID?.() ?? `point-${Date.now()}`, x: 50, y: 50, title: '', description: '' }] }); break;
      default: break;
    }
  }

  removeNestedItem(index: number): void {
    switch (this.block.type) {
      case 'gallery': this.patchBlock({ images: this.block.images.filter((_, i) => i !== index) }); break;
      case 'slide': this.patchBlock({ slides: this.block.slides.filter((_, i) => i !== index) }); break;
      case 'timeline': this.patchBlock({ events: this.block.events.filter((_, i) => i !== index) }); break;
      case 'steps': this.patchBlock({ steps: this.block.steps.filter((_, i) => i !== index) }); break;
      case 'data_viz': this.patchBlock({ values: this.block.values.filter((_, i) => i !== index) }); break;
      case 'hotspot': this.patchBlock({ points: this.block.points.filter((_, i) => i !== index) }); break;
      default: break;
    }
  }

  updateNestedItem(index: number, field: string, value: string | number): void {
    const update = <T extends object>(items: T[]): T[] => items.map((item, i) =>
      i === index ? ({ ...item, [field]: value } as T) : item
    );
    switch (this.block.type) {
      case 'gallery': this.patchBlock({ images: update(this.block.images) }); break;
      case 'slide': this.patchBlock({ slides: update(this.block.slides) }); break;
      case 'timeline': this.patchBlock({ events: update(this.block.events) }); break;
      case 'steps': this.patchBlock({ steps: update(this.block.steps) }); break;
      case 'data_viz': this.patchBlock({ values: update(this.block.values) }); break;
      case 'hotspot': this.patchBlock({ points: update(this.block.points) }); break;
      default: break;
    }
  }
}
