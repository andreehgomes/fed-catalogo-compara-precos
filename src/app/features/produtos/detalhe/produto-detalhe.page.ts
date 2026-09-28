import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import type { Produto } from '@shared/model';
import { firstValueFrom } from 'rxjs';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import { GraficoHistorico } from '../../../shared/ui/grafico-historico/grafico-historico';
import { BreakpointService } from '../../../core/layout/breakpoint.service';
import { NotasService } from '../../notas/data-access/notas.service';
import { ProdutosService } from '../data-access/produtos.service';
import { DadosVinculo, VincularDialog } from '../vincular/vincular-dialog';
import { PrecosPerto } from './precos-perto';
import { limitarSeries, resumirPrecos } from './resumo';

export const OBSERVACOES_VISIVEIS = 10;

interface DadosProduto {
  produto: Produto;
  equivalentes: Produto[];
  resumo: ReturnType<typeof resumirPrecos>;
}

@Component({
  selector: 'cp-produto-detalhe',
  imports: [
    BadgePreco,
    CurrencyPipe,
    DatePipe,
    EmptyState,
    FontePrecoInfo,
    GraficoHistorico,
    MatIconModule,
    PrecosPerto,
    RouterLink,
  ],
  templateUrl: './produto-detalhe.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProdutoDetalhePage {
  private readonly service = inject(ProdutosService);
  private readonly notas = inject(NotasService);
  protected readonly estreito = inject(BreakpointService).estreito;
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly id = input.required<string>();

  protected readonly dados = resource<DadosProduto | null, string>({
    params: () => this.id(),
    loader: async ({ params }) => {
      const equivalentes = await this.service.equivalentes(params);
      const produto = equivalentes.find((p) => p.id === params);
      if (!produto) return null;
      const [precos, chaves] = await Promise.all([
        this.service.precos(equivalentes.map((p) => p.id)),
        this.notas.chaves().catch(() => new Set<string>()),
      ]);
      const estabelecimentos = await this.service.estabelecimentosPorCnpj(
        precos.map((p) => p.cnpj),
      );
      return { produto, equivalentes, resumo: resumirPrecos(precos, estabelecimentos, chaves) };
    },
  });

  protected readonly valor = computed(() => (this.dados.hasValue() ? this.dados.value() : null));
  protected readonly todasObservacoes = signal(false);
  protected readonly observacoes = computed(() => {
    const lista = this.valor()?.resumo?.observacoes ?? [];
    return this.todasObservacoes() ? lista : lista.slice(0, OBSERVACOES_VISIVEIS);
  });
  protected readonly series = computed(() => limitarSeries(this.valor()?.resumo?.series ?? []));
  protected readonly ean = computed(
    () => this.valor()?.equivalentes.find((p) => p.ean)?.ean ?? null,
  );
  protected readonly outros = computed(() =>
    (this.valor()?.equivalentes ?? []).filter((p) => p.id !== this.id()),
  );

  protected async vincular(): Promise<void> {
    const v = this.valor();
    if (!v) return;
    const data: DadosVinculo = { produto: v.produto, excluir: v.equivalentes.map((p) => p.id) };
    const ok = await firstValueFrom(
      this.dialog.open(VincularDialog, { data, width: '520px', maxWidth: '95vw' }).afterClosed(),
    );
    if (ok) {
      this.snack.open('Produtos ligados. A comparação já considera os dois.', 'OK', {
        duration: 4000,
      });
      this.dados.reload();
    }
  }

  protected async desvincular(): Promise<void> {
    const r = await this.service.desvincular(this.id());
    this.snack.open(r.ok ? 'Vínculo removido.' : 'Não foi possível remover o vínculo.', 'OK', {
      duration: 3000,
    });
    if (r.ok) this.dados.reload();
  }
}
