import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import type { Nota } from '@shared/model';
import type { DocumentSnapshot } from 'firebase/firestore';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HistoricoPessoalStore } from '../data-access/historico-pessoal.store';
import { NotasAbertasService } from '../data-access/notas-abertas.service';
import { FiltroNotas, NotasService, PaginaNotas } from '../data-access/notas.service';
import { PendentesBloco } from '../ui/pendentes-bloco';
import { PERIODOS, Periodo, intervaloDe } from './periodo';

@Component({
  selector: 'cp-notas-lista',
  imports: [CurrencyPipe, DatePipe, EmptyState, MatIconModule, PendentesBloco, RouterLink],
  templateUrl: './notas-lista.page.html',
  styleUrl: './notas-lista.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class NotasListaPage {
  private readonly service = inject(NotasService);
  private readonly router = inject(Router);
  private readonly historico = inject(HistoricoPessoalStore);
  protected readonly abertas = inject(NotasAbertasService);

  readonly cnpj = input<string>();
  readonly periodo = input<string>();
  readonly de = input<string>();
  readonly ate = input<string>();

  protected readonly periodos = PERIODOS;

  private readonly filtro = computed<FiltroNotas>(() => ({
    cnpj: this.cnpj() || null,
    ...intervaloDe(this.periodo(), this.de(), this.ate()),
  }));
  protected readonly filtrando = computed(() => !!(this.cnpj() || this.periodo()));

  private readonly primeira = resource<PaginaNotas, FiltroNotas>({
    params: () => this.filtro(),
    loader: ({ params }) => this.service.listar(params),
  });
  protected readonly estabelecimentos = resource({ loader: () => this.service.estabelecimentos() });

  private readonly extras = linkedSignal<FiltroNotas, Nota[]>({
    source: this.filtro,
    computation: () => [],
  });
  private readonly cursor = linkedSignal<FiltroNotas, DocumentSnapshot | null | undefined>({
    source: this.filtro,
    computation: () => undefined,
  });
  private readonly _temMais = linkedSignal<FiltroNotas, boolean | undefined>({
    source: this.filtro,
    computation: () => undefined,
  });
  protected readonly carregandoMais = signal(false);

  protected readonly carregando = computed(() => this.primeira.isLoading());
  protected readonly erro = computed(() => !!this.primeira.error());
  protected readonly notas = computed(() => [
    ...(this.primeira.hasValue() ? this.primeira.value().notas : []),
    ...this.extras(),
  ]);
  /** Saldo de cada nota contra a última compra de cada item; falha só esconde o valor. */
  private readonly resumos = resource({
    params: () => this.notas(),
    loader: ({ params }) => this.historico.resumir(params),
  });
  protected readonly saldos = computed(() => {
    const r = this.resumos.hasValue() ? this.resumos.value() : null;
    return new Map(
      [...(r ?? [])].filter(([, v]) => v.comparados > 0).map(([chave, v]) => [chave, v.saldo]),
    );
  });
  protected readonly temMais = computed(
    () => this._temMais() ?? (this.primeira.hasValue() && this.primeira.value().temMais),
  );

  protected async carregarMais(): Promise<void> {
    if (this.carregandoMais() || !this.temMais() || !this.primeira.hasValue()) return;
    this.carregandoMais.set(true);
    try {
      const cursor = this.cursor() ?? this.primeira.value().cursor;
      const pagina = await this.service.listar({ ...this.filtro(), cursor });
      this.extras.update((atual) => [...atual, ...pagina.notas]);
      this.cursor.set(pagina.cursor);
      this._temMais.set(pagina.temMais);
    } finally {
      this.carregandoMais.set(false);
    }
  }

  protected filtrarEstabelecimento(evento: Event): void {
    this.navegar({ cnpj: (evento.target as HTMLSelectElement).value || null });
  }

  protected filtrarPeriodo(p: Periodo | null): void {
    this.navegar({ periodo: this.periodo() === p ? null : p, de: null, ate: null });
  }

  protected definirData(campo: 'de' | 'ate', evento: Event): void {
    this.navegar({
      periodo: 'personalizado',
      [campo]: (evento.target as HTMLInputElement).value || null,
    });
  }

  protected limpar(): void {
    this.navegar({ cnpj: null, periodo: null, de: null, ate: null });
  }

  protected recarregar(): void {
    this.primeira.reload();
  }

  private navegar(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
