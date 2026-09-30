import { Injectable, inject } from '@angular/core';
import type { ItemLista, ItemNota, ListaCompras, Nota } from '@shared/model';
import type { DocumentReference, Query, WriteBatch } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { FIRESTORE_API } from '../../../core/firebase/firestore-api';
import { FIRESTORE } from '../../../core/firebase/firestore.token';
import { RELOGIO } from '../../../core/relogio';
import {
  Adicao,
  Item,
  ItemNovo,
  Lista,
  MAX_ITENS,
  MAX_LISTAS,
  Operacao,
  Par,
  contadores,
  itemDe,
  planejarAdicao,
  vinculoDe,
} from '../lista';

export interface ItensDaLista {
  itens: Item[];
  /** Há escrita local ainda não confirmada pelo servidor (offline). */
  pendenteNoServidor: boolean;
}

/** Escrita que a UI não aguarda: `gravado` só resolve quando o servidor confirma. */
export interface Gravacao {
  gravado: Promise<void>;
}

export interface Criacao extends Gravacao {
  id: string;
  foraDoLimite: number;
}

export interface Conferencia {
  lista: Lista;
  itens: readonly Item[];
  nota: Pick<Nota, 'chave' | 'cnpj' | 'estabelecimentoNome'>;
  pares: readonly Par[];
  /** itemId → grupo aprendido (itens digitados que ganharam par). */
  aprendidos: ReadonlyMap<string, string>;
  /** Itens de fora da lista acrescentados já ligados à nota, com o grupo do produto. */
  deFora: readonly { nota: ItemNota; grupo: string }[];
}

/**
 * `usuarios/{uid}/listas/{id}` e `…/itens/{itemId}` (D-01, D-02): o cliente lê e grava direto,
 * com o cache persistente. As escritas devolvem a promessa do `commit()` sem esperar: offline
 * ela só resolve quando a conexão volta, e o `onSnapshot` local já mostra a mudança.
 */
@Injectable({ providedIn: 'root' })
export class ListasService {
  private readonly db = inject(FIRESTORE);
  private readonly api = inject(FIRESTORE_API);
  private readonly auth = inject(AuthStore);
  private readonly relogio = inject(RELOGIO);

  private base(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Sem usuário');
    return `usuarios/${uid}/listas`;
  }

  private refLista(id: string): DocumentReference {
    return this.api.doc(this.db, `${this.base()}/${id}`);
  }

  private refItem(id: string, itemId: string): DocumentReference {
    return this.api.doc(this.db, `${this.base()}/${id}/itens/${itemId}`);
  }

  private novoItemRef(id: string): DocumentReference {
    return this.api.doc(this.api.collection(this.db, `${this.base()}/${id}/itens`));
  }

  private agora(): string {
    return this.relogio().toISOString();
  }

  private lote(): WriteBatch {
    return this.api.writeBatch(this.db);
  }

  private queryItens(id: string): Query {
    return this.api.query(
      this.api.collection(this.db, `${this.base()}/${id}/itens`),
      this.api.orderBy('ordem'),
    );
  }

