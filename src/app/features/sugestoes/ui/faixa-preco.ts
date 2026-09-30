import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { Preco } from '../../../shared/ui/preco/preco';
import { CENTAVO } from '../../notas/detalhe/historico-pessoal';
import { FaixaDePreco } from '../sugestao';

@Component({
  selector: 'cp-faixa-preco',
  imports: [BadgePreco, CurrencyPipe, DatePipe, Preco],
  template: `
    @let f = faixa();
    <dl class="faixa" [class.faixa--sempre]="sempre()">
      @if (sempre()) {
        <div>
          <dt>Sempre</dt>
          <dd>
            <cp-preco [valor]="f.ultimoPago.valor" />{{ f.sufixo }}
            <span class="faixa-fonte">
              última vez {{ f.ultimoPago.compra.emissao | date: 'dd/MM' }} ·
              {{ f.ultimoPago.compra.mercado }}
            </span>
          </dd>
        </div>
      } @else {
        @for (p of precos(); track p.rotulo) {
          <div>
            <dt>{{ p.rotulo }}</dt>
            <dd>
              <cp-preco [valor]="p.preco.valor" />{{ f.sufixo }}
              <span class="faixa-fonte">
                {{ p.preco.compra.emissao | date: 'dd/MM' }} · {{ p.preco.compra.mercado }}
              </span>
            </dd>
          </div>
        }
      }
    </dl>
    @if (!sempre()) {
      @if (acima(); as d) {
        <cp-badge-preco tipo="mais-caro" [rotulo]="(d | currency) + ' acima do seu menor preço'" />
      } @else {
        <cp-badge-preco tipo="igual" textoIgual="É o seu menor preço" />
      }
    }
  `,
  styleUrl: './faixa-preco.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaixaPreco {
  readonly faixa = input.required<FaixaDePreco>();

  protected readonly sempre = computed(() => {
    const f = this.faixa();
    return Math.abs(f.maisCaro.valor - f.maisBarato.valor) < CENTAVO;
  });
  protected readonly precos = computed(() => {
    const f = this.faixa();
    return [
      { rotulo: 'Última vez', preco: f.ultimoPago },
      { rotulo: 'Mais barato', preco: f.maisBarato },
      { rotulo: 'Mais caro', preco: f.maisCaro },
    ];
  });
  /** Quanto o último pago ficou acima do menor que o usuário já pagou; 0 = é o menor. */
  protected readonly acima = computed(() => {
    const f = this.faixa();
    const d = Math.round((f.ultimoPago.valor - f.maisBarato.valor) * 100) / 100;
    return d > CENTAVO ? d : 0;
  });
}
