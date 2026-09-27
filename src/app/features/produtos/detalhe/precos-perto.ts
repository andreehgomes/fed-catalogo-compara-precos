import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { separarDivergentes } from '@shared/index';
import { of } from 'rxjs';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import { FontePrecosRegiao } from '../../regiao/data-access/fonte-precos-regiao';
import { LocalizacaoStore } from '../../regiao/localizacao/localizacao.store';
import { formatarDistancia } from '../../regiao/ui/oferta-row';

/** "Preços perto de mim agora": as 3 ofertas coerentes mais baratas do Menor Preço. */
@Component({
  selector: 'cp-precos-perto',
  imports: [CurrencyPipe, FontePrecoInfo, RouterLink],
  template: `
    <section class="cp-block" aria-labelledby="perto-titulo">
      <div class="cp-section-top">
        <h2 id="perto-titulo" class="cp-section-title">Preços perto de mim agora</h2>
        <a class="cp-btn-ghost" routerLink="/regiao" [queryParams]="{ gtin: gtin() }">Ver todos</a>
      </div>
      @if (!loc.pronta()) {
        <p class="cp-field-hint">
          Defina sua localização em "Preços perto de mim" para ver ofertas da região.
        </p>
      } @else if (ofertas.isLoading()) {
        <div class="cp-loading" role="status" aria-label="Buscando"><div></div></div>
      } @else if (ofertas.error()) {
        <p class="cp-field-hint">Menor Preço indisponível agora.</p>
      } @else if (melhores().length) {
        <ul class="cp-list">
          @for (o of melhores(); track o.id) {
            <li class="cp-list-row">
              <div class="item-principal">
                <span class="item-nome">{{ o.estabelecimento.nome }}</span>
                <span class="item-detalhe"
                  >{{ distancia(o.distanciaKm) }} · {{ o.estabelecimento.bairro }}</span
                >
                <cp-fonte-preco fonte="menor-preco" [data]="o.dataHora" />
              </div>
              <span class="cp-price">{{ o.valor | currency }}</span>
            </li>
          }
        </ul>
      } @else {
        <p class="cp-field-hint">Nenhuma oferta na região.</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrecosPerto {
  private readonly fonte = inject(FontePrecosRegiao);
  protected readonly loc = inject(LocalizacaoStore);

  readonly gtin = input.required<string>();

  protected readonly distancia = formatarDistancia;
  protected readonly ofertas = rxResource({
    params: () => ({ gtin: this.gtin(), local: this.loc.geohash(), raioKm: this.loc.raioKm() }),
    stream: ({ params }) =>
      params.local
        ? this.fonte.porGtin({ gtin: params.gtin, local: params.local, raioKm: params.raioKm })
        : of(null),
  });
  protected readonly melhores = computed(() => {
    const r = this.ofertas.hasValue() ? this.ofertas.value() : null;
    if (!r) return [];
    return separarDivergentes(r.ofertas, (o) => o.descricao)
      .coerentes.sort((a, b) => a.valor - b.valor)
      .slice(0, 3);
  });
}
