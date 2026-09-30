import {
  Injectable,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { Nota } from '@shared/model';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { RELOGIO } from '../../../core/relogio';
import { HistoricoPessoalStore } from '../../notas/data-access/historico-pessoal.store';
import { NotasService } from '../../notas/data-access/notas.service';
import { Grupos, chaveDoGrupo } from '../../notas/detalhe/historico-pessoal';
import { ListasService } from '../data-access/listas.service';
import { ListasStore } from '../data-access/listas.store';
import {
  AcaoFinalizacao,
  Ajustes,
  Item,
  MAX_NOTAS_POR_LISTA,
  alternarAdicionado,
  comAjustes,
  conciliar,
  confirmarPar,
  desfazerPar,
  faltantes,
  gruposAprendidos,
  ligarManual,
  planoDeFinalizacao,
  podeLerOutraNota,
  resumoDaConferencia,
} from '../lista';

interface Alvo {
  id: string;
  chave: string;
}

const SEM_GRUPOS: Grupos = new Map();

/**
 * RF-10/RF-11: a nota em cima da lista. A conciliação automática vira o ponto de partida dos
 * ajustes (`linkedSignal`), que só recomeçam quando muda a nota ou o conjunto de itens livres.
 */
@Injectable()
export class ConferenciaStore {
  private readonly service = inject(ListasService);
  private readonly listas = inject(ListasStore);
  private readonly notasService = inject(NotasService);
  private readonly historico = inject(HistoricoPessoalStore);
  private readonly relogio = inject(RELOGIO);

  private readonly alvo = signal<Alvo | null>(null);

  private readonly estadoLista = toSignal(
    toObservable(this.alvo).pipe(
      switchMap((a) =>
        a
          ? this.service.lista$(a.id).pipe(
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
    toObservable(this.alvo).pipe(
      switchMap((a) =>
        a
          ? this.service.itens$(a.id).pipe(
              map((r) => r.itens),
              catchError(() => of([] as Item[])),
              startWith(undefined),
            )
          : of(undefined),
      ),
    ),
    { initialValue: undefined },
  );
  private readonly estadoNota = toSignal(
    toObservable(this.alvo).pipe(
      switchMap((a) =>
        a
          ? this.notasService.obter(a.chave).pipe(
              map((nota) => ({ nota })),
              catchError(() => of({ nota: null as Nota | null })),
              startWith(undefined),
            )
          : of(undefined),
      ),
    ),
    { initialValue: undefined },
  );

  readonly lista = computed(() => this.estadoLista()?.lista ?? null);
  readonly itens = computed(() => this.estadoItens() ?? []);
  readonly nota = computed(() => this.estadoNota()?.nota ?? null);
  readonly chave = computed(() => this.alvo()?.chave ?? '');

  private readonly grupos = resource({
    params: () => this.nota() ?? undefined,
    loader: ({ params }) => this.historico.gruposDaNota(params),
  });
  private readonly gruposProntos = computed(() =>
    this.grupos.hasValue() ? this.grupos.value() : this.grupos.error() ? SEM_GRUPOS : null,
  );

  readonly carregando = computed(
    () =>
      this.estadoLista() === undefined ||
      this.estadoItens() === undefined ||
      this.estadoNota() === undefined ||
      (!!this.nota() && !this.gruposProntos()),
  );
  readonly listaNaoEncontrada = computed(() => !!this.estadoLista() && !this.lista());
  /** RF-15: a nota não existe (ou foi excluída). */
  readonly notaAusente = computed(() => !!this.estadoNota() && !this.nota());

  private readonly _salvo = signal(false);
  /** A nota já está em `notas` da lista: mostra o que foi gravado (modo leitura). */
  readonly jaConferida = computed(
    () => this._salvo() || !!this.lista()?.notas.includes(this.chave()),
  );
  readonly salvo = this._salvo.asReadonly();
  readonly limiteDeNotas = computed(() => {
    const l = this.lista();
    return !!l && !this.jaConferida() && l.notas.length >= MAX_NOTAS_POR_LISTA;
  });

  /** Itens que esta nota ligou (modo leitura), a partir do retrato gravado no item. */
  readonly ligadosANota = computed(() =>
    this.itens().filter((i) => i.vinculo?.chave === this.chave()),
  );

  private readonly automatica = computed(() => {
    const nota = this.nota();
    const grupos = this.gruposProntos();
    return nota && grupos && this.lista() ? conciliar(this.itens(), nota, grupos) : null;
  });
  private readonly base = computed(() => {
    const livres = this.itens()
      .filter((i) => !i.vinculo)
      .map((i) => `${i.id}:${i.texto}:${i.grupo}`)
      .join('|');
    return this.automatica() ? `${this.nota()!.chave}#${livres}` : '';
  });
  private readonly _ajustes = linkedSignal<string, Ajustes | null>({
    source: this.base,
    computation: () => {
      const c = untracked(this.automatica);
      return c ? comAjustes(c) : null;
    },
  });
  readonly ajustes = this._ajustes.asReadonly();
  readonly resumo = computed(() => {
    const c = this._ajustes();
    const nota = this.nota();
    return c && nota ? resumoDaConferencia(c, nota, c.adicionados) : null;
  });
  readonly temFaltantes = computed(() => faltantes(this.itens()).length > 0);
  readonly podeLerOutra = computed(() => {
    const l = this.lista();
    return !!l && podeLerOutraNota(l, this.itens());
  });

  abrir(id: string, chave: string): void {
    const a = this.alvo();
    if (a?.id === id && a.chave === chave) return;
    this._salvo.set(false);
    this.alvo.set({ id, chave });
  }

  confirmar(itemId: string): void {
    this.ajustar((c) => confirmarPar(c, itemId));
  }

  desfazer(itemId: string): void {
    this.ajustar((c) => desfazerPar(c, itemId));
  }

  ligar(itemId: string, n: number): void {
    this.ajustar((c) => ligarManual(c, itemId, n));
  }

  alternarAdicionado(n: number): void {
    this.ajustar((c) => alternarAdicionado(c, n));
  }

  /** Grava sem esperar o servidor; a tela passa para a finalização. */
  salvar(): void {
    const a = this.alvo();
    const c = this._ajustes();
    const lista = this.lista();
    const nota = this.nota();
    const grupos = this.gruposProntos();
    if (!a || !c || !lista || !nota || !grupos) return;
    const gravado = this.service.salvarConferencia(a.id, {
      lista,
      itens: this.itens(),
      nota,
      pares: c.comprados,
      aprendidos: gruposAprendidos(c.comprados, grupos),
      deFora: c.adicionados.map((n) => ({ nota: n, grupo: chaveDoGrupo(n.produtoId, grupos) })),
    });
    this.listas.avisarFalha(gravado, 'Não foi possível salvar a conferência.');
    this._salvo.set(true);
  }

  finalizar(acao: AcaoFinalizacao): void {
    const a = this.alvo();
    const lista = this.lista();
    if (!a || !lista) return;
    const ops = planoDeFinalizacao(acao, lista, this.itens(), this.relogio().toISOString());
    this.listas.avisarFalha(
      this.service.finalizar(a.id, ops),
      'Não foi possível concluir a compra.',
    );
  }

  private ajustar(f: (c: Ajustes) => Ajustes): void {
    const c = this._ajustes();
    if (c) this._ajustes.set(f(c));
  }
}
