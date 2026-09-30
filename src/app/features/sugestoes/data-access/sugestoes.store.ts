import { Injectable, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth.store';
import { RELOGIO } from '../../../core/relogio';
import { ListasService } from '../../listas/data-access/listas.service';
import { HistoricoPessoalStore } from '../../notas/data-access/historico-pessoal.store';
import {
  Horizonte,
  ItemDaLista,
  MIN_OCASIOES,
  Sugestao,
  agruparPorMaisBarato,
  contarRecorrentes,
  montarCestas,
  sugerir,
  totaisDaLista,
} from '../sugestao';
import { DispensadosService } from './dispensados.service';

export const ITENS_NO_PAINEL = 5;

const NENHUM: ReadonlySet<string> = new Set();

/**
 * Sugestão de compra (D-01): tudo no cliente, sobre o índice do histórico pessoal. Só lê as
 * notas do usuário e os grupos de `produtos`; nada é gravado no Firestore.
 */
@Injectable({ providedIn: 'root' })
export class SugestoesStore {
  private readonly historico = inject(HistoricoPessoalStore);
  private readonly auth = inject(AuthStore);
  private readonly relogio = inject(RELOGIO);
  private readonly dispensados = inject(DispensadosService);
  private readonly listas = inject(ListasService);

  private readonly dados = resource({
    params: () => {
      const uid = this.auth.uid();
      return uid ? { uid, versao: this.historico.versao() } : undefined;
    },
    loader: () => this.historico.indiceCompleto(),
  });

  /** Só a tela da sugestão pede (o card do painel não precisa ler as listas). */
  private readonly versaoNaLista = signal(0);
  private readonly gruposNaLista = resource({
    params: () => {
      const uid = this.auth.uid();
      const versao = this.versaoNaLista();
      return uid && versao ? { uid, versao } : undefined;
    },
    loader: () => this.listas.gruposNasListas(),
  });
  /** RF-16: grupos que já estão numa lista (sem vínculo com nota); o último lido na releitura. */
  readonly naLista = linkedSignal<ReadonlySet<string> | undefined, ReadonlySet<string>>({
    source: () => (this.gruposNaLista.hasValue() ? this.gruposNaLista.value() : undefined),
    computation: (atual, anterior) => atual ?? anterior?.value ?? NENHUM,
  }).asReadonly();

  private readonly _horizonte = signal<Horizonte>('semana');
  readonly horizonte = this._horizonte.asReadonly();

  private readonly indice = computed(() => (this.dados.hasValue() ? this.dados.value() : null));

  private readonly todas = computed(() => {
    const d = this.indice();
    return d
      ? sugerir(d.indice, this.relogio(), this._horizonte(), this.dispensados.dispensados())
      : [];
  });

  /** Confiança baixa entra na lista marcada: com pouco histórico, é tudo o que há. */
  readonly repor = computed(() => this.todas().filter((s) => s.estado === 'repor'));
  readonly emBreve = computed(() => this.todas().filter((s) => s.estado === 'em-breve'));
  readonly parou = computed(() => this.todas().filter((s) => s.estado === 'parou'));
  readonly ocultos = computed(() => {
    const d = this.indice();
    if (!d) return [];
    return [...this.dispensados.nunca()].flatMap((grupo) => {
      const c = d.indice.get(grupo)?.[0];
      return c ? [{ grupo, descricao: c.descricao }] : [];
    });
  });
  readonly horaDeRepor = computed(() => this.repor().slice(0, ITENS_NO_PAINEL));

  private readonly listaveis = computed(() => this.todas().filter((s) => s.estado !== 'parou'));

  /** Itens do "Próximo mês", para indicar o horizonte quando o atual não tem nada. */
  readonly noProximoMes = computed(() => {
    const d = this.indice();
    if (!d || this._horizonte() === 'mes') return 0;
    return sugerir(d.indice, this.relogio(), 'mes', this.dispensados.dispensados()).filter(
      (s) => s.estado !== 'parou',
    ).length;
  });

  /**
   * Reinicia quando o horizonte muda; senão guarda as escolhas e marca só os itens novos. O que
   * já está numa lista não entra marcado, e sai da seleção quando passa a estar numa lista.
   */
  private readonly _selecao = linkedSignal<
    { horizonte: Horizonte; lista: Sugestao[]; naLista: ReadonlySet<string> },
    ReadonlySet<string>
  >({
    source: () => ({
      horizonte: this._horizonte(),
      lista: this.listaveis(),
      naLista: this.naLista(),
    }),
    computation: (src, anterior) => {
      const foraDeLista = (s: Sugestao) => !src.naLista.has(s.grupo);
      if (!anterior || anterior.source.horizonte !== src.horizonte) {
        return new Set(src.lista.filter(foraDeLista).map((s) => s.grupo));
      }
      const antes = new Set(anterior.source.lista.map((s) => s.grupo));
      const novoNaLista = (s: Sugestao) =>
        src.naLista.has(s.grupo) && !anterior.source.naLista.has(s.grupo);
      return new Set(
        src.lista
          .filter((s) =>
            !antes.has(s.grupo) ? foraDeLista(s) : anterior.value.has(s.grupo) && !novoNaLista(s),
          )
          .map((s) => s.grupo),
      );
    },
  });
  readonly selecao = this._selecao.asReadonly();

  private readonly _quantidades = linkedSignal<Sugestao[], ReadonlyMap<string, number>>({
    source: this.listaveis,
    computation: (lista, anterior) =>
      new Map(lista.map((s) => [s.grupo, anterior?.value.get(s.grupo) ?? s.quantidade.valor])),
  });
  readonly quantidades = this._quantidades.asReadonly();

  readonly selecionados = computed<ItemDaLista[]>(() =>
    this.listaveis()
      .filter((s) => this._selecao().has(s.grupo))
      .map((sugestao) => ({
        sugestao,
        quantidade: this._quantidades().get(sugestao.grupo)!,
      })),
  );
  readonly totais = computed(() => totaisDaLista(this.selecionados()));
  readonly porMercado = computed(() => agruparPorMaisBarato(this.selecionados()));
  readonly cestas = computed(() => montarCestas(this.selecionados()));

  readonly carregando = computed(() => this.dados.isLoading());
  readonly erro = computed(() => !!this.dados.error());
  /** RF-17: menos de 3 notas na janela ou nenhum produto recorrente. */
  readonly insuficiente = computed(() => {
    const d = this.indice();
    return !!d && (d.notas.length < MIN_OCASIOES || contarRecorrentes(d.indice) === 0);
  });

  definirHorizonte(h: Horizonte): void {
    this._horizonte.set(h);
  }

  alternar(grupo: string): void {
    const s = new Set(this._selecao());
    if (!s.delete(grupo)) s.add(grupo);
    this._selecao.set(s);
  }

  definirQuantidade(grupo: string, n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this._quantidades.set(new Map(this._quantidades()).set(grupo, n));
  }

  marcarJaTenho(grupo: string): void {
    this.dispensados.marcarJaTenho(grupo, this.relogio());
  }

  naoSugerir(grupo: string): void {
    this.dispensados.naoSugerir(grupo);
  }

  voltarASugerir(grupo: string): void {
    this.dispensados.voltarASugerir(grupo);
  }

  recarregar(): void {
    this.dados.reload();
  }

  /** Relê os grupos que estão em listas (ao abrir a tela e depois de mexer numa lista). */
  recarregarNaLista(): void {
    this.versaoNaLista.update((v) => v + 1);
  }
}
