import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { formatarCnpj } from '@shared/chave-acesso';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import { EstabelecimentosService } from '../data-access/estabelecimentos.service';

@Component({
  selector: 'cp-estabelecimento-detalhe',
  imports: [CurrencyPipe, EmptyState, FontePrecoInfo, MatIconModule, RouterLink],
  template: `
    @if (dados.isLoading()) {
      <main class="cp-page cp-page--detalhe" role="status">
        <span class="cp-sr-only">Carregando…</span>
        <div class="cp-skeleton" style="height: 200px" aria-hidden="true"></div>
      </main>
    } @else if (valor(); as v) {
      <main class="cp-page cp-page--detalhe">
        <header class="cp-detail-header">
          <a
            class="cp-btn-icon"
            routerLink="/estabelecimentos"
            aria-label="Voltar para Estabelecimentos"
          >
            <mat-icon aria-hidden="true">arrow_back</mat-icon>
          </a>
          <div>
            <h1>{{ v.estabelecimento.fantasia || v.estabelecimento.nome }}</h1>
            <p>CNPJ {{ cnpjFormatado() }} · {{ v.estabelecimento.endereco }}</p>
          </div>
        </header>
        <section class="cp-block">
          <h2 class="cp-section-title">Produtos com preço mais recente</h2>
          @if (v.produtos.length) {
            <ul class="cp-list" aria-label="Produtos">
              @for (p of v.produtos; track p.produtoId) {
                <li>
                  <a class="cp-list-row" [routerLink]="['/produtos', p.produtoId]">
                    <span class="item-principal">
                      <span class="item-nome">{{ p.produto?.descricao ?? p.produtoId }}</span>
                      <cp-fonte-preco fonte="comunidade" [data]="p.preco.emissao" />
                    </span>
                    <span class="item-lado">
                      <span class="cp-price">{{ p.preco.vlUnit | currency }}</span>
                      @if (p.preco.precoPorUnidadeBase; as u) {
                        <span class="cp-price-unit">{{ u.valor | currency }}/{{ u.unidade }}</span>
                      }
                    </span>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <p class="cp-field-hint">Sem preços publicados ainda.</p>
          }
        </section>
      </main>
    } @else {
      <main class="cp-page cp-page--form">
        <cp-empty-state icone="storefront" titulo="Estabelecimento não encontrado">
          <a class="cp-btn-primary" routerLink="/estabelecimentos">Ver estabelecimentos</a>
        </cp-empty-state>
      </main>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class EstabelecimentoDetalhePage {
  private readonly service = inject(EstabelecimentosService);

  readonly cnpj = input.required<string>();

  protected readonly dados = resource({
    params: () => this.cnpj(),
    loader: async ({ params }) => {
      const [estabelecimento, produtos] = await Promise.all([
        this.service.obter(params),
        this.service.produtosRecentes(params),
      ]);
      return estabelecimento ? { estabelecimento, produtos } : null;
    },
  });
  protected readonly valor = computed(() => (this.dados.hasValue() ? this.dados.value() : null));
  protected readonly cnpjFormatado = computed(() => formatarCnpj(this.cnpj()));
}
