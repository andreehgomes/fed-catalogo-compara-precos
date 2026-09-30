import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { formatarCnpj } from '@shared/chave-acesso';
import type { Estabelecimento } from '@shared/model';
import { firstValueFrom } from 'rxjs';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import { ApelidosService } from '../data-access/apelidos.service';
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
            <h1>{{ titulo() }}</h1>
            @if (apelido() && v.estabelecimento.fantasia) {
              <p>Nome na Receita: {{ v.estabelecimento.fantasia }}</p>
            }
            @if (titulo() !== v.estabelecimento.nome) {
              <p>Razão social: {{ v.estabelecimento.nome }}</p>
            }
            <p>CNPJ {{ cnpjFormatado() }} · {{ v.estabelecimento.endereco }}</p>
          </div>
          <button
            type="button"
            class="cp-btn-icon cp-detail-header-acao"
            aria-label="Renomear estabelecimento"
            (click)="renomear(v.estabelecimento)"
          >
            <mat-icon aria-hidden="true">edit</mat-icon>
          </button>
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
  private readonly apelidos = inject(ApelidosService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

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
  protected readonly apelido = computed(() => this.apelidos.apelidos().get(this.cnpj()));
  protected readonly titulo = computed(() => {
    const v = this.valor();
    return v ? this.apelidos.nome(v.estabelecimento) : '';
  });

  protected async renomear(estab: Estabelecimento): Promise<void> {
    const { RenomearDialog } = await import('../renomear/renomear-dialog');
    const apelido = this.apelido();
    const ref = this.dialog.open(RenomearDialog, {
      data: {
        cnpj: estab.cnpj,
        nome: estab.nome,
        ...(estab.fantasia ? { fantasia: estab.fantasia } : {}),
        ...(apelido ? { apelido } : {}),
      },
      maxWidth: '480px',
      width: '95vw',
    });
    const r = await firstValueFrom(ref.afterClosed());
    if (!r) return;
    const notas =
      r.notasAtualizadas === 1 ? '1 nota atualizada' : `${r.notasAtualizadas} notas atualizadas`;
    this.snack.open(r.apelido ? `Nome salvo. ${notas}.` : 'Nome oficial restaurado.', 'OK', {
      duration: 4000,
    });
  }
}
