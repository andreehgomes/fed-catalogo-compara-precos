import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import { OfertaRegiao } from '../data-access/regiao.model';

export function formatarDistancia(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

@Component({
  selector: 'cp-oferta-row',
  imports: [BadgePreco, CurrencyPipe, FontePrecoInfo],
  template: `
    <div class="item-principal">
      <span class="item-nome">{{ oferta().estabelecimento.nome }}</span>
      <span class="item-detalhe">
        {{ oferta().estabelecimento.endereco }}
        @if (oferta().estabelecimento.bairro) {
          · {{ oferta().estabelecimento.bairro }}
        }
      </span>
      <span class="item-detalhe">{{ oferta().descricao }}</span>
      <cp-fonte-preco fonte="menor-preco" [data]="oferta().dataHora" />
    </div>
    <div class="item-lado">
      <span class="cp-price">{{ oferta().valor | currency }}</span>
      @if (oferta().desconto > 0 && oferta().valorTabela > oferta().valor) {
        <span class="cp-price-old">
          <span class="cp-sr-only">Preço sem desconto:</span>{{ oferta().valorTabela | currency }}
        </span>
      }
      <span class="item-detalhe">{{ distancia() }}</span>
      @if (menor()) {
        <cp-badge-preco tipo="mais-barato" rotulo="Menor preço" />
      }
    </div>
  `,
  host: { class: 'cp-list-row' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfertaRow {
  readonly oferta = input.required<OfertaRegiao>();
  readonly menor = input(false);

  protected readonly distancia = computed(() => formatarDistancia(this.oferta().distanciaKm));
}
