import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { AltaPreco } from '../painel.calculos';

@Component({
  selector: 'cp-precos-que-subiram',
  imports: [BadgePreco, CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    <section class="cp-block" aria-labelledby="subiram-titulo">
      <h2 id="subiram-titulo" class="cp-section-title">Preços que mais subiram</h2>
      @if (altas().length) {
        <ul class="cp-list" aria-label="Preços que mais subiram">
          @for (a of altas(); track a.grupo) {
            <li>
              <a class="cp-list-row" [routerLink]="['/produtos', a.produtoId]">
                <span class="item-principal">
                  <span class="item-nome">{{ a.nome }}</span>
                  <span class="item-detalhe">
                    de {{ a.de | currency }} para {{ a.para | currency }}{{ a.sufixo }} · de
                    {{ a.desde | date: 'dd/MM' }} a {{ a.em | date: 'dd/MM' }}
                  </span>
                </span>
                <cp-badge-preco
                  tipo="mais-caro"
                  [rotulo]="'+' + (a.percentual | number: '1.0-1') + '%'"
                />
              </a>
            </li>
          }
        </ul>
      } @else {
        <p class="cp-empty-inline">
          Os preços que subiram aparecem quando você compra o mesmo produto mais de uma vez.
        </p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrecosQueSubiram {
  readonly altas = input.required<AltaPreco[]>();
}
