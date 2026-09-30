import { Injectable, computed, inject, resource, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { ItemLista } from '@shared/model';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { ConexaoService } from '../../../core/layout/conexao.service';
import { RELOGIO } from '../../../core/relogio';
import { HistoricoPessoalStore } from '../../notas/data-access/historico-pessoal.store';
import { NotasService } from '../../notas/data-access/notas.service';
import { PendentesService } from '../../notas/data-access/pendentes.service';
import type { CompraPessoal } from '../../notas/detalhe/historico-pessoal';
import {
  AcaoFinalizacao,
  Item,
  ItemNovo,
  autocompletar,
  compraConferida,
  estimativa,
  itemDoHistorico,
  planoDeFinalizacao,
  precoDeReferencia,
  progresso,
  separar,
  textoDaLista,
} from '../lista';
import { ListasService } from './listas.service';
import { ListasStore } from './listas.store';

const SEM_HISTORICO: ReadonlyMap<string, readonly CompraPessoal[]> = new Map();

/**
 * A lista aberta na tela (RF-02, RF-05 a RF-08, RF-12). Provida na página: `abrir(id)` liga os
 * `onSnapshot` da lista e dos itens. As ações gravam sem esperar o servidor (offline primeiro).
 */
@Injectable()
export class ListaStore {
  private readonly service = inject(ListasService);
  private readonly listas = inject(ListasStore);
  private readonly historico = inject(HistoricoPessoalStore);
  private readonly auth = inject(AuthStore);
  private readonly snack = inject(MatSnackBar);
  private readonly conexao = inject(ConexaoService);
  private readonly notas = inject(NotasService);
  private readonly pendentes = inject(PendentesService);
  private readonly relogio = inject(RELOGIO);

  private readonly _id = signal<string | null>(null);
  readonly id = this._id.asReadonly();

  private readonly estadoLista = toSignal(
    toObservable(this._id).pipe(
      switchMap((id) =>
        id
          ? this.service.lista$(id).pipe(
              map((lista) => ({ lista })),
              catchError(() => of({ lista: null })),
              startWith(undefined),
            )
          : of(undefined),
      ),
    ),
    { initialValue: undefined },
  );
  private readonly estadoItens = toSignal(
    toObservable(this._id).pipe(
      switchMap((id) =>
        id
          ? this.service.itens$(id).pipe(
              catchError(() => of({ itens: [] as Item[], pendenteNoServidor: false })),
              startWith(undefined),
            )
          : of(undefined),
      ),
    ),
    { initialValue: undefined },
  );

  readonly lista = computed(() => this.estadoLista()?.lista ?? null);
  readonly carregando = computed(
    () => this.estadoLista() === undefined || (!!this.lista() && this.estadoItens() === undefined),
  );
  readonly naoEncontrada = computed(() => !!this.estadoLista() && !this.lista());
  readonly itens = computed(() => this.estadoItens()?.itens ?? []);
  readonly pendenteNoServidor = computed(() => !!this.estadoItens()?.pendenteNoServidor);
  readonly offline = computed(() => !this.conexao.online());
  readonly separados = computed(() => separar(this.itens()));
  readonly progresso = computed(() => progresso(this.itens()));
  readonly conferida = computed(() => {
    const l = this.lista();
    return !!l && compraConferida(l, this.itens());
  });

  private readonly querHistorico = signal(false);
  private readonly historicoRes = resource({
    params: () =>
      this.auth.uid() && (this.querHistorico() || this.itens().some((i) => !!i.grupo))
        ? { versao: this.historico.versao() }
        : undefined,
    loader: () => this.historico.indiceCompleto(),
  });
  /** Índice do histórico só depois que é pedido (RNF-01); vazio enquanto isso ou em erro. */
  readonly indice = computed(() =>
    this.historicoRes.hasValue() ? this.historicoRes.value().indice : SEM_HISTORICO,
  );
  readonly estimativa = computed(() => estimativa(this.itens(), this.indice()));
  readonly referencias = computed(
    () =>
      new Map(
        this.itens().flatMap((i) => {
          const p = precoDeReferencia(i, this.indice());
          return p ? [[i.id, p] as const] : [];
        }),
      ),
  );

  /** RF-12: chaves pendentes cuja nota já chegou. */
  readonly notasChegadas = toSignal(
    toObservable(
      computed(() => {
        const l = this.lista();
        return l?.status === 'aguardando-nota' ? l.pendentes.join(',') : '';
      }),
    ).pipe(
      distinctUntilChanged(),
      switchMap((chaves) =>
        chaves
          ? combineLatest(
              chaves.split(',').map((c) =>
                this.notas.obter(c).pipe(
                  map((n) => (n ? c : null)),
                  catchError(() => of(null)),
                ),
              ),
            )
          : of([]),
      ),
      map((cs) => cs.filter((c): c is string => !!c)),
    ),
    { initialValue: [] as string[] },
  );
  /** RF-12: pendentes da lista que a fila desistiu de importar. */
  readonly pendentesFalhos = computed(() => {
    const chaves = this.lista()?.pendentes ?? [];
    return this.pendentes
      .pendentes()
      .filter((p) => p.status === 'falhou' && chaves.includes(p.chave))
      .map((p) => p.chave);
  });

  abrir(id: string): void {
    this._id.set(id);
  }

  carregarHistorico(): void {
    this.querHistorico.set(true);
  }

  sugestoesDe(texto: string) {
    return autocompletar(texto, this.indice());
  }

  adicionarTexto(texto: string): void {
    this.adicionar([
      { texto, grupo: null, quantidade: null, unidade: null, base: null, origem: 'manual' },
    ]);
  }

  adicionarDoHistorico(grupo: string): void {
    const compras = this.indice().get(grupo);
    if (compras?.length) this.adicionar([itemDoHistorico(grupo, compras)]);
  }

  marcar(item: Item, marcado: boolean): void {
    this.gravarMarcacao(item, marcado);
    this.snack
      .open(
        marcado ? `${item.texto} no carrinho` : `${item.texto} voltou para a lista`,
        'Desfazer',
        { duration: 4000 },
      )
      .onAction()
      .subscribe(() => this.gravarMarcacao(item, !marcado));
  }

  editar(item: Item, dados: Partial<ItemLista>): void {
    const id = this._id();
    if (!id) return;
    this.falha(this.service.editar(id, item.id, dados), 'Não foi possível salvar o item.');
  }

  remover(item: Item): void {
    const id = this._id();
    if (!id) return;
    this.falha(this.service.remover(id, item, this.itens()), 'Não foi possível remover o item.');
    this.snack
      .open(`${item.texto} removido`, 'Desfazer', { duration: 5000 })
      .onAction()
      .subscribe(() =>
        this.falha(
          this.service.restaurar(id, item, this.itens()),
          'Não foi possível desfazer a remoção.',
        ),
      );
  }

  desmarcarTudo(): void {
    const id = this._id();
    if (!id) return;
    this.falha(this.service.desmarcarTudo(id, this.itens()), 'Não foi possível desmarcar.');
  }

  renomear(nome: string): void {
    const id = this._id();
    if (id) this.listas.renomear(id, nome);
  }

  excluir(): void {
    const id = this._id();
    if (id) this.listas.excluir(id);
  }

  finalizar(acao: AcaoFinalizacao): void {
    const id = this._id();
    const lista = this.lista();
    if (!id || !lista) return;
    const ops = planoDeFinalizacao(acao, lista, this.itens(), this.relogio().toISOString());
    this.falha(this.service.finalizar(id, ops), 'Não foi possível concluir a compra.');
  }

  esquecerPendente(chave: string): void {
    const lista = this.lista();
    if (lista) this.falha(this.service.esquecerPendente(lista, chave), 'Não foi possível salvar.');
  }

  textoParaCompartilhar(): string {
    const lista = this.lista();
    return lista ? textoDaLista(lista, this.itens()) : '';
  }

  private adicionar(novos: ItemNovo[]): void {
    const id = this._id();
    if (!id) return;
    const { adicao, gravado } = this.service.adicionar(id, novos, this.itens());
    this.falha(gravado, 'Não foi possível adicionar o item.');
    if (adicao.foraDoLimite) {
      this.snack.open('A lista chegou a 150 itens.', 'OK', { duration: 4000 });
    }
  }

  private gravarMarcacao(item: Item, marcado: boolean): void {
    const id = this._id();
    if (!id) return;
    this.falha(
      this.service.marcar(id, item, marcado, this.itens()),
      'Não foi possível salvar a marcação.',
    );
  }

  private falha(gravado: Promise<unknown>, mensagem: string): void {
    this.listas.avisarFalha(gravado, mensagem);
  }
}