  listas$(): Observable<Lista[]> {
    const q = this.api.query(
      this.api.collection(this.db, this.base()),
      this.api.orderBy('atualizadaEm', 'desc'),
      this.api.limit(MAX_LISTAS + 1),
    );
    return new Observable<Lista[]>((sub) =>
      this.api.onSnapshot(
        q,
        (snap) => sub.next(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ListaCompras) }))),
        (erro) => sub.error(erro),
      ),
    );
  }

  lista$(id: string): Observable<Lista | null> {
    return new Observable<Lista | null>((sub) =>
      this.api.onSnapshot(
        this.refLista(id),
        (snap) =>
          sub.next(snap.exists() ? { id: snap.id, ...(snap.data() as ListaCompras) } : null),
        (erro) => sub.error(erro),
      ),
    );
  }

  itens$(id: string): Observable<ItensDaLista> {
    return new Observable<ItensDaLista>((sub) =>
      this.api.onSnapshot(
        this.queryItens(id),
        { includeMetadataChanges: true },
        (snap) =>
          sub.next({
            itens: snap.docs.map((d) => ({ id: d.id, ...(d.data() as ItemLista) })),
            pendenteNoServidor: snap.metadata.hasPendingWrites,
          }),
        (erro) => sub.error(erro),
      ),
    );
  }

  /** Itens de uma lista que não está aberta na tela (vem do cache quando offline). */
  async itens(id: string): Promise<Item[]> {
    const snap = await this.api.getDocs(this.queryItens(id));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ItemLista) }));
  }

  criar(nome: string, novos: readonly ItemNovo[]): Criacao {
    const ref = this.api.doc(this.api.collection(this.db, this.base()));
    const adicao = planejarAdicao([], novos);
    const agora = this.agora();
    const lote = this.lote();
    const cabecalho: ListaCompras = {
      nome,
      status: 'aberta',
      criadaEm: agora,
      atualizadaEm: agora,
      ...contadores(adicao.novos),
      ultimaCompraEm: null,
      notas: [],
      pendentes: [],
    };
    lote.set(ref, cabecalho);
    for (const item of adicao.novos) lote.set(this.novoItemRef(ref.id), item);
    return { id: ref.id, foraDoLimite: adicao.foraDoLimite, gravado: lote.commit() };
  }

  renomear(id: string, nome: string): Promise<void> {
    return this.api.updateDoc(this.refLista(id), { nome, atualizadaEm: this.agora() });
  }

  /** Apaga os itens antes da lista, num batch só (D-02). */
  async excluir(id: string): Promise<void> {
    const itens = await this.itens(id);
    const lote = this.lote();
    for (const i of itens) lote.delete(this.refItem(id, i.id));
    lote.delete(this.refLista(id));
    await lote.commit();
  }

  adicionar(
    id: string,
    novos: readonly ItemNovo[],
    existentes: readonly Item[],
  ): Gravacao & { adicao: Adicao } {
    const adicao = planejarAdicao(existentes, novos);
    const lote = this.lote();
    for (const [itemId, dados] of adicao.somar) lote.update(this.refItem(id, itemId), dados);
    for (const item of adicao.novos) lote.set(this.novoItemRef(id), item);
    lote.update(this.refLista(id), {
      ...contadores([...existentes, ...adicao.novos]),
      atualizadaEm: this.agora(),
    });
    return { adicao, gravado: lote.commit() };
  }

  marcar(id: string, item: Item, marcado: boolean, itens: readonly Item[]): Promise<void> {
    const agora = this.agora();
    const lote = this.lote();
    lote.update(this.refItem(id, item.id), { marcado, marcadoEm: marcado ? agora : null });
    lote.update(this.refLista(id), {
      ...contadores(itens.map((i) => (i.id === item.id ? { marcado } : i))),
      atualizadaEm: agora,
    });
    return lote.commit();
  }

  editar(id: string, itemId: string, dados: Partial<ItemLista>): Promise<void> {
    const lote = this.lote();
    lote.update(this.refItem(id, itemId), dados);
    lote.update(this.refLista(id), { atualizadaEm: this.agora() });
    return lote.commit();
  }

  remover(id: string, item: Item, itens: readonly Item[]): Promise<void> {
    const lote = this.lote();
    lote.delete(this.refItem(id, item.id));
    lote.update(this.refLista(id), {
      ...contadores(itens.filter((i) => i.id !== item.id)),
      atualizadaEm: this.agora(),
    });
    return lote.commit();
  }

  /** "Desfazer" da remoção: regrava o item com o mesmo id. */
  restaurar(id: string, item: Item, itens: readonly Item[]): Promise<void> {
    const { id: itemId, ...dados } = item;
    const lote = this.lote();
    lote.set(this.refItem(id, itemId), dados);
    lote.update(this.refLista(id), {
      ...contadores([...itens.filter((i) => i.id !== itemId), item]),
      atualizadaEm: this.agora(),
    });
    return lote.commit();
  }

  desmarcarTudo(id: string, itens: readonly Item[]): Promise<void> {
    const lote = this.lote();
    for (const i of itens.filter((x) => x.marcado)) {
      lote.update(this.refItem(id, i.id), { marcado: false, marcadoEm: null });
    }
    lote.update(this.refLista(id), { qtdMarcados: 0, atualizadaEm: this.agora() });
    return lote.commit();
  }

  /**
   * RF-11: vínculo e marcação nos itens ligados, grupo aprendido nos digitados, itens de fora da
   * lista acrescentados já ligados, e a chave em `notas` (saindo de `pendentes`).
   */
  salvarConferencia(id: string, c: Conferencia): Promise<void> {
    const agora = this.agora();
    const lote = this.lote();
    const marcados = new Set<string>();
    for (const par of c.pares) {
      marcados.add(par.item.id);
      const grupo = c.aprendidos.get(par.item.id);
      lote.update(this.refItem(id, par.item.id), {
        vinculo: vinculoDe(par, c.nota),
        marcado: true,
        marcadoEm: par.item.marcadoEm ?? agora,
        ...(grupo ? { grupo } : {}),
      });
    }
    let ordem = Math.max(0, ...c.itens.map((i) => i.ordem));
    const cabem = Math.max(0, MAX_ITENS - c.itens.length);
    const deFora = c.deFora.slice(0, cabem);
    for (const f of deFora) {
      const item = itemDe(
        {
          texto: f.nota.descricao,
          grupo: f.grupo,
          quantidade: f.nota.qtd,
          unidade: f.nota.unidade,
          base: null,
          origem: 'nota',
        },
        ++ordem,
      );
      lote.set(this.novoItemRef(id), {
        ...item,
        marcado: true,
        marcadoEm: agora,
        vinculo: vinculoDe({ nota: f.nota, como: 'manual' }, c.nota),
      });
    }
    const itens = c.itens.map((i) => (marcados.has(i.id) ? { marcado: true } : i));
    const pendentes = c.lista.pendentes.filter((p) => p !== c.nota.chave);
    lote.update(this.refLista(id), {
      ...contadores([...itens, ...deFora.map(() => ({ marcado: true }))]),
      notas: [...new Set([...c.lista.notas, c.nota.chave])],
      pendentes,
      status: pendentes.length ? 'aguardando-nota' : 'aberta',
      atualizadaEm: agora,
    });
    return lote.commit();
  }

  /** RF-12: a nota foi para a fila da SEFAZ; a lista espera por ela. */
  aguardarNota(id: string, chave: string): Promise<void> {
    return this.api.updateDoc(this.refLista(id), {
      status: 'aguardando-nota',
      pendentes: this.api.arrayUnion(chave),
      atualizadaEm: this.agora(),
    });
  }

  /** Nota da fila que falhou: a lista volta a ficar aberta. */
  esquecerPendente(lista: Lista, chave: string): Promise<void> {
    const pendentes = lista.pendentes.filter((p) => p !== chave);
    return this.api.updateDoc(this.refLista(lista.id), {
      pendentes,
      status: pendentes.length ? 'aguardando-nota' : 'aberta',
      atualizadaEm: this.agora(),
    });
  }

  finalizar(id: string, operacoes: readonly Operacao[]): Promise<void> {
    const lote = this.lote();
    for (const o of operacoes) {
      const ref = o.itemId === null ? this.refLista(id) : this.refItem(id, o.itemId);
      if (o.tipo === 'delete') lote.delete(ref);
      else lote.update(ref, o.dados);
    }
    return lote.commit();
  }

  /** RF-16: grupos que já estão em alguma lista (≤ `MAX_LISTAS` consultas). */
  async gruposNasListas(): Promise<Set<string>> {
    const listas = await this.api.getDocs(this.api.collection(this.db, this.base()));
    const itens = await Promise.all(listas.docs.map((d) => this.itens(d.id)));
    return new Set(itens.flat().flatMap((i) => (i.grupo && !i.vinculo ? [i.grupo] : [])));
  }
}
