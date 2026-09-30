import { Provider, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { Nota, Pendente } from '@shared/model';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthStore } from '../app/core/auth/auth.store';
import { FIRESTORE_API } from '../app/core/firebase/firestore-api';
import { FIRESTORE } from '../app/core/firebase/firestore.token';
import { ConexaoService } from '../app/core/layout/conexao.service';
import { RELOGIO } from '../app/core/relogio';
import type { Item, Lista } from '../app/features/listas/lista';
import { HistoricoPessoalStore } from '../app/features/notas/data-access/historico-pessoal.store';
import { NotasService } from '../app/features/notas/data-access/notas.service';
import { PendentesService } from '../app/features/notas/data-access/pendentes.service';
import type { CompraPessoal, Grupos } from '../app/features/notas/detalhe/historico-pessoal';
import { FirestoreFalso, firestoreFalso } from './firestore-falso';

export const AGORA_LISTA = new Date('2026-09-30T12:00:00.000Z');
export const BASE_LISTAS = 'usuarios/u1/listas';

/** Snackbar falso: registra as mensagens e deixa o teste clicar na ação ("Desfazer", "Abrir"). */
export function snackFalso() {
  const acoes: Subject<void>[] = [];
  const open = vi.fn(() => {
    const acao = new Subject<void>();
    acoes.push(acao);
    return { onAction: () => acao.asObservable() };
  });
  return {
    open,
    /** Clica na ação do último snackbar aberto. */
    agir() {
      acoes.at(-1)!.next();
    },
    ultima: () => (open.mock.calls.at(-1) as unknown[] | undefined)?.[0],
  };
}

/** Diálogo falso: cada `open` devolve o próximo resultado da fila. */
export function dialogFalso(resultados: unknown[] = []) {
  const fila = [...resultados];
  return { open: vi.fn(() => ({ afterClosed: () => of(fila.shift()) })) };
}

export function gravarLista(fs: FirestoreFalso, lista: Lista, itens: Item[] = []): void {
  const { id, ...dados } = lista;
  fs.gravar(`${BASE_LISTAS}/${id}`, dados);
  for (const { id: itemId, ...i } of itens) fs.gravar(`${BASE_LISTAS}/${id}/itens/${itemId}`, i);
}

export interface CenarioListas {
  fs: FirestoreFalso;
  snack: ReturnType<typeof snackFalso>;
  dialog: ReturnType<typeof dialogFalso>;
  historico: {
    indiceCompleto: ReturnType<typeof vi.fn>;
    gruposDaNota: ReturnType<typeof vi.fn>;
    versao: ReturnType<typeof signal<number>>;
    invalidar: ReturnType<typeof vi.fn>;
  };
  notas: Map<string, BehaviorSubject<Nota | null>>;
  pendentes: ReturnType<typeof signal<Pendente[]>>;
  online: ReturnType<typeof signal<boolean>>;
  providers: Provider[];
}

/**
 * Providers da feature de listas sobre o Firestore falso: service e stores reais; histórico,
 * notas, pendentes, conexão, snackbar e diálogo falsos.
 */
export function cenarioListas(
  opcoes: {
    indice?: Map<string, CompraPessoal[]>;
    grupos?: Grupos;
    dialogos?: unknown[];
  } = {},
): CenarioListas {
  const fs = firestoreFalso();
  const snack = snackFalso();
  const dialog = dialogFalso(opcoes.dialogos);
  const notas = new Map<string, BehaviorSubject<Nota | null>>();
  const historico = {
    indiceCompleto: vi.fn(async () => ({
      notas: [],
      grupos: new Map(),
      indice: opcoes.indice ?? new Map(),
    })),
    gruposDaNota: vi.fn(async () => opcoes.grupos ?? new Map()),
    versao: signal(0),
    invalidar: vi.fn(),
  };
  const pendentes = signal<Pendente[]>([]);
  const online = signal(true);
  const obter = (chave: string): Observable<Nota | null> => {
    if (!notas.has(chave)) notas.set(chave, new BehaviorSubject<Nota | null>(null));
    return notas.get(chave)!.asObservable();
  };
  return {
    fs,
    snack,
    dialog,
    historico,
    notas,
    pendentes,
    online,
    providers: [
      { provide: FIRESTORE, useValue: {} },
      { provide: FIRESTORE_API, useValue: fs.api },
      { provide: AuthStore, useValue: { uid: signal('u1') } },
      { provide: RELOGIO, useValue: () => AGORA_LISTA },
      { provide: MatSnackBar, useValue: snack },
      { provide: MatDialog, useValue: dialog },
      { provide: HistoricoPessoalStore, useValue: historico },
      { provide: NotasService, useValue: { obter } },
      { provide: PendentesService, useValue: { pendentes } },
      { provide: ConexaoService, useValue: { online } },
    ],
  };
}
