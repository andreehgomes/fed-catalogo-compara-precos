import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { catchError, filter, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { RELOGIO } from '../../../core/relogio';
import { ConfirmDialog, DadosConfirmacao } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ItemNovo, Lista, MAX_LISTAS, nomePadrao } from '../lista';
import type { DadosEscolherLista, EscolhaDeLista } from '../ui/escolher-lista-dialog';
import { ListasService } from './listas.service';

export class ListaCheiaError extends Error {
  constructor() {
    super(`Já há ${MAX_LISTAS} listas`);
  }
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** As listas do usuário (cabeçalhos), em tempo real, e as ações que não dependem da lista aberta. */
@Injectable({ providedIn: 'root' })
export class ListasStore {
  private readonly service = inject(ListasService);
  private readonly auth = inject(AuthStore);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly relogio = inject(RELOGIO);

  private readonly estado = toSignal(
    toObservable(this.auth.uid).pipe(
      switchMap((uid) =>
        uid
          ? this.service.listas$().pipe(
              map((listas) => ({ listas, erro: false })),
              catchError(() => of({ listas: [] as Lista[], erro: true })),
              startWith(undefined),
            )
          : of({ listas: [] as Lista[], erro: false }),
      ),
    ),
    { initialValue: undefined },
  );

  private readonly estado$ = toObservable(this.estado);

  readonly listas = computed(() => this.estado()?.listas ?? []);
  readonly carregando = computed(() => this.estado() === undefined);
  readonly erro = computed(() => !!this.estado()?.erro);
  readonly cheia = computed(() => this.listas().length >= MAX_LISTAS);
  /** Painel: a mais recente que já tem item no carrinho, ou a mais recente. */
  readonly emAndamento = computed(() => {
    const l = this.listas();
    return l.find((x) => x.qtdMarcados > 0) ?? l[0] ?? null;
  });

  /** Devolve o id na hora; a gravação segue em segundo plano (offline, fica na fila). */
  criar(itens: readonly ItemNovo[] = [], nome = nomePadrao(this.relogio())): string {
    if (this.cheia()) throw new ListaCheiaError();
    const c = this.service.criar(nome, itens);
    this.avisarFalha(c.gravado, 'Não foi possível criar a lista.');
    if (c.foraDoLimite) this.avisarLimite(c.foraDoLimite);
    return c.id;
  }

  renomear(id: string, nome: string): void {
    this.avisarFalha(this.service.renomear(id, nome), 'Não foi possível renomear a lista.');
  }

  excluir(id: string): void {
    this.avisarFalha(this.service.excluir(id), 'Não foi possível excluir a lista.');
  }

  async pedirNome(atual: string): Promise<string | null> {
    const { RenomearListaDialog } = await import('../ui/renomear-lista-dialog');
    const r = await firstValueFrom(
      this.dialog
        .open(RenomearListaDialog, { data: atual, width: '420px', maxWidth: '95vw' })
        .afterClosed(),
    );
    return r ?? null;
  }

  async confirmarExclusao(nome: string): Promise<boolean> {
    const dados: DadosConfirmacao = {
      titulo: 'Excluir esta lista?',
      mensagem: `"${nome}" e os itens dela saem de todos os seus aparelhos. As notas não mudam.`,
      confirmar: 'Excluir lista',
      perigo: true,
    };
    const ok = await firstValueFrom(
      this.dialog.open(ConfirmDialog, { data: dados, maxWidth: '420px' }).afterClosed(),
    );
    return !!ok;
  }

  async escolher(dados: DadosEscolherLista): Promise<EscolhaDeLista | null> {
    const { EscolherListaDialog } = await import('../ui/escolher-lista-dialog');
    const r = await firstValueFrom(
      this.dialog
        .open(EscolherListaDialog, { data: dados, width: '420px', maxWidth: '95vw' })
        .afterClosed(),
    );
    return r ?? null;
  }

  /**
   * RF-03/RF-04: sem lista cria uma; com uma, adiciona nela; com mais, pergunta. Devolve o id da
   * lista usada, ou `null` se o usuário desistiu.
   */
  async adicionarEmLista(itens: readonly ItemNovo[]): Promise<string | null> {
    await firstValueFrom(this.estado$.pipe(filter((e) => e !== undefined)));
    const listas = this.listas();
    let destino: Lista | undefined = listas.length === 1 ? listas[0] : undefined;
    if (listas.length > 1) {
      const r = await this.escolher({ listas, podeCriar: !this.cheia() });
      if (!r) return null;
      destino = 'id' in r ? listas.find((l) => l.id === r.id) : undefined;
    }
    if (!destino) {
      const id = this.criar(itens);
      this.avisarComAbrir(`Lista criada com ${plural(itens.length, 'item', 'itens')}`, id);
      return id;
    }
    const id = destino.id;
    const existentes = await this.service.itens(id);
    const { adicao, gravado } = this.service.adicionar(id, itens, existentes);
    this.avisarFalha(gravado, 'Não foi possível adicionar à lista.');
    const n = adicao.novos.length + adicao.somar.size;
    this.avisarComAbrir(
      `${plural(n, 'item adicionado', 'itens adicionados')} a ${destino.nome}`,
      id,
    );
    if (adicao.foraDoLimite) this.avisarLimite(adicao.foraDoLimite);
    return id;
  }

  avisarFalha(gravado: Promise<unknown>, mensagem: string): void {
    gravado.catch(() => this.snack.open(mensagem, 'OK', { duration: 4000 }));
  }

  private avisarLimite(fora: number): void {
    this.snack.open(
      `A lista chegou a 150 itens: ${plural(fora, 'item ficou', 'itens ficaram')} de fora.`,
      'OK',
      { duration: 5000 },
    );
  }

  private avisarComAbrir(texto: string, id: string): void {
    this.snack
      .open(texto, 'Abrir', { duration: 5000 })
      .onAction()
      .subscribe(() => void this.router.navigate(['/listas', id]));
  }
}
