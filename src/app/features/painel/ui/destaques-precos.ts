import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { DestaquePreco } from '../painel.calculos';

@Component({
  selector: 'cp-destaques-precos',
  imports: [BadgePreco, CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    @if (destaques().pagouMais.length || destaques().economizou.length) {
      <div class="destaques">
        @if (destaques().pagouMais.length) {
          <section class="cp-block" aria-labelledby="pagou-mais-titulo">
            <h2 id="pagou-mais-titulo" class="cp-section-title">Onde você pagou mais</h2>
            <ul class="cp-list" aria-label="Onde você pagou mais">
              @for (d of destaques().pagouMais; track d.chave + d.n) {
                <li>
                  <a class="cp-list-row" [routerLink]="['/produtos', d.produtoId]">
                    <span class="item-principal">
                      <span class="item-nome">{{ d.nome }}</span>
                      <span class="item-detalhe">
                        {{ d.atual | currency }}{{ d.sufixo }} · seu melhor: {{ d.melhor | currency
                        }}{{ d.sufixo }} no {{ d.referencia.mercado }} em
                        {{ d.referencia.emissao | date: 'dd/MM' }}
                      </span>
                    </span>
                    <span class="item-lado">
                      <cp-badge-preco
                        tipo="mais-caro"
                        [rotulo]="(d.valor | currency) + ' a mais'"
                      />
                      <span class="item-detalhe">+{{ d.percentual | number: '1.0-1' }}%</span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          </section>
        }
        @if (destaques().economizou.length) {
          <section class="cp-block" aria-labelledby="economizou-titulo">
            <h2 id="economizou-titulo" class="cp-section-title">Onde você economizou</h2>
            <ul class="cp-list" aria-label="Onde você economizou">
              @for (d of destaques().economizou; track d.chave + d.n) {
                <li>
                  <a class="cp-list-row" [routerLink]="['/produtos', d.produtoId]">
                    <span class="item-principal">
                      <span class="item-nome">{{ d.nome }}</span>
                      <span class="item-detalhe">
                        {{ d.atual | currency }}{{ d.sufixo }} · antes: {{ d.melhor | currency
                        }}{{ d.sufixo }} no {{ d.referencia.mercado }} em
                        {{ d.referencia.emissao | date: 'dd/MM' }}
                      </span>
                    </span>
                    <span class="item-lado">
                      <cp-badge-preco
                        tipo="mais-barato"
                        [rotulo]="(d.valor | currency) + ' de economia'"
                      />
                      <span class="item-detalhe">−{{ d.percentual | number: '1.0-1' }}%</span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
  styles: `
    .destaques {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
      gap: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestaquesPrecos {
  readonly destaques = input.required<{
    pagouMais: DestaquePreco[];
    economizou: DestaquePreco[];
  }>();
}
