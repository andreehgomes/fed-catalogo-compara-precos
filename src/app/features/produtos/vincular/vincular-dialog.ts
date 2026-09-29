import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { jaccard, tokensSemMedida } from '@shared/index';
import type { Produto } from '@shared/model';
import { ProdutosService } from '../data-access/produtos.service';

export interface DadosVinculo {
  produto: Produto;
  excluir: readonly string[];
}

const MENSAGENS: Record<string, string> = {
  'eans-distintos': 'Os dois já têm códigos de barras diferentes: são produtos distintos.',
  ciclo: 'Esses produtos já estão ligados de um jeito que formaria um ciclo.',
  'rate-limit': 'Muitas alterações seguidas. Tente em alguns minutos.',
};

/** Mesmo conteúdo (ex.: 1 L) quando os dois o têm. */
export function mesmoConteudo(a: Produto, b: Produto): boolean {
  if (!a.conteudo || !b.conteudo) return true;
  return (
    a.conteudo.unidadeBase === b.conteudo.unidadeBase &&
    Math.abs(a.conteudo.quantidade - b.conteudo.quantidade) < 1e-6
  );
}

export function sugerir(
  produto: Produto,
  candidatos: readonly Produto[],
  excluir: ReadonlySet<string>,
): Produto[] {
  const alvo = tokensSemMedida(produto.descricao);
  return candidatos
    .filter((c) => !excluir.has(c.id) && c.id !== produto.id && mesmoConteudo(produto, c))
    .map((c) => ({ c, s: jaccard(alvo, tokensSemMedida(c.descricao)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(!!b.c.ean) - Number(!!a.c.ean))
    .map((x) => x.c);
}

@Component({
  selector: 'cp-vincular-dialog',
  imports: [MatDialogModule],
  template: `
    <div class="vincular">
      <h2 mat-dialog-title class="cp-section-title">Este produto é o mesmo que…</h2>
      <p class="cp-field-hint">
        "{{ dados.produto.descricao }}". Ao ligar, a comparação passa a considerar os dois juntos
        para todos os usuários.
      </p>
      @if (sugestoesEan().length) {
        <ul class="cp-list" aria-label="Códigos de barras encontrados no Menor Preço">
          @for (s of sugestoesEan(); track s.gtin) {
            <li>
              <button
                type="button"
                class="cp-list-row"
                [attr.aria-pressed]="escolhidoEan() === s.gtin"
                (click)="escolherEan(s.gtin)"
              >
                <span class="item-principal">
                  <span class="item-nome">{{ s.descricao }}</span>
                  <span class="item-detalhe"
                    >EAN {{ s.gtin }} · visto em {{ s.lojas }}
                    {{ s.lojas === 1 ? 'mercado' : 'mercados' }} no Menor Preço</span
                  >
                </span>
              </button>
            </li>
          }
        </ul>
      }
      @if (possiveis().length) {
        <span class="cp-label" id="possiveis-titulo">Possíveis equivalentes</span>
        <ul class="cp-list" aria-labelledby="possiveis-titulo">
          @for (c of possiveis(); track c.id) {
            <li>
              <button
                type="button"
                class="cp-list-row"
                [attr.aria-pressed]="escolhido()?.id === c.id"
                (click)="escolherProduto(c)"
              >
                <span class="item-principal">
                  <span class="item-nome">{{ c.descricao }}</span>
                  <span class="item-detalhe">{{
                    c.ean ? 'EAN ' + c.ean : 'Sem código de barras'
                  }}</span>
                </span>
              </button>
            </li>
          }
        </ul>
      }
      <label class="cp-field">
        <span>Buscar produto</span>
        <input type="search" autocomplete="off" [value]="termo()" (input)="digitar($event)" />
      </label>
      @if (candidatos.isLoading()) {
        <div class="cp-loading" role="status" aria-label="Buscando"><div></div></div>
      }
      <ul class="cp-list" aria-label="Sugestões">
        @for (c of sugestoes(); track c.id) {
          <li>
            <button
              type="button"
              class="cp-list-row"
              [attr.aria-pressed]="escolhido()?.id === c.id"
              (click)="escolherProduto(c)"
            >
              <span class="item-principal">
                <span class="item-nome">{{ c.descricao }}</span>
                <span class="item-detalhe">{{
                  c.ean ? 'EAN ' + c.ean : 'Sem código de barras'
                }}</span>
              </span>
            </button>
          </li>
        } @empty {
          @if (!candidatos.isLoading()) {
            <li class="cp-empty-inline">Nenhum produto parecido. Busque por outro nome.</li>
          }
        }
      </ul>
      @if (erro(); as msg) {
        <p class="cp-field-error" role="alert">{{ msg }}</p>
      }
      <div class="cp-form-actions">
        <button type="button" class="cp-btn-secondary" mat-dialog-close>Cancelar</button>
        <button
          type="button"
          class="cp-btn-primary"
          [disabled]="!destino() || salvando()"
          (click)="vincular()"
        >
          {{ salvando() ? 'Ligando…' : 'É o mesmo produto' }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .vincular {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 22px;
      max-height: 80vh;
      overflow: auto;
    }

    h2 {
      margin: 0;
      padding: 0;
    }

    button[aria-pressed='true'] .item-nome {
      text-decoration: underline;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VincularDialog {
  protected readonly dados = inject<DadosVinculo>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<VincularDialog, boolean>);
  private readonly service = inject(ProdutosService);

  protected readonly termo = signal(
    this.dados.produto.descricaoNorm
      .split(' ')
      .filter((t) => !/\d/.test(t))
      .slice(0, 2)
      .join(' '),
  );
  protected readonly escolhido = signal<Produto | null>(null);
  protected readonly escolhidoEan = signal<string | null>(null);
  protected readonly sugestoesEan = computed(() =>
    this.dados.produto.vinculadoA ? [] : (this.dados.produto.sugestoesEan ?? []),
  );
  protected readonly destino = computed(() => {
    const ean = this.escolhidoEan();
    return ean ? `ean:${ean}` : (this.escolhido()?.id ?? null);
  });
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  private readonly candidatosVinculo = resource({
    params: () =>
      !this.dados.produto.vinculadoA && this.dados.produto.candidatosVinculo?.length
        ? this.dados.produto.candidatosVinculo
        : undefined,
    loader: async ({ params }) => {
      const produtos = await this.service.produtosPorIds(params);
      return params.flatMap((id) => produtos.get(id) ?? []);
    },
  });
  protected readonly possiveis = computed(() =>
    this.candidatosVinculo.hasValue()
      ? this.candidatosVinculo.value().filter((p) => !this.dados.excluir.includes(p.id))
      : [],
  );

  protected readonly candidatos = resource({
    params: () => this.termo().trim() || undefined,
    loader: ({ params }) => this.service.buscar(params),
  });
  protected readonly sugestoes = computed(() =>
    sugerir(
      this.dados.produto,
      this.candidatos.hasValue() ? this.candidatos.value() : [],
      new Set([...this.dados.excluir, ...this.possiveis().map((p) => p.id)]),
    ),
  );

  protected escolherProduto(p: Produto): void {
    this.escolhidoEan.set(null);
    this.escolhido.set(p);
  }

  protected escolherEan(gtin: string): void {
    this.escolhido.set(null);
    this.escolhidoEan.set(gtin);
  }

  protected digitar(evento: Event): void {
    this.termo.set((evento.target as HTMLInputElement).value);
  }

  protected async vincular(): Promise<void> {
    const destino = this.destino();
    if (!destino) return;
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const r = await this.service.vincular(this.dados.produto.id, destino);
      if (r.ok) this.ref.close(true);
      else this.erro.set(MENSAGENS[r.erro.codigo] ?? 'Não foi possível ligar os produtos.');
    } catch {
      this.erro.set('Não foi possível ligar os produtos agora.');
    } finally {
      this.salvando.set(false);
    }
  }
}
