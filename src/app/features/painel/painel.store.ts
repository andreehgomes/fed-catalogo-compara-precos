import { Injectable, computed, inject, linkedSignal, resource } from '@angular/core';
import { BreakpointService } from '../../core/layout/breakpoint.service';
import { RELOGIO } from '../../core/relogio';
import {
  HistoricoPessoalStore,
  JanelaComparada,
} from '../notas/data-access/historico-pessoal.store';
import { NotasService } from '../notas/data-access/notas.service';
import { intervaloDe } from '../notas/lista/periodo';
import {
  EscolhaMes,
  barrasPorCompra,
  destaquesDoPeriodo,
  gastoPorMercado,
  mediaDosFechados,
  mesDe,
  mesDeReferencia,
  mesesComNota,
  ondeMaisGasta,
  precosQueSubiram,
  resumoDoPeriodo,
  seriesPorMes,
  variacaoComparavel,
} from './painel.calculos';

export const QTD_ULTIMAS = 5;

/** Estado do painel (provido na página): últimas notas rápidas e o resto sobre o histórico pessoal. */
@Injectable()
export class PainelStore {
  private readonly notas = inject(NotasService);
  private readonly historico = inject(HistoricoPessoalStore);
  private readonly breakpoint = inject(BreakpointService);
  private readonly relogio = inject(RELOGIO);

  readonly ultimas = resource({
    loader: async () => (await this.notas.listar({})).notas.slice(0, QTD_ULTIMAS),
  });
  private readonly saldosUltimas = resource({
    params: () => (this.ultimas.hasValue() ? this.ultimas.value() : undefined),
    loader: ({ params }) => this.historico.resumir(params),
  });
  readonly janela = resource<JanelaComparada, number>({
    params: () => this.historico.versao(),
    loader: () => this.historico.comparacoesDaJanela(),
  });

  /** Saldo das últimas notas; só as que têm item comparável. Falha só esconde o saldo. */
  readonly saldos = computed(() => {
    const r = this.saldosUltimas.hasValue() ? this.saldosUltimas.value() : null;
    return new Map(
      [...(r ?? [])].filter(([, v]) => v.comparados > 0).map(([chave, v]) => [chave, v.saldo]),
    );
  });
  readonly semNotas = computed(() => this.ultimas.hasValue() && !this.ultimas.value().length);

  private readonly comparadas = computed(() =>
    this.janela.hasValue() ? this.janela.value().notas : [],
  );
  private readonly todasNotas = computed(() => this.comparadas().map((c) => c.nota));
  /** Relido a cada carga do histórico. */
  private readonly hoje = computed(() => {
    this.comparadas();
    return this.relogio();
  });

  private readonly _escolha = linkedSignal<unknown, EscolhaMes>({
    source: this.comparadas,
    computation: () => 'atual',
  });
  readonly escolha = this._escolha.asReadonly();

  /** O seletor só faz sentido quando o mês atual já tem nota (senão "atual" já mostra o anterior). */
  readonly podeEscolher = computed(() =>
    this.todasNotas().some((n) => mesDe(n.emissao) === mesDe(this.hoje().toISOString())),
  );
  readonly mes = computed(() =>
    mesDeReferencia(this.todasNotas(), this.hoje(), this.podeEscolher() ? this.escolha() : 'atual'),
  );
  readonly mesAtual = computed(() => this.mes() === mesDe(this.hoje().toISOString()));

  private readonly doMes = computed(() => {
    const mes = this.mes();
    return mes ? this.comparadas().filter((c) => mesDe(c.nota.emissao) === mes) : [];
  });
  readonly resumo = computed(() => resumoDoPeriodo(this.doMes()));
  readonly variacao = computed(() => {
    const mes = this.mes();
    return mes ? variacaoComparavel(this.todasNotas(), mes, this.hoje()) : null;
  });

  readonly porCompra = computed(() => mesesComNota(this.todasNotas()) < 2);
  readonly barras = computed(() =>
    seriesPorMes(this.comparadas(), this.hoje(), this.breakpoint.estreito() ? 6 : 12),
  );
  readonly barrasCompra = computed(() => barrasPorCompra(this.comparadas()));
  readonly media = computed(() => mediaDosFechados(this.barras()));
  readonly mercados = computed(() => gastoPorMercado(this.doMes().map((c) => c.nota)));
  readonly destaques = computed(() => destaquesDoPeriodo(this.doMes()));
  readonly altas = computed(() =>
    this.janela.hasValue() ? precosQueSubiram(this.janela.value().indice.indice) : [],
  );
  readonly maioresGastos = computed(() => {
    if (!this.janela.hasValue()) return [];
    const { de } = intervaloDe('3-meses', null, null, this.hoje());
    const notas = this.todasNotas().filter((n) => !de || n.emissao >= de);
    return ondeMaisGasta(notas, this.janela.value().indice.grupos);
  });

  escolher(escolha: EscolhaMes): void {
    this._escolha.set(escolha);
  }
}
