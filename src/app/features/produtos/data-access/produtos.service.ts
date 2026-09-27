import { Injectable, inject } from '@angular/core';
import { normalizarGtin, tokens } from '@shared/index';
import type { Estabelecimento, Preco, Produto, ProdutoId } from '@shared/model';
import { CHAMAR_FUNCTION } from '../../../core/firebase/callable';
import { FIRESTORE_API } from '../../../core/firebase/firestore-api';
import { FIRESTORE } from '../../../core/firebase/firestore.token';

export const LIMITE_BUSCA = 30;
export const LIMITE_IN = 30;
export const JANELA_PRECOS_DIAS = 90;
export const LIMITE_PRECOS = 300;

export interface PrecoComId extends Preco {
  id: string;
  /** Chave da nota de origem (o id do preço é `{chave}_{n}`). */
  chave: string;
}

export type RespostaVinculo =
  { ok: true; canonico: ProdutoId } | { ok: false; erro: { codigo: string } };

export function emGrupos<T>(lista: readonly T[], tamanho = LIMITE_IN): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) grupos.push(lista.slice(i, i + tamanho));
  return grupos;
}

/**
 * Token mais específico do termo: o maior sem dígito (medidas são pouco seletivas). A
 * consulta usa `array-contains` nele e os demais tokens são filtrados no cliente.
 */
export function tokenMaisRaro(lista: readonly string[]): string | null {
  const semDigito = lista.filter((t) => !/\d/.test(t));
  const base = semDigito.length ? semDigito : lista;
  return [...base].sort((a, b) => b.length - a.length || a.localeCompare(b))[0] ?? null;
}

/** Base comunitária: `produtos`, `precos` e `estabelecimentos` (só leitura no cliente). */
@Injectable({ providedIn: 'root' })
export class ProdutosService {
  private readonly db = inject(FIRESTORE);
  private readonly api = inject(FIRESTORE_API);
  private readonly chamar = inject(CHAMAR_FUNCTION);

  async buscar(texto: string): Promise<Produto[]> {
    const gtin = /^[\d\s-]+$/.test(texto.trim()) ? normalizarGtin(texto) : null;
    if (gtin) {
      const p = await this.obter(`ean:${gtin}`);
      return p ? [p] : [];
    }
    const termos = tokens(texto);
    const principal = tokenMaisRaro(termos);
    if (!principal) return [];
    const snap = await this.api.getDocs(
      this.api.query(
        this.api.collection(this.db, 'produtos'),
        this.api.where('tokens', 'array-contains', principal),
        this.api.limit(LIMITE_BUSCA),
      ),
    );
    return snap.docs
      .map((d) => d.data() as Produto)
      .filter((p) => termos.every((t) => p.tokens.includes(t)));
  }

  async obter(id: string): Promise<Produto | null> {
    const snap = await this.api.getDoc(this.api.doc(this.db, `produtos/${id}`));
    return snap.exists() ? (snap.data() as Produto) : null;
  }

  /** O produto, o canônico e todos os vinculados ao canônico. */
  async equivalentes(id: string): Promise<Produto[]> {
    const produto = await this.obter(id);
    if (!produto) return [];
    const canonicoId = produto.vinculadoA ?? produto.id;
    const [canonico, snap] = await Promise.all([
      canonicoId === produto.id ? Promise.resolve(produto) : this.obter(canonicoId),
      this.api.getDocs(
        this.api.query(
          this.api.collection(this.db, 'produtos'),
          this.api.where('vinculadoA', '==', canonicoId),
        ),
      ),
    ]);
    const todos = new Map<string, Produto>();
    for (const p of [canonico, produto, ...snap.docs.map((d) => d.data() as Produto)]) {
      if (p) todos.set(p.id, p);
    }
    return [...todos.values()];
  }

  async precos(ids: readonly string[], desde = this.desde()): Promise<PrecoComId[]> {
    const resultados = await Promise.all(
      emGrupos([...new Set(ids)]).map((grupo) =>
        this.api.getDocs(
          this.api.query(
            this.api.collection(this.db, 'precos'),
            this.api.where('produtoId', 'in', grupo),
            this.api.where('emissao', '>=', desde),
            this.api.orderBy('emissao', 'desc'),
            this.api.limit(LIMITE_PRECOS),
          ),
        ),
      ),
    );
    return resultados
      .flatMap((s) =>
        s.docs.map((d) => ({ ...(d.data() as Preco), id: d.id, chave: d.id.split('_')[0] })),
      )
      .sort((a, b) => b.emissao.localeCompare(a.emissao));
  }

  async produtosPorIds(ids: readonly string[]): Promise<Map<string, Produto>> {
    const mapa = new Map<string, Produto>();
    const grupos = await Promise.all(
      emGrupos([...new Set(ids)]).map((grupo) =>
        this.api.getDocs(
          this.api.query(
            this.api.collection(this.db, 'produtos'),
            this.api.where(this.api.documentId(), 'in', grupo),
          ),
        ),
      ),
    );
    for (const s of grupos) for (const d of s.docs) mapa.set(d.id, d.data() as Produto);
    return mapa;
  }

  async estabelecimentosPorCnpj(cnpjs: readonly string[]): Promise<Map<string, Estabelecimento>> {
    const mapa = new Map<string, Estabelecimento>();
    const grupos = await Promise.all(
      emGrupos([...new Set(cnpjs)]).map((grupo) =>
        this.api.getDocs(
          this.api.query(
            this.api.collection(this.db, 'estabelecimentos'),
            this.api.where(this.api.documentId(), 'in', grupo),
          ),
        ),
      ),
    );
    for (const s of grupos) for (const d of s.docs) mapa.set(d.id, d.data() as Estabelecimento);
    return mapa;
  }

  vincular(origem: string, destino: string): Promise<RespostaVinculo> {
    return this.chamar<RespostaVinculo>('vincularProduto', { origem, destino });
  }

  desvincular(id: string): Promise<RespostaVinculo> {
    return this.chamar<RespostaVinculo>('desvincularProduto', { id });
  }

  private desde(): string {
    return new Date(Date.now() - JANELA_PRECOS_DIAS * 86_400_000).toISOString();
  }
}
