import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'cp-preco',
  imports: [CurrencyPipe],
  template: `
    <span class="cp-price">{{ valor() | currency }}</span>
    @if (precoPorUnidade() !== null && unidade()) {
      <span class="cp-price-unit">{{ precoPorUnidade() | currency }}/{{ unidade() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-direction: column;
      align-items: inherit;
      gap: 1px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Preco {
  readonly valor = input.required<number>();
  readonly unidade = input<string | null>(null);
  readonly precoPorUnidade = input<number | null>(null);
}
