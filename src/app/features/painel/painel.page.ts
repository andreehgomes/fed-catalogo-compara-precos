import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { NotasService } from '../notas/data-access/notas.service';
import { intervaloDe } from '../notas/lista/periodo';
import { PendentesBloco } from '../notas/ui/pendentes-bloco';
import { ProdutosService } from '../produtos/data-access/produtos.service';
import { HoraDeRepor } from './hora-de-repor';
import { economiaPotencial, totalDe, variacao } from './painel.calculos';

@Component({
  selector: 'cp-painel',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    EmptyState,
    HoraDeRepor,
    MatIconModule,
    PendentesBloco,
    RouterLink,
  ],
  templateUrl: './painel.page.html',
  styleUrl: './painel.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PainelPage {
  private readonly notas = inject(NotasService);
  private readonly produtos = inject(ProdutosService);
  private readonly auth = inject(AuthStore);

  protected readonly nome = computed(() => this.auth.usuario()?.displayName?.split(' ')[0] ?? null);

  protected readonly dados = resource({
    loader: async () => {
      const [mes, anterior, ultimas] = await Promise.all([
        this.notas.todas(intervaloDe('mes', null, null)),
        this.notas.todas(intervaloDe('mes-passado', null, null)),
        this.notas.listar({}),
      ]);
      const ids = mes.flatMap((n) => n.itens.map((i) => i.produtoId));
      const produtos = await this.produtos.produtosPorIds(ids).catch(() => new Map());
      const total = totalDe(mes);
      const totalAnterior = totalDe(anterior);
      return {
        total,
        totalAnterior,
        variacao: variacao(total, totalAnterior),
        economia: economiaPotencial(mes, produtos),
        qtdNotasMes: mes.length,
        ultimas: ultimas.notas.slice(0, 5),
      };
    },
  });

  protected readonly valor = computed(() => (this.dados.hasValue() ? this.dados.value() : null));
  protected readonly semNotas = computed(() => this.valor()?.ultimas.length === 0);
}
