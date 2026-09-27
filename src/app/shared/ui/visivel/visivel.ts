import { DestroyRef, Directive, ElementRef, afterNextRender, inject, output } from '@angular/core';

@Directive({ selector: '[cpVisivel]' })
export class Visivel {
  readonly cpVisivel = output<void>();

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      const obs = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting)) this.cpVisivel.emit();
        },
        { rootMargin: '200px 0px' },
      );
      obs.observe(el);
      destroy.onDestroy(() => obs.disconnect());
    });
  }
}
