import { Injectable, inject } from '@angular/core';
import type { Estabelecimento, Preco, Produto } from '@shared/model';
import type { DocumentSnapshot } from 'firebase/firestore';
import { FIRESTORE_API } from '../../../core/firebase/firestore-api';
import { FIRESTORE } from '../../../core/firebase/firestore.token';
import { ProdutosService } from '../../produtos/data-access/produtos.service';

export const TAMANHO_PAGINA_ESTABELECIMENTOS = 30;
export const LIMITE_PRECOS_ESTABELECIMENTO = 50;

export interface PaginaEstabelecimentos {
  itens: Estabelecimento[];
  cursor: DocumentSnapshot | null;
  temMais: boolean;
}

export interface ProdutoRecente {
  produto: Produto | null;
  produtoId: string;
  preco: Preco;
}

@Injectable({ providedIn: 'root' })
export class EstabelecimentosService {
  private readonly db = inject(FIRESTORE);
  private readonly api = inject(FIRESTORE_API);
  private readonly produtos = inject(ProdutosService);

  async listar(cursor: DocumentSnapshot | null = null): Promise<PaginaEstabelecimentos> {
    const { orderBy, limit, startAfter } = this.api;
    const snap = await this.api.getDocs(
      this.api.query(
        this.api.collection(this.db, 'estabelecimentos'),
        orderBy('atualizadoEm', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(TAMANHO_PAGINA_ESTABELECIMENTOS),
      ),
    );
    return {
      itens: snap.docs.map((d) => d.data() as Estabelecimento),
      cursor: snap.docs.at(-1) ?? null,
      temMais: snap.docs.length === TAMANHO_PAGINA_ESTABELECIMENTOS,
    };
  }

  async obter(cnpj: string): Promise<Estabelecimento | null> {
    const snap = await this.api.getDoc(this.api.doc(this.db, `estabelecimentos/${cnpj}`));
    return snap.exists() ? (snap.data() as Estabelecimento) : null;
  }

  /** RF-21: produtos com o preço mais recente no estabelecimento, um por produto. */
  async produtosRecentes(cnpj: string): Promise<ProdutoRecente[]> {
    const snap = await this.api.getDocs(
      this.api.query(
        this.api.collection(this.db, 'precos'),
        this.api.where('cnpj', '==', cnpj),
        this.api.orderBy('emissao', 'desc'),
        this.api.limit(LIMITE_PRECOS_ESTABELECIMENTO),
      ),
    );
    const porProduto = new Map<string, Preco>();
    for (const d of snap.docs) {
      const p = d.data() as Preco;
      if (!porProduto.has(p.produtoId)) porProduto.set(p.produtoId, p);
    }
    const produtos = await this.produtos.produtosPorIds([...porProduto.keys()]);
    return [...porProduto].map(([produtoId, preco]) => ({
      produtoId,
      preco,
      produto: produtos.get(produtoId) ?? null,
    }));
  }
}
