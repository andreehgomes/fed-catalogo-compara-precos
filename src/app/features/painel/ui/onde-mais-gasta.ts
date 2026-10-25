import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MaiorGasto } from '../painel.calculos';

@Component({
  selector: 'cp-onde-mais-gasta',
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    @if (gastos().length) {
      <section class="cp-block" aria-labelledby="mais-gasta-titulo">
        <h2 id="mais-gasta-titulo" class="cp-section-title">Onde mais gasta (3 meses)</h2>
        <ul class="cp-list" aria-label="Onde mais gasta">
          @for (g of gastos(); track g.grupo) {
            <li>
              <a class="cp-list-row" [routerLink]="['/produtos', g.produtoId]">
                <span class="item-principal">
                  <span class="item-nome">{{ g.nome }}</span>
                  <span class="item-detalhe">
                    {{ g.compras }} {{ g.compras === 1 ? 'compra' : 'compras' }}
                    @if (g.quantidade !== null) {
                      · {{ g.quantidade | number: '1.0-3' }} {{ g.unidade.toLowerCase() }}
                    }
                  </span>
                </span>
                <span class="cp-price">{{ g.total | currency }}</span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OndeMaisGasta {
  readonly gastos = input.required<MaiorGasto[]>();
}
