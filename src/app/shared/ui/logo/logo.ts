import { NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';
import { TemaService } from '../../../core/tema/tema.service';

export const IMAGENS_LOGO = {
  completa: { claro: 'logo/logo.png', escuro: 'logo/logo-escuro.png', largura: 720, altura: 151 },
  simbolo: {
    claro: 'logo/simbolo.png',
    escuro: 'logo/simbolo-escuro.png',
    largura: 40,
    altura: 40,
  },
} as const;

/** Logo da marca na versão do tema em uso; o tamanho vem da classe no host. */
@Component({
  selector: 'cp-logo',
  imports: [NgOptimizedImage],
  template: `<img
    [ngSrc]="src()"
    [width]="imagem().largura"
    [height]="imagem().altura"
    [priority]="prioritaria()"
    alt="Cupom Esperto"
  />`,
  styles: 'img { display: block; width: 100%; height: auto; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  private readonly tema = inject(TemaService);

  readonly variante = input<keyof typeof IMAGENS_LOGO>('completa');
  readonly prioritaria = input(false, { transform: booleanAttribute });

  protected readonly imagem = computed(() => IMAGENS_LOGO[this.variante()]);
  protected readonly src = computed(() =>
    this.tema.escuro() ? this.imagem().escuro : this.imagem().claro,
  );
}
