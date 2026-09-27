import { Injectable, inject } from '@angular/core';
import type { Nota, NotaResumo } from '@shared/model';
import type { DocumentSnapshot, QueryConstraint } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { FIRESTORE_API } from '../../../core/firebase/firestore-api';
import { FIRESTORE } from '../../../core/firebase/firestore.token';

export const TAMANHO_PAGINA_NOTAS = 20;

export interface FiltroNotas {
  cnpj?: string | null;
  /** ISO, inclusivo. */
  de?: string | null;
  /** ISO, exclusivo. */
  ate?: string | null;
  cursor?: DocumentSnapshot | null;
}

export interface PaginaNotas {
  notas: Nota[];
  cursor: DocumentSnapshot | null;
  temMais: boolean;
}

export interface EstabelecimentoDoUsuario {
  cnpj: string;
  nome: string;
}

/** Área privada: `usuarios/{uid}/notas`. O cliente lê e exclui; nunca grava (regras). */
@Injectable({ providedIn: 'root' })
export class NotasService {
  private readonly db = inject(FIRESTORE);
  private readonly api = inject(FIRESTORE_API);
  private readonly auth = inject(AuthStore);

  private caminho(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Sem usuário');
    return `usuarios/${uid}/notas`;
  }

  async listar(filtro: FiltroNotas = {}): Promise<PaginaNotas> {
    const { where, orderBy, limit, startAfter } = this.api;
    const restricoes: QueryConstraint[] = [];
    if (filtro.cnpj) restricoes.push(where('cnpj', '==', filtro.cnpj));
    if (filtro.de) restricoes.push(where('emissao', '>=', filtro.de));
    if (filtro.ate) restricoes.push(where('emissao', '<', filtro.ate));
    restricoes.push(orderBy('emissao', 'desc'));
    if (filtro.cursor) restricoes.push(startAfter(filtro.cursor));
    restricoes.push(limit(TAMANHO_PAGINA_NOTAS));
    const snap = await this.api.getDocs(
      this.api.query(this.api.collection(this.db, this.caminho()), ...restricoes),
    );
    const docs = snap.docs;
    return {
      notas: docs.map((d) => d.data() as Nota),
      cursor: docs.at(-1) ?? null,
      temMais: docs.length === TAMANHO_PAGINA_NOTAS,
    };
  }

  /** Nota em tempo real (null quando não existe ou foi excluída). */
  obter(chave: string): Observable<Nota | null> {
    return new Observable<Nota | null>((sub) =>
      this.api.onSnapshot(
        this.api.doc(this.db, `${this.caminho()}/${chave}`),
        (snap) => sub.next(snap.exists() ? (snap.data() as Nota) : null),
        (erro) => sub.error(erro),
      ),
    );
  }

  async excluir(chave: string): Promise<void> {
    await this.api.deleteDoc(this.api.doc(this.db, `${this.caminho()}/${chave}`));
  }

  /** Todas as notas do filtro (até 10 páginas), para totais do painel. */
  async todas(filtro: Omit<FiltroNotas, 'cursor'> = {}, maxPaginas = 10): Promise<Nota[]> {
    const notas: Nota[] = [];
    let cursor: DocumentSnapshot | null = null;
    for (let i = 0; i < maxPaginas; i++) {
      const pagina = await this.listar({ ...filtro, cursor });
      notas.push(...pagina.notas);
      if (!pagina.temMais) break;
      cursor = pagina.cursor;
    }
    return notas;
  }

  /** Chaves das últimas 200 notas do usuário (para marcar preços como "minhas-notas"). */
  async chaves(): Promise<Set<string>> {
    const snap = await this.api.getDocs(
      this.api.query(
        this.api.collection(this.db, this.caminho()),
        this.api.orderBy('emissao', 'desc'),
        this.api.limit(200),
      ),
    );
    return new Set(snap.docs.map((d) => d.id));
  }

  /** Estabelecimentos das últimas 200 notas, para o filtro da lista. */
  async estabelecimentos(): Promise<EstabelecimentoDoUsuario[]> {
    const snap = await this.api.getDocs(
      this.api.query(
        this.api.collection(this.db, this.caminho()),
        this.api.orderBy('emissao', 'desc'),
        this.api.limit(200),
      ),
    );
    const vistos = new Map<string, string>();
    for (const d of snap.docs) {
      const n = d.data() as NotaResumo;
      if (!vistos.has(n.cnpj)) vistos.set(n.cnpj, n.estabelecimentoNome);
    }
    return [...vistos]
      .map(([cnpj, nome]) => ({ cnpj, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
