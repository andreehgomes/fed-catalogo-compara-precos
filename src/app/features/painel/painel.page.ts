import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { SaldoNota } from '../../shared/ui/saldo-nota/saldo-nota';
import { PendentesBloco } from '../notas/ui/pendentes-bloco';
import { HoraDeRepor } from './hora-de-repor';
import { PainelStore } from './painel.store';
import { DestaquesPrecos } from './ui/destaques-precos';
import { GastoPorMercado } from './ui/gasto-por-mercado';
import { GraficoMeses } from './ui/grafico-meses';
import { ListaEmAndamento } from './ui/lista-em-andamento';
import { OndeMaisGasta } from './ui/onde-mais-gasta';
import { PrecosQueSubiram } from './ui/precos-que-subiram';
import { ResumoMes } from './ui/resumo-mes';

@Component({
  selector: 'cp-painel',
  imports: [
    CurrencyPipe,
    DatePipe,
    DestaquesPrecos,
    EmptyState,
    GastoPorMercado,
    GraficoMeses,
    HoraDeRepor,
    ListaEmAndamento,
    MatIconModule,
    OndeMaisGasta,
    PendentesBloco,
    PrecosQueSubiram,
    ResumoMes,
    RouterLink,
    SaldoNota,
  ],
  providers: [PainelStore],
  templateUrl: './painel.page.html',
  styleUrl: './painel.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PainelPage {
  private readonly auth = inject(AuthStore);
  protected readonly store = inject(PainelStore);

  protected readonly nome = computed(() => this.auth.usuario()?.displayName?.split(' ')[0] ?? null);
}
