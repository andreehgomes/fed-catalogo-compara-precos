import { Injectable, inject } from '@angular/core';
import type { Nota, Produto } from '@shared/model';
import { AuthStore } from '../../../core/auth/auth.store';
import { ProdutosService } from '../../produtos/data-access/produtos.service';
import {
  ComparacaoHistorico,
  ResumoHistorico,
  compararNota,
  consolidarItens,
  indexarCompras,
  montarGrupos,
  resumirHistorico,
} from '../detalhe/historico-pessoal';
import { NotasService } from './notas.service';

export const JANELA_HISTORICO_MESES = 12;
export const MAX_PAGINAS_HISTORICO = 20;

interface CacheNotas {
  uid: string;
  desde: string;
  notas: Promise<Nota[]>;
}

export function inicioDaJanela(agora = new Date()): string {
  const d = new Date(agora);
  d.setMonth(d.getMonth() - JANELA_HISTORICO_MESES);
  return d.toISOString();
}

/**
 * Histórico pessoal (D-01): as notas dos últimos 12 meses são lidas uma vez por sessão e o
 * índice produto → compras é montado no cliente. Nada é gravado.
 */
@Injectable({ providedIn: 'root' })
export class HistoricoPessoalStore {
  private readonly notasService = inject(NotasService);
  private readonly produtos = inject(ProdutosService);
  private readonly auth = inject(AuthStore);

  private cache: CacheNotas | null = null;
  private readonly produtosCache = new Map<string, Produto | null>();
  private readonly membrosCache = new Map<string, Produto[]>();
  /** Chaves que já provocaram uma releitura: evita reler a cada abertura se passar de 400 notas. */
  private readonly recarregadas = new Set<string>();

  async comparar(nota: Nota): Promise<Map<number, ComparacaoHistorico>> {
    const notas = await this.notasCom([nota]);
    const grupos = await this.grupos([nota]);
    return compararNota(nota, indexarCompras(notas, grupos), grupos);
  }

  /** Resumo "comparado com a última vez" de várias notas (lista), numa leitura só. */
  async resumir(alvo: readonly Nota[]): Promise<Map<string, ResumoHistorico>> {
    if (!alvo.length) return new Map();
    const notas = await this.notasCom(alvo);
    const grupos = await this.grupos(alvo);
    const indice = indexarCompras(notas, grupos);
    return new Map(
      alvo.map((n) => [
        n.chave,
        resumirHistorico(consolidarItens(n.itens), compararNota(n, indice, grupos)),
      ]),
    );
  }

  invalidar(): void {
    this.cache = null;
    this.produtosCache.clear();
    this.membrosCache.clear();
  }

  /** Relê uma vez se alguma nota da janela ainda não está no cache (chegou depois da leitura). */
  private async notasCom(alvo: readonly Nota[]): Promise<Nota[]> {
    const notas = await this.notas();
    const chaves = new Set(notas.map((n) => n.chave));
    const novas = alvo.filter(
      (n) =>
        !chaves.has(n.chave) && n.emissao >= this.cache!.desde && !this.recarregadas.has(n.chave),
    );
    if (!novas.length) return notas;
    for (const n of novas) this.recarregadas.add(n.chave);
    this.cache = null;
    return this.notas();
  }

  private notas(): Promise<Nota[]> {
    const uid = this.auth.uid();
    if (!uid) return Promise.reject(new Error('Sem usuário'));
    if (this.cache?.uid !== uid) {
      if (this.cache) this.recarregadas.clear();
      const desde = inicioDaJanela();
      const notas = this.notasService.todas({ de: desde }, MAX_PAGINAS_HISTORICO);
      const cache: CacheNotas = { uid, desde, notas };
      notas.catch(() => {
        if (this.cache === cache) this.cache = null;
      });
      this.cache = cache;
    }
    return this.cache.notas;
  }

  private async grupos(notas: readonly Nota[]): Promise<Map<string, string>> {
    const ids = [...new Set(notas.flatMap((n) => n.itens.map((i) => i.produtoId as string)))];
    const faltando = ids.filter((id) => !this.produtosCache.has(id));
    if (faltando.length) {
      const achados = await this.produtos.produtosPorIds(faltando);
      for (const id of faltando) this.produtosCache.set(id, achados.get(id) ?? null);
    }
    const daNota = new Map<string, Produto>();
    for (const id of ids) {
      const p = this.produtosCache.get(id);
      if (p) daNota.set(id, p);
    }

    const canonicos = [...new Set([...daNota.values()].map((p) => p.vinculadoA ?? p.id))];
    const semMembros = canonicos.filter((c) => !this.membrosCache.has(c));
    if (semMembros.length) {
      const membros = await this.produtos.membrosDosGrupos(semMembros);
      for (const c of semMembros) this.membrosCache.set(c, []);
      for (const m of membros) if (m.vinculadoA) this.membrosCache.get(m.vinculadoA)?.push(m);
    }
    return montarGrupos(
      daNota,
      canonicos.flatMap((c) => this.membrosCache.get(c) ?? []),
    );
  }
}
